/**
 * warmup-pool-worker.ts
 * Worker de processamento de aquecimento mútuo (P2P Multi-Number Pool).
 * 
 * Regras de Orquestração:
 * - Seleciona remetente e destinatário aleatórios dentro do pool de instâncias.
 * - Registra logs específicos para o par.
 * - Simula digitação, reações, figurinhas e emojis.
 * - Agenda respostas automáticas e gerencia rest periods e janelas de horário comercial.
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
  WARMUP_POLLS,
  WARMUP_VCARDS,
} from '../lib/warmup-ai';
import {
  queuePoolMessage,
  cancelWarmupPoolJobs,
  WarmupPoolJobData,
} from '../lib/warmup-pool-queue';
import {
  isWithinBusinessHours,
  getMsUntilNextBusinessWindow,
  getMsUntilTomorrowStart,
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
import {
  reportChipSuccess,
  reportChipFailure,
} from '../lib/chip-router';

const WARMUP_POOL_QUEUE_NAME = 'warmup-pool-queue';
type MessageAction = 'TEXT' | 'EMOJI' | 'REACTION' | 'STICKER' | 'AUDIO' | 'LOCATION' | 'POLL' | 'CONTACT';

function chooseMessageAction(): MessageAction {
  const rand = Math.random() * 100;
  if (rand < 48) return 'TEXT';
  if (rand < 61) return 'EMOJI';
  if (rand < 71) return 'REACTION';
  if (rand < 76) return 'STICKER';
  if (rand < 86) return 'AUDIO';
  if (rand < 90) return 'LOCATION';
  if (rand < 98) return 'POLL';
  return 'CONTACT';
}

const STICKERS = [
  'https://www.gstatic.com/webp/gallery3/1.webp',
  'https://www.gstatic.com/webp/gallery3/2.webp',
  'https://www.gstatic.com/webp/gallery3/3.webp',
];

const WARMUP_LOCATIONS = [
  { lat: -23.5505, lng: -46.6333, name: 'Praça da Sé', addr: 'Centro, São Paulo - SP, Brasil' },
  { lat: -23.5617, lng: -46.6560, name: 'Avenida Paulista', addr: 'Bela Vista, São Paulo - SP, Brasil' },
  { lat: -22.9068, lng: -43.1729, name: 'Centro do Rio', addr: 'Rio de Janeiro - RJ, Brasil' },
  { lat: -15.7942, lng: -47.8822, name: 'Esplanada dos Ministérios', addr: 'Brasília - DF, Brasil' },
  { lat: -19.9167, lng: -43.9345, name: 'Praça da Liberdade', addr: 'Funcionários, Belo Horizonte - MG, Brasil' },
  { lat: -25.4284, lng: -49.2733, name: 'Jardim Botânico', addr: 'Curitiba - PR, Brasil' },
];

export const warmupPoolWorker = new Worker(
  WARMUP_POOL_QUEUE_NAME,
  async (job: Job<WarmupPoolJobData>) => {
    const { poolId, senderInstance, receiverInstance, isFirstMessageOfDay } = job.data;

    console.log(`[Warmup Pool Worker] Iniciando job para Pool ${poolId}`);

    // ── 1. Buscar pool ───────────────────────────────────────────────────────
    let pool = await prisma.warmupPool.findUnique({
      where: { id: poolId },
    });

    if (!pool || pool.status !== 'RUNNING') {
      console.log(`[Warmup Pool Worker] Pool ${poolId} inativo. Cancelando.`);
      return;
    }

    // ── 1.1 Verificar mudança de dia do calendário ────────────────────────────
    if (pool.lastMessageAt) {
      const lastSentDate = new Date(pool.lastMessageAt);
      const today = new Date();
      
      const isNewCalendarDay = 
        today.getDate() !== lastSentDate.getDate() ||
        today.getMonth() !== lastSentDate.getMonth() ||
        today.getFullYear() !== lastSentDate.getFullYear();
        
      if (isNewCalendarDay) {
        console.log(`[Warmup Pool Worker] Mudança de dia do calendário detectada para pool ${poolId}. Reiniciando contadores.`);
        
        const nextDay = pool.currentDay + 1;
        const nextTarget = getRampUpTarget(nextDay, pool.initialMsgsPerDay, pool.maxMsgsPerDay, isWeekend());
        
        // Calcular heat score baseado em sucesso
        const totalLogs = await prisma.warmupPoolLog.count({ where: { poolId } });
        const successLogs = await prisma.warmupPoolLog.count({ where: { poolId, status: 'SENT' } });
        const successRate = totalLogs > 0 ? successLogs / totalLogs : 1;
        const heatScore = calculateHeatScore(nextDay, pool.totalDays, successRate);

        pool = await prisma.warmupPool.update({
          where: { id: poolId },
          data: {
            currentDay: nextDay,
            msgsSentToday: 0,
            targetMsgsToday: nextTarget,
            heatScore,
            status: nextDay > pool.totalDays ? 'COMPLETED' : 'RUNNING',
          },
        });
      }
    }

    // ── 2. Verificar rest period ativo ───────────────────────────────────────
    if (pool.restPeriodUntil && pool.restPeriodUntil > new Date()) {
      const msRemaining = pool.restPeriodUntil.getTime() - Date.now();
      console.log(`[Warmup Pool Worker] Pool em descanso. Agendando para daqui ${Math.round(msRemaining / 60000)} min.`);
      await queuePoolMessage({ poolId, senderInstance, receiverInstance }, msRemaining, msRemaining * 0.1);
      return;
    }

    // ── 3. Verificar janela de horário comercial ─────────────────────────────
    if (!isWithinBusinessHours(pool.startHour, pool.endHour)) {
      const msUntilWindow = getMsUntilNextBusinessWindow(pool.startHour, pool.endHour);
      console.log(`[Warmup Pool Worker] Fora do horário comercial. Agendando para daqui ${Math.round(msUntilWindow / 3600000)}h.`);
      const jitter = Math.floor(Math.random() * 20 + 5) * 60 * 1000;
      await queuePoolMessage(
        { poolId, isFirstMessageOfDay: true },
        msUntilWindow + jitter,
        jitter
      );
      return;
    }

    // ── 4. Verificar limite diário de mensagens ──────────────────────────────
    if (pool.msgsSentToday >= pool.targetMsgsToday) {
      console.log(`[Warmup Pool Worker] Limite diário atingido (${pool.msgsSentToday}/${pool.targetMsgsToday}) para o pool ${poolId}. Agendando próximo dia.`);

      const delayMs = getMsUntilTomorrowStart(pool.startHour);
      await queuePoolMessage(
        { poolId, isFirstMessageOfDay: true },
        delayMs,
        delayMs * 0.1 + 60000
      );
      return;
    }

    // ── 5. Resolver remetente e destinatário do Pool ─────────────────────────
    let finalSender = senderInstance;
    let finalReceiver = receiverInstance;

    if (!finalSender || !finalReceiver) {
      const activeInstances = pool.instanceNames;
      if (activeInstances.length < 2) {
        console.error(`[Warmup Pool Worker] O pool ${poolId} precisa de no mínimo 2 instâncias.`);
        return;
      }

      // Escolhe um remetente aleatório
      finalSender = activeInstances[Math.floor(Math.random() * activeInstances.length)];
      // Escolhe um destinatário diferente
      const potentialReceivers = activeInstances.filter(name => name !== finalSender);
      finalReceiver = potentialReceivers[Math.floor(Math.random() * potentialReceivers.length)];
    }

    // Buscar dados dos WhatsApps no banco
    const senderDb = await prisma.whatsAppInstance.findUnique({ where: { name: finalSender } });
    const receiverDb = await prisma.whatsAppInstance.findUnique({ where: { name: finalReceiver } });

    if (!senderDb || !receiverDb || !receiverDb.phone || senderDb.status !== 'CONNECTED' || receiverDb.status !== 'CONNECTED') {
      console.log(`[Warmup Pool Worker] Uma das instâncias (${finalSender} ou ${finalReceiver}) não está pronta ou conectada. Remarcando.`);
      // Re-agenda de forma limpa em 2 minutos para dar tempo de reconectar
      await queuePoolMessage({ poolId }, 120000, 30000);
      return;
    }

    const targetPhone = receiverDb.phone;

    // ── 6. Adquirir lock para a instância remetente (evita burst) ─────────────
    const senderHourlyOk = await isInstanceWithinHourlyLimit(finalSender);
    if (!senderHourlyOk) {
      console.log(`[Warmup Pool Worker] Instância remetente ${finalSender} excedeu limites por hora. Aguardando.`);
      await queuePoolMessage({ poolId }, 600000, 120000);
      return;
    }

    const acquired = await acquireInstanceSlot(finalSender);
    if (!acquired) {
      console.log(`[Warmup Pool Worker] Instância ${finalSender} ocupada. Re-agendando em 40-90s.`);
      await queuePoolMessage({ poolId, senderInstance: finalSender, receiverInstance: finalReceiver }, 60000, 20000);
      return;
    }

    try {
      // ── 7. Rest Period Mútuo ───────────────────────────────────────────────
      if (shouldTakeRestPeriod(pool.msgsSentToday) && !isFirstMessageOfDay) {
        const restDuration = getRestPeriodDurationMs();
        const restUntil = new Date(Date.now() + restDuration);

        console.log(`[Warmup Pool Worker] Iniciando pausa do Pool por ${Math.round(restDuration / 60000)} min`);
        await prisma.warmupPool.update({
          where: { id: poolId },
          data: { restPeriodUntil: restUntil },
        });

        await queuePoolMessage({ poolId }, restDuration, restDuration * 0.1);
        return;
      }

      // ── 8. Carregar histórico do diálogo A ⇄ B ─────────────────────────────
      // Busca logs onde as duas instâncias conversavam
      const pairLogs = await prisma.warmupPoolLog.findMany({
        where: {
          poolId,
          OR: [
            { fromInstance: finalSender, toInstance: finalReceiver },
            { fromInstance: finalReceiver, toInstance: finalSender },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const history: ChatMessage[] = pairLogs.reverse().map(l => ({
        role: l.fromInstance === finalSender ? 'model' : 'user',
        parts: [{ text: l.message }],
      }));

      // ── 9. Escolher Tipo de Ação ──────────────────────────────────────────────────────
      const action = chooseMessageAction();
      let messageText = '';
      let messageType: 'TEXT' | 'EMOJI' | 'REACTION' | 'STICKER' | 'AUDIO' = 'TEXT';
      let typingDelay = 1500;
      let status = 'SENT';
      // ID real da mensagem retornado pela Evolution API (para reações futuras)
      let sentMessageId: string | null = null;

      const recentTopics = pairLogs.slice(-3).map(l => l.message.substring(0, 30));
      const topic = selectConversationTopic(recentTopics);

      // ── 10. Executar Ação ──────────────────────────────────────────────────
      if (action === 'EMOJI') {
        messageText = QUICK_EMOJI_RESPONSES[Math.floor(Math.random() * QUICK_EMOJI_RESPONSES.length)];
        messageType = 'EMOJI';
        typingDelay = 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, typingDelay));
        try {
          const res = await evolutionApi.sendTextMessage(finalSender, targetPhone, messageText);
          sentMessageId = res?.key?.id || null;
        } catch { status = 'FAILED'; }

      } else if (action === 'REACTION' && pairLogs.length > 0) {
        messageType = 'REACTION';
        const reaction = WARMUP_REACTIONS[Math.floor(Math.random() * WARMUP_REACTIONS.length)];
        messageText = reaction;

        await evolutionApi.markAsRead(finalSender, targetPhone);
        await new Promise(r => setTimeout(r, 600));

        const lastMessageId = pairLogs[pairLogs.length - 1].messageId;
        const ok = lastMessageId ? await evolutionApi.sendReaction(finalSender, targetPhone, lastMessageId, reaction) : false;
        if (!ok) {
          try {
            await evolutionApi.sendTextMessage(finalSender, targetPhone, reaction);
          } catch { status = 'FAILED'; }
        }

      } else if (action === 'STICKER') {
        messageType = 'STICKER';
        messageText = '[sticker]';
        const stickerUrl = STICKERS[Math.floor(Math.random() * STICKERS.length)];
        typingDelay = 1500 + Math.random() * 1500;
        await new Promise(r => setTimeout(r, typingDelay));

        const ok = await evolutionApi.sendSticker(finalSender, targetPhone, stickerUrl);
        if (!ok) {
          try {
            await evolutionApi.sendTextMessage(finalSender, targetPhone, '🔥');
          } catch { status = 'FAILED'; }
        }

      } else if (action === 'AUDIO') {
        messageType = 'AUDIO';
        messageText = '[Mensagem de voz]';
        const audioUrl = WARMUP_AUDIO_URLS[Math.floor(Math.random() * WARMUP_AUDIO_URLS.length)];
        
        // Simula o tempo de gravação humana
        typingDelay = 3000 + Math.random() * 4000; // 3-7s gravando
        
        if (history.length > 0) {
          await evolutionApi.markAsRead(finalSender, targetPhone);
          await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
        }
        
        await new Promise(r => setTimeout(r, typingDelay));
        
        try {
          await evolutionApi.sendAudioUrl(finalSender, targetPhone, audioUrl);
        } catch (err) {
          console.error(`[Warmup Pool] Erro ao enviar áudio:`, err);
          // Fallback para texto se áudio falhar
          try {
            messageType = 'TEXT';
            const context = `Você é ${finalSender} conversando no WhatsApp com seu amigo ${finalReceiver}. Assunto: ${topic}`;
            messageText = await generateNextWarmupMessage(context, history, topic);
            typingDelay = calculateTypingDelay(messageText);
            await new Promise(r => setTimeout(r, typingDelay));
            await evolutionApi.sendTextMessage(finalSender, targetPhone, messageText);
          } catch {
            status = 'FAILED';
          }
        }

      } else if (action === 'LOCATION') {
        messageType = 'TEXT';
        const loc = WARMUP_LOCATIONS[Math.floor(Math.random() * WARMUP_LOCATIONS.length)];

        try {
          const introText = "Vou te mandar a localização de onde estou agora 📍";
          await evolutionApi.sendTextMessage(finalSender, targetPhone, introText);
        } catch {}

        messageText = `[Localização] ${loc.name} - ${loc.addr}`;
        typingDelay = 1500 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, typingDelay));

        try {
          await evolutionApi.sendLocationMessage(finalSender, targetPhone, loc.lat, loc.lng, loc.name, loc.addr);
        } catch (err) {
          console.error(`[Warmup Pool] Erro ao enviar localização:`, err);
          status = 'FAILED';
        }

      } else if (action === 'POLL') {
        messageType = 'TEXT';
        const poll = WARMUP_POLLS[Math.floor(Math.random() * WARMUP_POLLS.length)];
        messageText = `[Enquete] ${poll.name}`;

        typingDelay = 2000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, typingDelay));

        try {
          await evolutionApi.sendPollMessage(finalSender, targetPhone, poll.name, poll.options);
        } catch (err) {
          console.error(`[Warmup Pool] Erro ao enviar enquete:`, err);
          status = 'FAILED';
        }

      } else if (action === 'CONTACT') {
        messageType = 'TEXT';
        const contact = WARMUP_VCARDS[Math.floor(Math.random() * WARMUP_VCARDS.length)];
        messageText = `[Contato] ${contact.displayName}`;

        try {
          const introText = `Anote aí o contato que te falei: 📇`;
          await evolutionApi.sendTextMessage(finalSender, targetPhone, introText);
        } catch {}

        typingDelay = 1500 + Math.random() * 1500;
        await new Promise(r => setTimeout(r, typingDelay));

        try {
          await evolutionApi.sendContactCard(finalSender, targetPhone, contact.displayName, contact.vcard);
        } catch (err) {
          console.error(`[Warmup Pool] Erro ao enviar contato:`, err);
          status = 'FAILED';
        }

      } else {
        // TEXT (Gemini AI)
        messageType = 'TEXT';
        const context = `Você é ${finalSender} conversando no WhatsApp com seu amigo ${finalReceiver}. Assunto: ${topic}`;

        if (history.length > 0) {
          await evolutionApi.markAsRead(finalSender, targetPhone);
          await new Promise(r => setTimeout(r, 500));
        }

        messageText = await generateNextWarmupMessage(context, history, topic);
        typingDelay = calculateTypingDelay(messageText);

        await new Promise(r => setTimeout(r, typingDelay));
        try {
          const res = await evolutionApi.sendTextMessage(finalSender, targetPhone, messageText);
          sentMessageId = res?.key?.id || null;
        } catch (err) {
          console.error(`[Warmup Pool] Erro de envio:`, err);
          status = 'FAILED';
        }
      }

      // ── 11. Salvar Logs e Incrementar ──────────────────────────────────────────────
      await prisma.warmupPoolLog.create({
        data: {
          poolId,
          fromInstance: finalSender,
          toInstance: finalReceiver,
          message: messageText,
          messageType: messageType as any,
          status,
          messageId: sentMessageId,
          delayUsed: Math.round(typingDelay),
        },
      });

      if (status === 'SENT') {
        await recordInstanceMessage(finalSender);
        await recordInstanceHourlyMessage(finalSender);
        // Reporta sucesso para o ChipRouter atualizar health score
        await reportChipSuccess(finalSender);

        await prisma.warmupPool.update({
          where: { id: poolId },
          data: {
            msgsSentToday: { increment: 1 },
            lastMessageAt: new Date(),
          },
        });

        // ── 12. Agendar RESPOSTA de B para A (Simula diálogo) ─────────────────
        // Agora agendamos para finalReceiver responder finalSender
        await queuePoolMessage({
          poolId,
          senderInstance: finalReceiver, // B responde
          receiverInstance: finalSender, // para A
          isFirstMessageOfDay: false,
        });
      } else {
        // Falhou: reporta falha e re-agenda disparo novo após 5 min
        await reportChipFailure(finalSender, `Falha no pool ${poolId}`);
        await queuePoolMessage({ poolId }, 300000, 60000);
      }

    } finally {
      await releaseInstanceSlot(finalSender);
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 5,
    lockDuration: 120000,
  }
);

warmupPoolWorker.on('completed', job => console.log(`[Pool Worker] Job ${job.id} finalizado.`));
warmupPoolWorker.on('failed', (job, err) => console.error(`[Pool Worker] Job ${job?.id} falhou: ${err.message}`));
