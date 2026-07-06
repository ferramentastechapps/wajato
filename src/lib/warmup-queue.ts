import { Queue } from 'bullmq';
import { redisConnection } from './redis';

const WARMUP_QUEUE_NAME = 'warmup-queue';

export const warmupQueue = new Queue(WARMUP_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export interface WarmupJobData {
  campaignId: string;
  sourceInstance: string;
  targetPhone: string;
  isFirstMessageOfDay?: boolean;
}

/**
 * Adiciona uma mensagem de warmup na fila com um delay aleatório (Jitter / Gaussian).
 */
export async function queueWarmupMessage(data: WarmupJobData, minDelay: number = 30000, maxDelay: number = 180000) {
  // Gera um delay aleatório entre minDelay e maxDelay (padrão: entre 30s e 3 min)
  const delayMs = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  
  return warmupQueue.add(`warmup-${data.campaignId}-${Date.now()}`, data, {
    delay: delayMs,
  });
}
