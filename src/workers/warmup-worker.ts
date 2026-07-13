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
  WARMUP_POLLS,
  WARMUP_VCARDS,
} from '../lib/warmup-ai';
import {
  queueWarmupMessage,
  cancelCampaignWarmupJobs,
  WarmupJobData,
} from '../lib/warmup-queue';
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

const WARMUP_QUEUE_NAME = 'warmup-queue';

// Tipos de mensagem disponíveis com seus pesos de probabilidade
type MessageAction = 'TEXT' | 'EMOJI' | 'REACTION' | 'STICKER' | 'AUDIO' | 'STATUS' | 'LOCATION' | 'IMAGE' | 'POLL' | 'CONTACT';

/**
 * Escolhe aleatoriamente o tipo de ação para essa mensagem.
 * Pesos ajustados para simular comportamento humano realista:
 * - Texto: 48% (maioria das interações)
 * - Emoji: 13% (respostas rápidas comuns)
 * - Reação: 10% (recurso mais recente, menos frequente)
 * - Sticker: 5% (ocasional)
 * - Áudio: 8% (notas de voz humanas altamente confiáveis)
 * - Imagem: 5% (mídia)
 * - Localização: 4% (geolocalização humana)
 * - Poll: 5% (enquetes interativas)
 * - Contact Card: 1% (enviar contato)
 * - Status/Stories: 1% (postagem social)
 */
function chooseMessageAction(): MessageAction {
  const rand = Math.random() * 100;
  if (rand < 48) return 'TEXT';
  if (rand < 61) return 'EMOJI';
  if (rand < 71) return 'REACTION';
  if (rand < 76) return 'STICKER';
  if (rand < 84) return 'AUDIO';
  if (rand < 89) return 'IMAGE';
  if (rand < 93) return 'LOCATION';
  if (rand < 98) return 'POLL';
  if (rand < 99) return 'CONTACT';
  return 'STATUS';
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

const WARMUP_IMAGE_URLS = [
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop',
];

const WARMUP_STATUS_TEXTS = [
  'Bom dia a todos! Que o dia seja produtivo e abençoado. 🙌✨',
  'Mais um dia de foco e muito trabalho. Bora vencer! 💻💪',
  'A vida é feita de escolhas, escolha ser feliz hoje. 🌸🍃',
  'Café da manhã reforçado para aguentar a rotina. ☕🥪',
  'A determinação de hoje é o sucesso de amanhã. 🚀💫',
  'Gratidão por mais um dia de vida e saúde. 🙏❤️',
];

const WARMUP_LOCATIONS = [
  { lat: -23.5505, lng: -46.6333, name: 'Praça da Sé', addr: 'Centro, São Paulo - SP, Brasil' },
  { lat: -23.5617, lng: -46.6560, name: 'Avenida Paulista', addr: 'Bela Vista, São Paulo - SP, Brasil' },
  { lat: -22.9068, lng: -43.1729, name: 'Centro do Rio', addr: 'Rio de Janeiro - RJ, Brasil' },
  { lat: -15.7942, lng: -47.8822, name: 'Esplanada dos Ministérios', addr: 'Brasília - DF, Brasil' },
  { lat: -19.9167, lng: -43.9345, name: 'Praça da Liberdade', addr: 'Funcionários, Belo Horizonte - MG, Brasil' },
  { lat: -25.4284, lng: -49.2733, name: 'Jardim Botânico', addr: 'Curitiba - PR, Brasil' },
];

export const warmupWorker = new Worker(
  WARMUP_QUEUE_NAME,
  async (job: Job<WarmupJobData>) => {
    const { campaignId, isFirstMessageOfDay, currentTopic } = job.data;

    // ── 1. Buscar campanha ───────────────────────────────────────────────────
    let campaign = await prisma.warmupCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.status !== 'RUNNING') {
      console.log(`[Warmup Worker] Campanha ${campaignId} inativa. Ignorando.`);
      return;
    }

    // ── 1.1 Verificar mudança de dia do calendário ────────────────────────────
    const weekend = isWeekend();
    if (campaign.lastMessageAt) {
      const lastSentDate = new Date(campaign.lastMessageAt);
      const today = new Date();
      
      const isNewCalendarDay = 
        today.getDate() !== lastSentDate.getDate() ||
        today.getMonth() !== lastSentDate.getMonth() ||
        today.getFullYear() !== lastSentDate.getFullYear();
        
      if (isNewCalendarDay) {
        console.log(`[Warmup Worker] Mudança de dia do calendário detectada para campanha ${campaignId}. Reiniciando contadores.`);
        
        const nextDay = campaign.currentDay + 1;
        const nextTarget = getRampUpTarget(nextDay, campaign.initialMsgsPerDay, campaign.maxMsgsPerDay, weekend);
        
        // Calcular heat score baseado em sucesso
        const totalLogs = await prisma.warmupLog.count({ where: { campaignId } });
        const successLogs = await prisma.warmupLog.count({ where: { campaignId, status: 'SENT' } });
        const successRate = totalLogs > 0 ? successLogs / totalLogs : 1;
        const heatScore = calculateHeatScore(nextDay, campaign.totalDays, successRate);

        campaign = await prisma.warmupCampaign.update({
          where: { id: campaignId },
          data: {
            currentDay: nextDay,
            msgsSentToday: 0,
            targetMsgsToday: nextTarget,
            heatScore,
            status: nextDay > campaign.totalDays ? 'COMPLETED' : 'RUNNING',
          },
        });
      }
    }

    const sourceInstance = campaign.sourceInstance;
    const targetPhone = campaign.targetPhone;

    console.log(`[Warmup Worker] Job recebido | Campanha: ${campaignId} | Instância: ${sourceInstance} | Destinatário: ${targetPhone}`);

    // ── 2. Verificar rest period ativo ───────────────────────────────────────
    if (campaign.restPeriodUntil && campaign.restPeriodUntil > new Date()) {
      const msRemaining = campaign.restPeriodUntil.getTime() - Date.now();
      console.log(`[Warmup Worker] Campanha em rest period. Reagendando em ${Math.round(msRemaining / 60000)} min.`);
      await queueWarmupMessage({ campaignId, sourceInstance, targetPhone }, msRemaining, msRemaining * 0.1);
      return;
    }

    // ── 3. Verificar janela de horário comercial ─────────────────────────────
    if (!isWithinBusinessHours(campaign.startHour, campaign.endHour)) {
      const msUntilWindow = getMsUntilNextBusinessWindow(campaign.startHour, campaign.endHour);
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
    if (campaign.msgsSentToday >= campaign.targetMsgsToday) {
      console.log(`[Warmup Worker] Cota diária atingida (${campaign.msgsSentToday}/${campaign.targetMsgsToday}). Parando por hoje e agendando próximo dia.`);

      const delayMs = getMsUntilTomorrowStart(campaign.startHour);
      await queueWarmupMessage(
        { campaignId, sourceInstance, targetPhone, isFirstMessageOfDay: true },
        delayMs,
        delayMs * 0.1 + 60000 // 10% de jitter + 1 min base
      );
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

      // ── 8. Buscar histórico de mensagens para contexto da IA (filtrado por contato) ───
      const logs = await prisma.warmupLog.findMany({
        where: {
          campaignId,
          OR: [
            { toPhone: targetPhone },
            { fromInstance: targetPhone }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 12, // Um pouco mais de contexto
      });

      const history: ChatMessage[] = logs.reverse().map(log => ({
        role: log.fromInstance === sourceInstance ? 'model' : 'user',
        parts: [{ text: log.message }],
      }));

      // ── 9. Escolher tipo de ação desta mensagem ─────────────────────────────────
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

      // ── 10. Executar ação escolhida ───────────────────────────────────────────
      let status = 'SENT';
      // ID real da mensagem retornado pela Evolution API (para reações futuras)
      let sentMessageId: string | null = null;

      if (action === 'EMOJI') {
        // Resposta rápida com emoji
        messageText = QUICK_EMOJI_RESPONSES[Math.floor(Math.random() * QUICK_EMOJI_RESPONSES.length)];
        messageType = 'EMOJI';
        typingDelay = 800 + Math.random() * 1200; // 0.8-2s para emoji
        
        await new Promise(r => setTimeout(r, typingDelay));
        
        try {
          const res = await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
          sentMessageId = res?.key?.id || res?.id || null;
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar emoji:', err);
          status = 'FAILED';
        }

      } else if (action === 'REACTION' && logs.length > 0) {
        // Reação a uma mensagem anterior usando o messageId real salvo no log
        messageType = 'REACTION';
        const reaction = WARMUP_REACTIONS[Math.floor(Math.random() * WARMUP_REACTIONS.length)];
        messageText = reaction;
        
        // Marcar como lido primeiro (natural)
        await evolutionApi.markAsRead(sourceInstance, targetPhone);
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        
        // Busca o messageId real do log mais recente da outra parte
        const lastReceivedLog = logs.find(l => l.fromInstance !== sourceInstance && l.messageId);
        const targetMessageId = lastReceivedLog?.messageId || null;
        
        let reactionSuccess = false;
        if (targetMessageId) {
          reactionSuccess = !!(await evolutionApi.sendReaction(
            sourceInstance, targetPhone, targetMessageId, reaction
          ));
        }
        
        if (!reactionSuccess) {
          // Fallback: envia o emoji como texto
          try {
            const res = await evolutionApi.sendTextMessage(sourceInstance, targetPhone, reaction);
            sentMessageId = res?.key?.id || res?.id || null;
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
        
        const stickerResult = await evolutionApi.sendSticker(sourceInstance, targetPhone, stickerUrl);
        if (!stickerResult) {
          // Fallback para emoji se sticker falhar
          messageText = '😄';
          try {
            const res = await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
            sentMessageId = res?.key?.id || res?.id || null;
          } catch (err) {
            status = 'FAILED';
          }
        } else {
          sentMessageId = stickerResult?.key?.id || stickerResult?.id || null;
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
          const res = await evolutionApi.sendAudioUrl(sourceInstance, targetPhone, audioUrl);
          sentMessageId = res?.key?.id || res?.id || null;
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar áudio:', err);
          // Fallback para texto se áudio falhar
          try {
            messageType = 'TEXT';
            messageText = await generateNextWarmupMessage(personaContext, history, topic);
            typingDelay = calculateTypingDelay(messageText);
            await new Promise(r => setTimeout(r, typingDelay));
            const res = await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
            sentMessageId = res?.key?.id || res?.id || null;
          } catch (fallbackErr) {
            console.error('[Warmup Worker] Erro no fallback de texto do áudio:', fallbackErr);
            status = 'FAILED';
          }
        }

      } else if (action === 'IMAGE') {
        // Envio de foto com legenda
        messageType = 'TEXT';
        const imageUrl = WARMUP_IMAGE_URLS[Math.floor(Math.random() * WARMUP_IMAGE_URLS.length)];
        
        try {
          const context = `Gere uma legenda curta de WhatsApp (1 frase) em português para acompanhar o envio de uma foto. Use tom amigável.`;
          messageText = await generateNextWarmupMessage(context, [], topic);
        } catch (e) {
          messageText = 'Olha que legal essa foto! 📸';
        }
        
        typingDelay = 2000 + Math.random() * 3000;
        await new Promise(r => setTimeout(r, typingDelay));
        
        try {
          const res = await evolutionApi.sendMediaMessage(sourceInstance, targetPhone, imageUrl, 'image', messageText);
          sentMessageId = res?.key?.id || res?.id || null;
          messageText = `[Foto] ${messageText}`;
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar imagem:', err);
          status = 'FAILED';
        }

      } else if (action === 'LOCATION') {
        // Envio de localização com prelúdio
        messageType = 'TEXT';
        const loc = WARMUP_LOCATIONS[Math.floor(Math.random() * WARMUP_LOCATIONS.length)];
        
        try {
          const introText = "Tô passando por aqui ó, te mando a localização no mapa 📍";
          await evolutionApi.sendTextMessage(sourceInstance, targetPhone, introText);
        } catch {}

        messageText = `[Localização] ${loc.name} - ${loc.addr}`;
        typingDelay = 1500 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, typingDelay));
        
        try {
          const res = await evolutionApi.sendLocationMessage(sourceInstance, targetPhone, loc.lat, loc.lng, loc.name, loc.addr);
          sentMessageId = res?.key?.id || res?.id || null;
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar localização:', err);
          status = 'FAILED';
        }

      } else if (action === 'POLL') {
        // Envio de enquete interativa
        messageType = 'TEXT';
        const poll = WARMUP_POLLS[Math.floor(Math.random() * WARMUP_POLLS.length)];
        messageText = `[Enquete] ${poll.name}`;

        typingDelay = 2000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, typingDelay));

        try {
          const res = await evolutionApi.sendPollMessage(sourceInstance, targetPhone, poll.name, poll.options);
          sentMessageId = res?.key?.id || res?.id || null;
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar enquete:', err);
          status = 'FAILED';
        }

      } else if (action === 'CONTACT') {
        // Envio de cartão de contato
        messageType = 'TEXT';
        const contact = WARMUP_VCARDS[Math.floor(Math.random() * WARMUP_VCARDS.length)];
        messageText = `[Contato] ${contact.displayName}`;

        try {
          const introText = `Vou te passar o contato da ${contact.displayName}, anota aí! 📇`;
          await evolutionApi.sendTextMessage(sourceInstance, targetPhone, introText);
        } catch {}

        typingDelay = 1500 + Math.random() * 1500;
        await new Promise(r => setTimeout(r, typingDelay));

        try {
          const res = await evolutionApi.sendContactCard(sourceInstance, targetPhone, contact.displayName, contact.vcard);
          sentMessageId = res?.key?.id || res?.id || null;
        } catch (err) {
          console.error('[Warmup Worker] Erro ao enviar contato:', err);
          status = 'FAILED';
        }

      } else if (action === 'STATUS') {
        if (!campaign.enableStatus) {
          // Fallback to text message
          messageType = 'TEXT';
          // Marcar mensagens como lidas antes de responder (comportamento natural)
          if (history.length > 0) {
            await evolutionApi.markAsRead(sourceInstance, targetPhone);
            await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
          }
          try {
            messageText = await generateNextWarmupMessage(personaContext, history, topic);
            typingDelay = calculateTypingDelay(messageText);
            await new Promise(r => setTimeout(r, typingDelay));
            const res = await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
            sentMessageId = res?.key?.id || res?.id || null;
          } catch (err) {
            console.error('[Warmup Worker] Erro ao enviar texto fallback do status:', err);
            status = 'FAILED';
          }
        } else {
          // Postagem no Status/Stories
          messageType = 'TEXT';
          
          // Determine status type: text or image based on campaign config
          const sType = (campaign.statusType as string) === 'random' 
            ? (Math.random() > 0.5 ? 'image' : 'text')
            : ((campaign.statusType as string) === 'image' ? 'image' : 'text');
            
          const statusText = WARMUP_STATUS_TEXTS[Math.floor(Math.random() * WARMUP_STATUS_TEXTS.length)];
          const imageUrl = sType === 'image' 
            ? WARMUP_IMAGE_URLS[Math.floor(Math.random() * WARMUP_IMAGE_URLS.length)] 
            : undefined;
            
          messageText = `[Status - ${sType.toUpperCase()}] ${statusText}`;
          
          typingDelay = 1000 + Math.random() * 1000;
          await new Promise(r => setTimeout(r, typingDelay));
          
          try {
            await evolutionApi.sendStatusUpdate(sourceInstance, statusText, sType, targetPhone, imageUrl);
          } catch (err) {
            console.error('[Warmup Worker] Erro ao postar status:', err);
            status = 'FAILED';
          }
        }

      } else {
        // TEXT — geração via IA Gemini
        messageType = 'TEXT';
        
        // Marcar mensagens como lidas antes de responder (comportamento natural)
        if (history.length > 0) {
          await evolutionApi.markAsRead(sourceInstance, targetPhone);
          await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
        }
        
        messageText = await generateNextWarmupMessage(personaContext, history, topic);
        typingDelay = calculateTypingDelay(messageText);

        console.log(`[Warmup Worker] Texto gerado: "${messageText.substring(0, 50)}..." | Typing: ${Math.round(typingDelay / 1000)}s`);

        // Simular digitação ANTES de enviar
        await new Promise(r => setTimeout(r, typingDelay));

        try {
          const res = await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
          sentMessageId = res?.key?.id || res?.id || null;
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
          toPhone: action === 'STATUS' ? 'STATUS' : targetPhone,
          message: messageText,
          messageType: messageType as any,
          status,
          messageId: sentMessageId,
          delayUsed: Math.round(typingDelay),
        },
      });

      // ── 12. Atualizar campanha + Chip Health Score ─────────────────────────
      if (status === 'SENT') {
        await recordInstanceMessage(sourceInstance);
        await recordInstanceHourlyMessage(sourceInstance);
        // Reporta sucesso para o ChipRouter atualizar health score
        await reportChipSuccess(sourceInstance);
        
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

          // Atraso inteligente baseado no engajamento do contato
          let meanDelay = 90000;    // 90s padrão
          let stdDevDelay = 45000;  // 45s padrão

          if (campaign.isGroup) {
            // Para grupos, espaçamos em ~45 minutos por padrão para simular participação natural
            meanDelay = 45 * 60 * 1000;
            stdDevDelay = 15 * 60 * 1000;
            console.log(`[Warmup Worker] Campanha em grupo. Agendando próximo envio em ~45min.`);
          } else {
            const hasReplied = logs.some(l => l.fromInstance === nextPhone);
            const lastLog = logs[0]; // mais recente

            if (!hasReplied) {
              // Se o contato nunca respondeu nos logs recentes, espaçamos bastante (2.5h) para não parecer spam
              meanDelay = 2.5 * 60 * 60 * 1000; // 2.5 horas
              stdDevDelay = 30 * 60 * 1000;     // 30 minutos
              console.log(`[Warmup Worker] Destinatário ${nextPhone} nunca respondeu. Agendando próximo envio em ~2.5h.`);
            } else if (lastLog && lastLog.fromInstance === sourceInstance) {
              // Se a última mensagem foi nossa e estamos enviando outra consecutiva, espaçamos em ~1h
              meanDelay = 1 * 60 * 60 * 1000;   // 1 hora
              stdDevDelay = 15 * 60 * 1000;     // 15 minutos
              console.log(`[Warmup Worker] Destinatário ${nextPhone} já respondeu antes, mas a última mensagem foi nossa. Agendando em ~1h.`);
            } else {
              console.log(`[Warmup Worker] A última mensagem foi do destinatário ${nextPhone}. Agendando resposta rápida em ~90s.`);
            }
          }

          await queueWarmupMessage({
            campaignId,
            sourceInstance,
            targetPhone: nextPhone,
            isFirstMessageOfDay: false,
            currentTopic: topic,
          }, meanDelay, stdDevDelay);
        }
      } else {
        console.error(`[Warmup Worker] Falha no envio para campanha ${campaignId}. Verificando falhas consecutivas...`);
        // Reporta falha para o ChipRouter atualizar health score
        await reportChipFailure(sourceInstance, `Falha na campanha ${campaignId}`);

        // Busca logs recentes da campanha para contar falhas consecutivas
        const recentLogs = await prisma.warmupLog.findMany({
          where: { campaignId },
          orderBy: { createdAt: 'desc' },
          take: 3,
        });

        const consecutiveFailures = recentLogs.filter(l => l.status === 'FAILED').length;
        if (consecutiveFailures >= 3) {
          console.log(`[Warmup Worker] Campanha ${campaignId} atingiu ${consecutiveFailures} falhas consecutivas. Pausando automaticamente para evitar loops de envio.`);
          await prisma.warmupCampaign.update({
            where: { id: campaignId },
            data: { status: 'PAUSED', restPeriodUntil: null },
          });
        } else {
          // Em caso de falha pontual, reagenda com delay maior (5 min ± 1 min)
          await queueWarmupMessage({ campaignId, sourceInstance, targetPhone }, 300000, 60000);
        }
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
