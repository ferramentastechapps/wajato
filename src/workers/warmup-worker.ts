/**
 * warmup-worker.ts
 * Worker de processamento de aquecimento profissional.
 * 
 * Melhorias implementadas vs versão anterior:
 * - Verificação de janela de horário comercial (8h-22h BRT)
 * - Rest periods automáticos (pause de 5-15min a cada N mensagens)
 * - Mix de tipos de mensagem: texto, emoji, sticker, reação
 * - Rate limiting por instância via Redis (evita burst de múltiplas campanhas)
 * - Jitter gaussiano para delays naturais
 * - Ramp-up progressivo profissional
 * - Detecção de fins de semana (volume reduzido)
 * - Heat score calculado automaticamente
 */

import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../lib/evolution';
import {
  generateNextWarmupMessage,
  calculateTypingDelay,
  selectConversationTopic,
  QUICK_EMOJI_RESPONSES,
  WARMUP_REACTIONS,
  ChatMessage,
  WARMUP_AUDIO_URLS,
} from '../lib/warmup-ai';
import {
  queueWarmupMessage,
  cancelCampaignWarmupJobs,
  WarmupJobData,
} from '../lib/warmup-queue';
import {
  isWithinBusinessHours,
  getMsUntilNextBusinessWindow,
  isWeekend,
  getRampUpTarget,
  calculateHeatScore,
  shouldTakeRestPeriod,
  getRestPeriodDurationMs,
} from '../lib/warmup-schedule';
import {
  acquireInstanceSlot,
  releaseInstanceSlot,
  recordInstanceMessage,
  recordInstanceHourlyMessage,
  isInstanceWithinHourlyLimit,
} from '../lib/warmup-rate-limiter';

const WARMUP_QUEUE_NAME = 'warmup-queue';

// Tipos de mensagem disponíveis com seus pesos de probabilidade
type MessageAction = 'TEXT' | 'EMOJI' | 'REACTION' | 'STICKER' | 'AUDIO';

/**
 * Escolhe aleatoriamente o tipo de ação para essa mensagem.
 * Pesos ajustados para simular comportamento humano realista:
 * - Texto: 60% (maioria das interações)
 * - Emoji: 15% (respostas rápidas comuns)
 * - Reação: 10% (recurso mais recente, menos frequente)
 * - Sticker: 5% (ocasional)
 * - Áudio: 10% (notas de voz humanas altamente confiáveis)
 */
function chooseMessageAction(): MessageAction {
  const rand = Math.random() * 100;
  if (rand < 60) return 'TEXT';
  if (rand < 75) return 'EMOJI';
  if (rand < 85) return 'REACTION';
  if (rand < 90) return 'STICKER';
  return 'AUDIO';
}

/**
 * Stickers genéricos de warmup hospedados publicamente.
 * URLs de stickers .webp compatíveis com WhatsApp.
 */
const WARMUP_STICKER_URLS = [
  'https://www.gstatic.com/webp/gallery3/1.webp',
  'https://www.gstatic.com/webp/gallery3/2.webp',
  'https://www.gstatic.com/webp/gallery3/3.webp',
];

export const warmupWorker = new Worker(
  WARMUP_QUEUE_NAME,
  async (job: Job<WarmupJobData>) => {
    const { campaignId, sourceInstance, targetPhone, isFirstMessageOfDay, currentTopic } = job.data;

    console.log(`[Warmup Worker] Job recebido | Campanha: ${campaignId} | Instância: ${sourceInstance}`);

    // ── 1. Buscar campanha ───────────────────────────────────────────────────
    const campaign = await prisma.warmupCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.status !== 'RUNNING') {
      console.log(`[Warmup Worker] Campanha ${campaignId} inativa. Ignorando.`);
      return;
    }

    // ── 2. Verificar rest period ativo ───────────────────────────────────────
    if (campaign.restPeriodUntil && campaign.restPeriodUntil > new Date()) {
      const msRemaining = campaign.restPeriodUntil.getTime() - Date.now();
      console.log(`[Warmup Worker] Campanha em rest period. Reagendando em ${Math.round(msRemaining / 60000)} min.`);
      await queueWarmupMessage({ campaignId, sourceInstance, targetPhone }, msRemaining, msRemaining * 0.1);
      return;
    }

    // ── 3. Verificar janela de horário comercial ─────────────────────────────
    if (!isWithinBusinessHours(campaign.startHour, campaign.endHour)) {
      const msUntilWindow = getMsUntilNextBusinessWindow(campaign.startHour);
      console.log(`[Warmup Worker] Fora do horário comercial. Agendando para ${Math.round(msUntilWindow / 3600000)}h.`);
      
      // Agenda para o próximo início de expediente com jitter de 5-30 min
      const jitter = Math.floor(Math.random() * 25 + 5) * 60 * 1000;
      await queueWarmupMessage(
        { campaignId, sourceInstance, targetPhone, isFirstMessageOfDay: true },
        msUntilWindow + jitter,
        jitter
      );
      return;
    }

    // ── 4. Verificar cota diária ─────────────────────────────────────────────
    const weekend = isWeekend();
    
    if (campaign.msgsSentToday >= campaign.targetMsgsToday && !isFirstMessageOfDay) {
      console.log(`[Warmup Worker] Cota diária atingida (${campaign.msgsSentToday}/${campaign.targetMsgsToday}). Agendando para amanhã.`);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Horário aleatório entre startHour e startHour+2 para variar
      const startOffset = Math.floor(Math.random() * 120); // 0-120 min após início
      tomorrow.setHours(campaign.startHour, startOffset % 60, 0, 0);

      const delayMs = Math.max(0, tomorrow.getTime() - Date.now());
      const nextDay = campaign.currentDay + 1;
      const nextTarget = getRampUpTarget(nextDay, campaign.initialMsgsPerDay, campaign.maxMsgsPerDay, isWeekend());

      // Calcular heat score baseado em sucesso
      const totalLogs = await prisma.warmupLog.count({ where: { campaignId } });
      const successLogs = await prisma.warmupLog.count({ where: { campaignId, status: 'SENT' } });
      const successRate = totalLogs > 0 ? successLogs / totalLogs : 1;
      const heatScore = calculateHeatScore(nextDay, campaign.totalDays, successRate);

      await prisma.warmupCampaign.update({
        where: { id: campaignId },
        data: {
          currentDay: nextDay,
          msgsSentToday: 0,
          targetMsgsToday: nextTarget,
          heatScore,
          status: nextDay > campaign.totalDays ? 'COMPLETED' : 'RUNNING',
        },
      });

      console.log(`[Warmup Worker] Dia ${nextDay} programado com ${nextTarget} msgs. Heat Score: ${heatScore}/100`);

      if (nextDay <= campaign.totalDays) {
        await queueWarmupMessage(
          { campaignId, sourceInstance, targetPhone, isFirstMessageOfDay: true },
          delayMs,
          delayMs * 0.1 + 60000 // 10% de jitter + 1 min base
        );
      }
      return;
    }

    // ── 5. Verificar rate limit por instância ────────────────────────────────
    const withinHourly = await isInstanceWithinHourlyLimit(sourceInstance);
    if (!withinHourly) {
      console.log(`[Warmup Worker] Rate limit horário atingido para ${sourceInstance}. Aguardando 20 min.`);
      await queueWarmupMessage({ campaignId, sourceInstance, targetPhone }, 20 * 60 * 1000, 5 * 60 * 1000);
      return;
    }

    // ── 6. Tentar adquirir slot da instância ─────────────────────────────────
    const acquired = await acquireInstanceSlot(sourceInstance);
    if (!acquired) {
      console.log(`[Warmup Worker] Instância ${sourceInstance} ocupada. Reagendando em 30-90s.`);
      await queueWarmupMessage({ campaignId, sourceInstance, targetPhone }, 60000, 30000);
      return;
    }

    try {
      // ── 7. Verificar se é hora de rest period ──────────────────────────────
      if (shouldTakeRestPeriod(campaign.msgsSentToday) && !isFirstMessageOfDay) {
        const restDuration = getRestPeriodDurationMs();
        const restUntil = new Date(Date.now() + restDuration);
        
        console.log(`[Warmup Worker] Iniciando rest period de ${Math.round(restDuration / 60000)} min para campanha ${campaignId}`);
        
        await prisma.warmupCampaign.update({
          where: { id: campaignId },
          data: { restPeriodUntil: restUntil },
        });
        
        await queueWarmupMessage(
          { campaignId, sourceInstance, targetPhone, isRestPeriodEnd: true },
          restDuration,
          restDuration * 0.15
        );
        return;
      }

      // ── 8. Buscar histórico de mensagens para contexto da IA ───────────────
      const logs = await prisma.warmupLog.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        take: 12, // Um pouco mais de contexto
      });

      const history: ChatMessage[] = logs.reverse().map(log => ({
        role: log.fromInstance === sourceInstance ? 'model' : 'user',
        parts: [{ text: log.message }],
      }));

      // ── 9. Escolher tipo de ação desta mensagem ────────────────────────────
      const action = chooseMessageAction();
      let messageText = '';
      let messageType: 'TEXT' | 'EMOJI' | 'REACTION' | 'STICKER' | 'AUDIO' = 'TEXT';
      let typingDelay = 1500;

      // Selecionar tópico (rotaciona a cada nova conversa ou mantém o atual)
      const recentTopics = logs.slice(-3).map(l => l.message.substring(0, 30));
      const topic = currentTopic || selectConversationTopic(recentTopics);

      // Contexto da persona customizado ou padrão
      const personaContext = campaign.customContext
        ? `${campaign.customContext}. Dia ${campaign.currentDay} de conversa. Assunto: ${topic}`
        : `Você é ${sourceInstance}. Dia ${campaign.currentDay} de conversa. Assunto: ${topic}`;

      console.log(`[Warmup Worker] Ação escolhida: ${action} para campanha ${campaignId}`);

      // ── 10. Executar ação escolhida ────────────────────────────────────────
      let status = 'SENT';

      if (action === 'EMOJI') {
        // Resposta rápida com emoji
        messageText = QUICK_EMOJI_RESPONSES[Math.floor(Math.random() * QUICK_EMOJI_RESPONSES.length)];
        messageType = 'EMOJI';
        typingDelay = 800 + Math.random() * 1200; // 0.8-2s para emoji
        
        await new Promise(r => setTimeout(r, typingDelay));
        
        try {
          await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar emoji:', err);
          status = 'FAILED';
        }

      } else if (action === 'REACTION' && logs.length > 0) {
        // Reação a uma mensagem anterior
        messageType = 'REACTION';
        const reaction = WARMUP_REACTIONS[Math.floor(Math.random() * WARMUP_REACTIONS.length)];
        messageText = reaction;
        
        // Marcar como lido primeiro (natural)
        await evolutionApi.markAsRead(sourceInstance, targetPhone);
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        
        // Tenta reagir — usa ID fictício pois não armazenamos IDs de msg da Evolution
        // Na prática, envia um emoji como texto se a reação falhar
        const reactionResult = await evolutionApi.sendReaction(
          sourceInstance,
          targetPhone,
          `${Date.now()}`, // Fallback — em produção, guardar messageId no log
          reaction
        );
        
        if (!reactionResult) {
          // Fallback: envia o emoji como texto
          try {
            await evolutionApi.sendTextMessage(sourceInstance, targetPhone, reaction);
          } catch (err) {
            status = 'FAILED';
          }
        }

      } else if (action === 'STICKER') {
        // Sticker aleatório
        messageType = 'STICKER';
        messageText = '[sticker]';
        const stickerUrl = WARMUP_STICKER_URLS[Math.floor(Math.random() * WARMUP_STICKER_URLS.length)];
        
        typingDelay = 1000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, typingDelay));
        
        const result = await evolutionApi.sendSticker(sourceInstance, targetPhone, stickerUrl);
        if (!result) {
          // Fallback para emoji se sticker falhar
          messageText = '😄';
          try {
            await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
          } catch (err) {
            status = 'FAILED';
          }
        }

      } else if (action === 'AUDIO') {
        // Envio de nota de voz (Áudio)
        messageType = 'AUDIO';
        messageText = '[Mensagem de voz]';
        const audioUrl = WARMUP_AUDIO_URLS[Math.floor(Math.random() * WARMUP_AUDIO_URLS.length)];
        
        // Simula o tempo de gravação humana
        typingDelay = 3000 + Math.random() * 4000; // 3-7s gravando
        
        if (history.length > 0) {
          await evolutionApi.markAsRead(sourceInstance, targetPhone);
          await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
        }
        
        await new Promise(r => setTimeout(r, typingDelay));
        
        try {
          await evolutionApi.sendAudioUrl(sourceInstance, targetPhone, audioUrl);
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar áudio:', err);
          // Fallback para texto se áudio falhar
          try {
            messageType = 'TEXT';
            const context = personaContext;
            messageText = await generateNextWarmupMessage(context, history, topic);
            typingDelay = calculateTypingDelay(messageText);
            await new Promise(r => setTimeout(r, typingDelay));
            await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
          } catch (fallbackErr) {
            console.error('[Warmup Worker] Erro no fallback de texto do áudio:', fallbackErr);
            status = 'FAILED';
          }
        }

      } else {
        // TEXT — geração via IA Gemini
        messageType = 'TEXT';
        
        // Contexto da persona
        const context = personaContext;
        
        // Marcar mensagens como lidas antes de responder (comportamento natural)
        if (history.length > 0) {
          await evolutionApi.markAsRead(sourceInstance, targetPhone);
          await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
        }
        
        messageText = await generateNextWarmupMessage(context, history, topic);
        typingDelay = calculateTypingDelay(messageText);

        console.log(`[Warmup Worker] Texto gerado: "${messageText.substring(0, 50)}..." | Typing: ${Math.round(typingDelay / 1000)}s`);

        // Simular digitação ANTES de enviar
        await new Promise(r => setTimeout(r, typingDelay));

        try {
          await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar texto:', err);
          status = 'FAILED';
        }
      }

      // ── 11. Registrar log ──────────────────────────────────────────────────
      await prisma.warmupLog.create({
        data: {
          campaignId,
          fromInstance: sourceInstance,
          toPhone: targetPhone,
          message: messageText,
          messageType: messageType as any,
          status,
          delayUsed: Math.round(typingDelay),
        },
      });

      // ── 12. Atualizar campanha ─────────────────────────────────────────────
      if (status === 'SENT') {
        await recordInstanceMessage(sourceInstance);
        await recordInstanceHourlyMessage(sourceInstance);
        
        await prisma.warmupCampaign.update({
          where: { id: campaignId },
          data: {
            msgsSentToday: { increment: 1 },
            lastMessageAt: new Date(),
          },
        });

        // ── 13. Agendar próxima mensagem ────────────────────────────────────
        if (campaign.targetInstance) {
          // Bidirecional: a instância destino responde de volta
          const sourceInst = await prisma.whatsAppInstance.findUnique({
            where: { name: sourceInstance },
          });

          if (sourceInst?.phone) {
            // Se quem enviou agora foi a origem da campanha, a resposta deve vir do destino
            if (sourceInstance === campaign.sourceInstance) {
              await queueWarmupMessage({
                campaignId,
                sourceInstance: campaign.targetInstance,
                targetPhone: sourceInst.phone, // envia de volta para o telefone da origem
                isFirstMessageOfDay: false,
                currentTopic: topic,
              });
            } else {
              // Se quem enviou foi o destino, o ciclo completo A -> B -> A acabou.
              // Agora a origem A inicia nova conversa com o PRÓXIMO telefone da lista (se houver múltiplos).
              let nextPhone = campaign.targetPhone;
              if (campaign.targetPhones) {
                const phones = campaign.targetPhones.split(',').map(p => p.trim()).filter(Boolean);
                if (phones.length > 1) {
                  const currentIndex = phones.indexOf(campaign.targetPhone);
                  const nextIndex = (currentIndex + 1) % phones.length;
                  nextPhone = phones[nextIndex];

                  // Atualiza o targetPhone ativo no banco
                  await prisma.warmupCampaign.update({
                    where: { id: campaignId },
                    data: { targetPhone: nextPhone },
                  });
                }
              }

              await queueWarmupMessage({
                campaignId,
                sourceInstance: campaign.sourceInstance,
                targetPhone: nextPhone,
                isFirstMessageOfDay: false,
                currentTopic: topic,
              });
            }
          }
        } else {
          // Unidirecional: mesma instância continua mandando
          let nextPhone = targetPhone;
          if (campaign.targetPhones) {
            const phones = campaign.targetPhones.split(',').map(p => p.trim()).filter(Boolean);
            if (phones.length > 1) {
              const currentIndex = phones.indexOf(targetPhone);
              const nextIndex = (currentIndex + 1) % phones.length;
              nextPhone = phones[nextIndex];

              // Atualiza o targetPhone ativo no banco
              await prisma.warmupCampaign.update({
                where: { id: campaignId },
                data: { targetPhone: nextPhone },
              });
            }
          }

          await queueWarmupMessage({
            campaignId,
            sourceInstance,
            targetPhone: nextPhone,
            isFirstMessageOfDay: false,
            currentTopic: topic,
          });
        }
      } else {
        console.error(`[Warmup Worker] Falha no envio para campanha ${campaignId}. Reagendando...`);
        // Em caso de falha, reagenda com delay maior
        await queueWarmupMessage({ campaignId, sourceInstance, targetPhone }, 300000, 60000); // 5 min ± 1 min
      }

    } finally {
      // Sempre libera o slot da instância
      await releaseInstanceSlot(sourceInstance);
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 5, // Processa até 5 campanhas diferentes em paralelo
    lockDuration: 120000, // Lock de 2 minutos (considera o delay de typing)
  }
);

// ── Eventos do Worker ────────────────────────────────────────────────────────
warmupWorker.on('completed', (job) => {
  console.log(`[Warmup Worker] ✅ Job ${job.id} concluído.`);
});

warmupWorker.on('failed', (job, err) => {
  console.error(`[Warmup Worker] ❌ Job ${job?.id} falhou: ${err.message}`);
});

warmupWorker.on('error', (err) => {
  console.error('[Warmup Worker] ⚠️ Erro fatal no Worker:', err);
});
