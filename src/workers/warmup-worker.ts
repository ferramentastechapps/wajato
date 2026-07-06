import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../lib/evolution';
import { generateNextWarmupMessage, ChatMessage } from '../lib/warmup-ai';
import { queueWarmupMessage, WarmupJobData } from '../lib/warmup-queue';

const WARMUP_QUEUE_NAME = 'warmup-queue';

export const warmupWorker = new Worker(
  WARMUP_QUEUE_NAME,
  async (job: Job<WarmupJobData>) => {
    const { campaignId, sourceInstance, targetPhone, isFirstMessageOfDay } = job.data;
    
    console.log(`[Warmup Worker] Iniciando job para campanha ${campaignId}, enviando por ${sourceInstance}`);

    const campaign = await prisma.warmupCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.status !== 'RUNNING') {
      console.log(`[Warmup Worker] Campanha ${campaignId} inativa ou não encontrada. Ignorando.`);
      return;
    }

    // Se a cota diária foi atingida, agenda o primeiro tiro do dia seguinte
    if (campaign.msgsSentToday >= campaign.targetMsgsToday && !isFirstMessageOfDay) {
      console.log(`[Warmup Worker] Cota diária atingida (${campaign.msgsSentToday}/${campaign.targetMsgsToday}) para ${campaignId}. Agendando para amanhã.`);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // Começa às 9h do dia seguinte
      
      const delayMs = Math.max(0, tomorrow.getTime() - Date.now());
      
      // Aumenta a cota no dia seguinte (Ramp-up exponencial leve)
      const nextDay = campaign.currentDay + 1;
      const nextTarget = Math.min(Math.floor(campaign.targetMsgsToday * 1.5), 150); // Até 150/dia

      await prisma.warmupCampaign.update({
        where: { id: campaign.id },
        data: {
          currentDay: nextDay,
          msgsSentToday: 0,
          targetMsgsToday: nextTarget,
          status: nextDay > campaign.totalDays ? 'COMPLETED' : 'RUNNING',
        }
      });

      if (nextDay <= campaign.totalDays) {
        await queueWarmupMessage({
          campaignId: campaign.id,
          sourceInstance: campaign.sourceInstance,
          targetPhone: campaign.targetPhone,
          isFirstMessageOfDay: true
        }, delayMs, delayMs + 60000); // 1 minuto de jitter pro início do dia
      }
      return;
    }

    // Buscar histórico de mensagens da campanha para contexto da IA
    const logs = await prisma.warmupLog.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Inverter array para ordem cronológica e mapear pro formato da IA
    const history: ChatMessage[] = logs.reverse().map(log => ({
      role: log.fromInstance === sourceInstance ? 'model' : 'user',
      parts: [{ text: log.message }],
    }));

    // Gerar mensagem com IA
    const context = `Você está sendo o contato ${sourceInstance}. Hoje é o dia ${campaign.currentDay} de aquecimento.`;
    const messageText = await generateNextWarmupMessage(context, history);

    // Tempo de digitação baseado no tamanho do texto gerado
    // Simulando 150 caracteres por minuto -> 400ms por caractere
    const typingDelay = Math.min(messageText.length * 400, 15000); 

    console.log(`[Warmup Worker] Gerada mensagem de ${messageText.length} caracteres. Simulando digitação por ${typingDelay}ms...`);
    
    // Aguardar o tempo de digitação ANTES de enviar para ficar natural
    await new Promise(resolve => setTimeout(resolve, typingDelay));

    // Enviar mensagem via Evolution API
    let status = 'SENT';
    try {
      await evolutionApi.sendTextMessage(sourceInstance, targetPhone, messageText);
    } catch (err) {
      console.error(`[Warmup Worker] Erro ao enviar mensagem:`, err);
      status = 'FAILED';
    }

    // Registrar log
    await prisma.warmupLog.create({
      data: {
        campaignId: campaign.id,
        fromInstance: sourceInstance,
        toPhone: targetPhone,
        message: messageText,
        status: status,
      }
    });

    if (status === 'SENT') {
      await prisma.warmupCampaign.update({
        where: { id: campaign.id },
        data: { msgsSentToday: { increment: 1 } }
      });

      // Se for bidirecional e houver targetInstance, agenda a RESPOSTA do outro lado
      if (campaign.targetInstance) {
        // Encontra o telefone do rementente atual para que a outra instância saiba pra quem responder
        const sourceInst = await prisma.whatsAppInstance.findUnique({
          where: { name: sourceInstance }
        });
        
        if (sourceInst?.phone) {
           await queueWarmupMessage({
             campaignId: campaign.id,
             // O próximo a enviar é quem era o target atual
             sourceInstance: sourceInstance === campaign.sourceInstance ? campaign.targetInstance : campaign.sourceInstance,
             // O destino é quem acabou de enviar
             targetPhone: sourceInst.phone, 
             isFirstMessageOfDay: false
           });
        }
      } else {
         // Unidirecional: agenda para a MESMA instância mandar outra mensagem depois
         await queueWarmupMessage({
             campaignId: campaign.id,
             sourceInstance: campaign.sourceInstance,
             targetPhone: campaign.targetPhone, 
             isFirstMessageOfDay: false
         });
      }
    }
  },
  {
    connection: redisConnection as any,
  }
);
