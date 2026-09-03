import { Queue, Job } from 'bullmq';
import { redisConnection } from './redis';

const QUEUE_NAME = 'message-queue';

// Inicializa a fila principal de mensagens
export const messageQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3, // Tenta 3 vezes em caso de falha temporária
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: true, // Remove da fila ao concluir com sucesso para não saturar o Redis
    removeOnFail: { count: 200 }, // Mantém até 200 falhas recentes para diagnóstico sem vazar memória
  },
});

export interface MessageJobData {
  messageLogId: string;
  campaignId: string;
  contactId: string;
  phone: string;
}

/**
 * Adiciona um disparo de mensagem à fila com um delay específico
 */
export async function queueMessage(data: MessageJobData, delayMs: number) {
  // Se o job já existia na fila com delay estático anterior, remove-o para o novo delay valer
  const existingJob = await messageQueue.getJob(data.messageLogId);
  if (existingJob) {
    await existingJob.remove().catch(() => {});
  }

  return messageQueue.add(`send-message-${data.messageLogId}`, data, {
    delay: delayMs, // Delay nativo do BullMQ
    jobId: data.messageLogId, // ID único do job coincide com o MessageLog ID
    removeOnComplete: true,
  });
}

/**
 * Remove todas as mensagens pendentes de uma campanha da fila (usado ao pausar/cancelar)
 */
export async function cancelCampaignJobs(campaignId: string) {
  // Busca todos os jobs em espera, agendados ou ativos
  const jobs = await messageQueue.getJobs(['delayed', 'waiting', 'active']);
  
  for (const job of jobs) {
    if (job.data?.campaignId === campaignId) {
      await job.remove().catch(() => {});
    }
  }
}
