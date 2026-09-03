import { Worker, Job } from 'bullmq';
import { redisConfiguration } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../lib/evolution';
import { MessageJobData, queueMessage } from '../lib/queue';
import { getNextWhatsAppInstance, reportChipSuccess, reportChipFailure } from '../lib/chip-router';
import { logger } from '../lib/logger';
import { formatMessageText } from '../lib/spintax';
import './warmup-worker'; // Importa para iniciar o worker de aquecimento junto
import './warmup-pool-worker'; // Importa o worker de pool mútuo
import './scheduler-worker'; // Importa o worker de agendamento de campanhas

logger.info('Iniciando o Worker de Mensagens do WaJato...');

const worker = new Worker(
  'message-queue',
  async (job: Job<MessageJobData>) => {
    const { messageLogId, campaignId, contactId, phone } = job.data;
    logger.info('Processando mensagem no worker', { messageLogId, campaignId, contactId, phone });

    // 1. Busca os detalhes da campanha e do contato
    const log = await prisma.messageLog.findUnique({
      where: { id: messageLogId },
      include: {
        contact: true,
        campaign: {
          include: {
            template: true,
            group: true,
          },
        },
      },
    });

    if (!log) {
      logger.error('Log de mensagem não encontrado no banco', { messageLogId });
      return;
    }

    // Função auxiliar para agendar o próximo disparo da campanha dinamicamente
    const scheduleNextInCampaign = async (delayMs: number) => {
      try {
        const currentCampaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });

        // Se a campanha não estiver em SENDING, interrompe o encadeamento
        if (!currentCampaign || currentCampaign.status !== 'SENDING') {
          logger.info(`[Worker] Campanha ${campaignId} com status "${currentCampaign?.status}". Encadeamento pausado.`);
          return;
        }

        const nextLog = await prisma.messageLog.findFirst({
          where: { campaignId, status: 'PENDING' },
          orderBy: { updatedAt: 'asc' },
          include: { contact: true },
        });

        if (nextLog) {
          logger.info(`[Worker] ⏭️ Próximo contato da campanha agendado em ${Math.round(delayMs / 1000)}s: ${nextLog.contact.name || nextLog.contact.phone}`);
          await queueMessage(
            {
              messageLogId: nextLog.id,
              campaignId,
              contactId: nextLog.contactId,
              phone: nextLog.contact.phone,
            },
            delayMs
          );
        } else {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'COMPLETED' },
          });
          logger.info(`[Worker] 🏁 Campanha ${campaignId} concluída com sucesso! Todos os contatos processados.`);
        }
      } catch (err: any) {
        logger.error('[Worker] Erro ao agendar próximo contato da campanha:', err?.message);
      }
    };

    // 2a. Bloqueia envio se contato está em opt-out
    if (log.contact.optOut) {
      logger.info('Contato em opt-out — envio bloqueado', { contactId, phone, messageLogId });
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: { status: 'FAILED', error: 'Contato em opt-out (não deseja receber mensagens)' },
      });
      await checkAndUpdateCampaignStatus(campaignId);
      await scheduleNextInCampaign(1000);
      return;
    }

    // 2b. Bloqueia reenvio se este contato já recebeu mensagem desta campanha com sucesso
    const alreadySent = await prisma.messageLog.findFirst({
      where: {
        campaignId,
        contactId,
        id: { not: messageLogId },
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
      },
    });
    if (alreadySent) {
      logger.info('Contato já recebeu mensagem nesta campanha — ignorando duplicata', { contactId, phone, campaignId, messageLogId });
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: { status: 'FAILED', error: 'Mensagem já enviada anteriormente nesta campanha' },
      });
      await checkAndUpdateCampaignStatus(campaignId);
      await scheduleNextInCampaign(1000);
      return;
    }

    // 2c. Se a campanha não estiver em andamento (ex: pausada ou cancelada), cancela o envio
    if (log.campaign.status !== 'SENDING') {
      logger.info('Campanha não está ativa, ignorando envio', { campaignId, status: log.campaign.status, messageLogId });
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: { status: 'PENDING', error: 'Campanha não está ativa' },
      });
      return;
    }

    // 2d. Janela de Horários e Dias Permitidos (Pausa Automática Noturna / Fim de Semana)
    const startHour = log.campaign.startHour ?? 8;
    const endHour = log.campaign.endHour ?? 20;
    const allowedDays = log.campaign.allowedDays?.length ? log.campaign.allowedDays : [1, 2, 3, 4, 5, 6];

    // Obtém data e hora atuais no fuso de Brasília (America/Sao_Paulo)
    const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHour = nowBRT.getHours();
    const currentDay = nowBRT.getDay(); // 0 = Dom, 1 = Seg, ..., 6 = Sáb

    const isDayAllowed = allowedDays.includes(currentDay);
    const isHourAllowed = currentHour >= startHour && currentHour < endHour;

    if (!isDayAllowed || !isHourAllowed) {
      // Calcula a data exata da próxima janela válida para retomar
      let nextAllowedDate = new Date(nowBRT);

      if (currentHour >= endHour) {
        // Passou do horário de término de hoje: agenda para o início de amanhã
        nextAllowedDate.setDate(nextAllowedDate.getDate() + 1);
        nextAllowedDate.setHours(startHour, 0, 0, 0);
      } else if (currentHour < startHour) {
        // Antes do horário de início de hoje: agenda para o início de hoje
        nextAllowedDate.setHours(startHour, 0, 0, 0);
      }

      // Se o dia da semana não for permitido, avança dia a dia até encontrar um dia permitido
      while (!allowedDays.includes(nextAllowedDate.getDay())) {
        nextAllowedDate.setDate(nextAllowedDate.getDate() + 1);
        nextAllowedDate.setHours(startHour, 0, 0, 0);
      }

      const delayMs = Math.max(60_000, nextAllowedDate.getTime() - nowBRT.getTime());

      logger.info(
        `🌙 [Janela de Horários] Fora do horário permitido (${startHour}h-${endHour}h). Pausando e reagendando mensagem para ${nextAllowedDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        {
          campaignId,
          messageLogId,
          phone,
          delayMinutes: Math.round(delayMs / 60000),
        }
      );

      // Re-agenda o envio no BullMQ sem marcar falha
      await queueMessage({ messageLogId, campaignId, contactId, phone }, delayMs);
      return;
    }

    // Determina as instâncias permitidas para esta campanha
    const campaignAllowedInstances =
      log.campaign.instanceMode === 'SPECIFIC' && log.campaign.instanceNames?.length > 0
        ? log.campaign.instanceNames
        : null;
    const isOnlyMature = log.campaign.instanceMode !== 'SPECIFIC';

    // 2e. Pre-flight Check Just-in-Time: Valida se o número possui conta ativa no WhatsApp antes de qualquer disparo
    try {
      const probeInstance = await getNextWhatsAppInstance([], campaignAllowedInstances, isOnlyMature);
      if (probeInstance) {
        const waCheck = await evolutionApi.checkWhatsAppNumber(probeInstance, phone);
        if (!waCheck.exists) {
          logger.warn('🚫 [Pre-flight Check] Número sem WhatsApp ativo detectado antes do envio — disparo cancelado e contato marcado!', { phone, contactId, messageLogId });

          // Marca o contato no banco com tag 'sem-whatsapp' e opt-out automático para nunca mais tentar
          const currentTags = log.contact.tags || [];
          const updatedTags = currentTags.includes('sem-whatsapp') ? currentTags : [...currentTags, 'sem-whatsapp'];

          await prisma.contact.update({
            where: { id: contactId },
            data: {
              tags: updatedTags,
              optOut: true,
              optOutAt: new Date(),
            },
          });

          // Registra falha clara no log da campanha
          await prisma.messageLog.update({
            where: { id: messageLogId },
            data: {
              status: 'FAILED',
              error: 'Número de telefone não possui conta ativa no WhatsApp',
            },
          });

          await checkAndUpdateCampaignStatus(campaignId);
          // Número sem WhatsApp não realizou envio no chip! Avança para o próximo contato em apenas 2 segundos!
          await scheduleNextInCampaign(2000);
          return;
        }
      }
    } catch (checkErr: any) {
      logger.warn('[Pre-flight Check] Erro ao verificar WhatsApp (prosseguindo com envio normal):', checkErr?.message);
    }

    // 3. Monta a mensagem interpolando variáveis
    const contactName = log.contact.name || 'Cliente';
    // Se houver {{link}} no template, substitui pela descrição do grupo (onde salvamos o link do grupo)
    const groupLink = log.campaign.group?.description || '';

    // ── 3a. Proteção Anti-Bloqueio (Envio em 2 Etapas / Mensagem Prévia) ──────
    const template = log.campaign.template;
    const hasHookEnabled = template.enableHook && (template.hookMessage || (template.hookVariants && template.hookVariants.length > 0));

    if (hasHookEnabled && log.hookStatus !== 'SENT' && log.hookStatus !== 'REPLIED') {
      const allHooks = [template.hookMessage, ...(template.hookVariants || [])].filter((h): h is string => Boolean(h && h.trim().length > 0));
      const chosenHook = allHooks.length > 0 ? allHooks[Math.floor(Math.random() * allHooks.length)] : 'Olá {{nome}}, tudo bem?';
      const hookText = formatMessageText(chosenHook, { name: contactName, link: groupLink });

      let hookInstanceName = await getNextWhatsAppInstance([], campaignAllowedInstances, isOnlyMature);
      let hookSentSuccess = false;

      try {
        await evolutionApi.sendTextMessage(hookInstanceName, phone, hookText);
        hookSentSuccess = true;
        await reportChipSuccess(hookInstanceName);
        logger.info('🛡️ Mensagem prévia anti-bloqueio enviada!', { messageLogId, phone, instance: hookInstanceName });
      } catch (hookErr: any) {
        logger.warn('Falha no envio da mensagem prévia anti-bloqueio com chip primário, tentando fallback...', { error: hookErr?.message });
        await reportChipFailure(hookInstanceName, hookErr?.message);

        const fallback = await getNextWhatsAppInstance([hookInstanceName], campaignAllowedInstances, isOnlyMature);
        if (fallback && fallback !== hookInstanceName) {
          try {
            await evolutionApi.sendTextMessage(fallback, phone, hookText);
            hookSentSuccess = true;
            await reportChipSuccess(fallback);
          } catch (fbErr: any) {
            await reportChipFailure(fallback, fbErr?.message);
          }
        }
      }

      if (hookSentSuccess) {
        await prisma.messageLog.update({
          where: { id: messageLogId },
          data: {
            hookStatus: 'SENT',
            hookSentAt: new Date(),
          },
        });

        // Se o modo for ON_REPLY, pausa o envio para este contato até ele responder via webhook
        if (template.hookMode === 'ON_REPLY') {
          logger.info('Aguardando resposta do contato para disparar o template principal', { phone, messageLogId });
          await checkAndUpdateCampaignStatus(campaignId);

          // Mensagem de gancho enviada com sucesso no chip! Aplica o delay anti-ban antes de chamar o próximo contato
          const delayMinMs = (log.campaign.delayMin || 5) * 1000;
          const delayMaxMs = (log.campaign.delayMax || 15) * 1000;
          let nextDelayMs = Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1)) + delayMinMs;

          if (log.campaign.batchSize > 0) {
            const sentCount = await prisma.messageLog.count({
              where: { campaignId, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
            });
            if (sentCount % log.campaign.batchSize === 0) {
              nextDelayMs = (log.campaign.batchCooldown || 600) * 1000;
              logger.info(`[Worker] Pausa de lote atingida (${sentCount} mensagens enviadas). Aguardando ${nextDelayMs / 1000}s.`);
            }
          }

          await scheduleNextInCampaign(nextDelayMs);
          return;
        }

        // Se o modo for DELAY, aguarda os segundos configurados antes de enviar o template principal
        if (template.hookMode === 'DELAY') {
          const delayMs = (template.hookDelay || 15) * 1000;
          logger.info(`Aguardando ${template.hookDelay || 15}s para envio do template principal (2 balões)...`, { phone });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // Variantes de mensagem: inclui o corpo do template + variantes do template (novo) + variantes da campanha (retrocompatibilidade)
    const allVariants = [
      template.body,
      ...(template.bodyVariants || []),        // ← variantes definidas no template
      ...(log.campaign.messageVariants || []), // ← retrocompatibilidade com campanhas antigas
    ];
    // Seleciona aleatoriamente uma variante para parecer humano e evitar detecção de spam
    const chosenVariant = allVariants[Math.floor(Math.random() * allVariants.length)];

    let messageText = formatMessageText(chosenVariant, { name: contactName, link: groupLink });

    // 4. Seleciona dinamicamente o chip ativo / saudável respeitando a maturação
    let activeInstanceName = await getNextWhatsAppInstance([], campaignAllowedInstances, isOnlyMature);

    // 5. Executa o envio pela Evolution API com suporte a fallback de chip alternativo
    let sentSuccess = false;
    let lastErrorMsg = '';

    try {
      if (log.campaign.template.imageUrl) {
        // Envia mensagem de mídia (Imagem) com legenda
        await evolutionApi.sendMediaMessage(
          activeInstanceName,
          phone,
          log.campaign.template.imageUrl,
          'image',
          messageText
        );
      } else {
        // Envia texto simples
        await evolutionApi.sendTextMessage(activeInstanceName, phone, messageText);
      }

      sentSuccess = true;
      logger.info('Mensagem enviada com sucesso', { messageLogId, phone, instance: activeInstanceName });
      await reportChipSuccess(activeInstanceName);
    } catch (primaryError: any) {
      lastErrorMsg = primaryError?.message || 'Falha no envio primário';
      logger.warn('Falha no envio com chip primário, tentando chip alternativo...', {
        instance: activeInstanceName,
        error: lastErrorMsg,
        messageLogId,
      });

      // Reporta falha no chip primário
      await reportChipFailure(activeInstanceName, lastErrorMsg);

      // Tenta obter um chip secundário diferente do que falhou
      const fallbackInstance = await getNextWhatsAppInstance([activeInstanceName], campaignAllowedInstances, isOnlyMature);
      if (fallbackInstance && fallbackInstance !== activeInstanceName) {
        try {
          if (log.campaign.template.imageUrl) {
            await evolutionApi.sendMediaMessage(
              fallbackInstance,
              phone,
              log.campaign.template.imageUrl,
              'image',
              messageText
            );
          } else {
            await evolutionApi.sendTextMessage(fallbackInstance, phone, messageText);
          }

          sentSuccess = true;
          activeInstanceName = fallbackInstance;
          logger.info('Mensagem enviada com sucesso via chip fallback!', { messageLogId, phone, instance: fallbackInstance });
          await reportChipSuccess(fallbackInstance);
        } catch (fallbackError: any) {
          lastErrorMsg = fallbackError?.message || lastErrorMsg;
          await reportChipFailure(fallbackInstance, lastErrorMsg);
        }
      }
    }

    if (sentSuccess) {
      // 6. Atualiza o status no banco local para SENT
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          error: null,
        },
      });

      // Atualiza a empresa do contato com a empresa da campanha para contextualizar o chatbot IA
      if (log.campaign.companyId && log.contact.companyId !== log.campaign.companyId) {
        try {
          await prisma.contact.update({
            where: { id: log.contactId },
            data: { companyId: log.campaign.companyId },
          });
        } catch (compErr: any) {
          logger.warn?.('[Worker] Aviso ao associar empresa ao contato:', compErr?.message);
        }
      }

      // 7. Verifica se esta foi a última mensagem da campanha para finalizá-la
      await checkAndUpdateCampaignStatus(campaignId);

      // 8. Mensagem enviada com sucesso no chip! Aplica o delay anti-ban antes de chamar o próximo contato
      const delayMinMs = (log.campaign.delayMin || 5) * 1000;
      const delayMaxMs = (log.campaign.delayMax || 15) * 1000;
      let nextDelayMs = Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1)) + delayMinMs;

      if (log.campaign.batchSize > 0) {
        const sentCount = await prisma.messageLog.count({
          where: { campaignId, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
        });
        if (sentCount % log.campaign.batchSize === 0) {
          nextDelayMs = (log.campaign.batchCooldown || 600) * 1000;
          logger.info(`[Worker] Pausa de lote atingida (${sentCount} mensagens enviadas). Aguardando ${nextDelayMs / 1000}s.`);
        }
      }

      await scheduleNextInCampaign(nextDelayMs);
    } else {
      logger.error('Erro ao enviar mensagem após todas as tentativas', {
        messageLogId,
        error: lastErrorMsg,
        instance: activeInstanceName,
      });

      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          status: 'FAILED',
          error: lastErrorMsg,
        },
      });

      // Circuit Breaker: Verifica taxa de falha da campanha
      await checkCampaignDegradation(campaignId);
      await checkAndUpdateCampaignStatus(campaignId);

      // Em caso de erro de envio, aguarda 5 segundos de segurança e tenta o próximo
      await scheduleNextInCampaign(5000);

      throw new Error(lastErrorMsg); // Lança para que o BullMQ registre a falha no job
    }
  },
  {
    connection: redisConfiguration,
    concurrency: 1, // Envia de um em um para respeitar o delay e evitar banimentos
  }
);

/**
 * Circuit Breaker: Pausa a campanha automaticamente se a taxa de falha de envio real for excessiva (>15%)
 */
async function checkCampaignDegradation(campaignId: string) {
  try {
    const totalProcessed = await prisma.messageLog.count({
      where: {
        campaignId,
        status: { in: ['SENT', 'FAILED', 'DELIVERED', 'READ'] },
        // Ignora números que apenas não têm WhatsApp para não travar lista de clientes
        error: { not: 'Número de telefone não possui conta ativa no WhatsApp' },
      },
    });

    if (totalProcessed >= 8) {
      const totalFailed = await prisma.messageLog.count({
        where: {
          campaignId,
          status: 'FAILED',
          error: { not: 'Número de telefone não possui conta ativa no WhatsApp' },
        },
      });

      const failureRate = totalFailed / totalProcessed;
      if (failureRate > 0.15) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'PAUSED' },
        });
        logger.warn('⚠️ Circuit Breaker: Campanha pausada automaticamente devido à taxa de falha de envio excessiva (>15%)', {
          campaignId,
          totalFailed,
          totalProcessed,
          failureRate: Math.round(failureRate * 100) + '%',
        });
      }
    }
  } catch (err: any) {
    logger.error('Erro ao verificar degradação da campanha', { campaignId, error: err?.message });
  }
}

/**
 * Verifica o status de todos os logs da campanha e a finaliza se necessário
 */
async function checkAndUpdateCampaignStatus(campaignId: string) {
  // Conta quantas mensagens ainda estão pendentes
  const pendingCount = await prisma.messageLog.count({
    where: {
      campaignId,
      status: 'PENDING',
    },
  });

  if (pendingCount === 0) {
    // Nenhuma mensagem pendente. Campanha concluída!
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED' },
    });
    logger.info('Campanha concluída com sucesso', { campaignId });
  }
}

worker.on('failed', (job, err) => {
  logger.error('Job de disparo de mensagem falhou', { jobId: job?.id, error: err.message });
});

worker.on('error', (err) => {
  logger.error('Erro fatal no Message Worker', err);
});

