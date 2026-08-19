import { Worker, Job } from 'bullmq';
import { redisConfiguration } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../lib/evolution';
import { MessageJobData } from '../lib/queue';
import { getNextWhatsAppInstance, reportChipSuccess, reportChipFailure } from '../lib/chip-router';
import { logger } from '../lib/logger';
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

    // 2. Se a campanha não estiver em andamento (ex: pausada ou cancelada), cancela o envio
    if (log.campaign.status !== 'SENDING') {
      logger.info('Campanha não está ativa, ignorando envio', { campaignId, status: log.campaign.status, messageLogId });
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: { status: 'PENDING', error: 'Campanha não está ativa' },
      });
      return;
    }

    // 3. Monta a mensagem interpolando variáveis
    const contactName = log.contact.name || 'Cliente';
    // Se houver {{link}} no template, substitui pela descrição do grupo (onde salvamos o link do grupo)
    const groupLink = log.campaign.group?.description || '';

    // Variantes de mensagem: inclui o corpo do template como opção 0 + todas as variantes cadastradas
    const allVariants = [log.campaign.template.body, ...(log.campaign.messageVariants || [])];
    // Seleciona aleatoriamente uma variante para parecer humano e evitar detecção de spam
    const chosenVariant = allVariants[Math.floor(Math.random() * allVariants.length)];

    let messageText = chosenVariant
      .replace(/{{nome}}/g, contactName)
      .replace(/{{link}}/g, groupLink);

    // 4. Seleciona dinamicamente o chip ativo / saudável
    let activeInstanceName = await getNextWhatsAppInstance();

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
      const fallbackInstance = await getNextWhatsAppInstance([activeInstanceName]);
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

      throw new Error(lastErrorMsg); // Lança para que o BullMQ registre a falha no job
    }
  },
  {
    connection: redisConfiguration,
    concurrency: 1, // Envia de um em um para respeitar o delay e evitar banimentos
  }
);

/**
 * Circuit Breaker: Pausa a campanha automaticamente se a taxa de falha for excessiva (>15%)
 */
async function checkCampaignDegradation(campaignId: string) {
  try {
    const totalProcessed = await prisma.messageLog.count({
      where: {
        campaignId,
        status: { in: ['SENT', 'FAILED', 'DELIVERED', 'READ'] },
      },
    });

    if (totalProcessed >= 8) {
      const totalFailed = await prisma.messageLog.count({
        where: {
          campaignId,
          status: 'FAILED',
        },
      });

      const failureRate = totalFailed / totalProcessed;
      if (failureRate > 0.15) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'PAUSED' },
        });
        logger.warn('⚠️ Circuit Breaker: Campanha pausada automaticamente devido à taxa de falha excessiva (>15%)', {
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

