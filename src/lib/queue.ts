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
    removeOnFail: false, // Mantém falhas na fila para análise/re-tentativa manual
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
  return messageQueue.add(`send-message-${data.messageLogId}`, data, {
    delay: delayMs, // Delay nativo do BullMQ
    jobId: data.messageLogId, // ID único do job coincide com o MessageLog ID
  });
}

/**
 * Remove todas as mensagens pendentes de uma campanha da fila (usado ao pausar/cancelar)
 */
export async function cancelCampaignJobs(campaignId: string) {
  // Busca todos os jobs em espera ou agendados
  const jobs = await messageQueue.getJobs(['delayed', 'waiting']);
  
  for (const job of jobs) {
    if (job.data?.campaignId === campaignId) {
      await job.remove();
    }
  }
}
