/**
 * warmup-pool-queue.ts
 * Fila de agendamento de jobs de pool mútuo no BullMQ.
 * Usa jitter gaussiano (Box-Muller) para garantir humanização de interações em grupo.
 */

import { Queue } from 'bullmq';
import { redisConnection } from './redis';
import { gaussianDelay } from './warmup-queue';

const WARMUP_POOL_QUEUE_NAME = 'warmup-pool-queue';

export const warmupPoolQueue = new Queue(WARMUP_POOL_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export interface WarmupPoolJobData {
  poolId: string;
  senderInstance?: string;    // Definido se for uma resposta agendada
  receiverInstance?: string;  // Definido se for uma resposta agendada
  isFirstMessageOfDay?: boolean;
}

/**
 * Agenda um envio de mensagem no pool mútuo com delay gaussiano.
 * Padrão: média de 2 minutos (120s) com 45s de desvio padrão.
 */
export async function queuePoolMessage(
  data: WarmupPoolJobData,
  meanDelay: number = 120000,
  stdDevDelay: number = 45000
) {
  // Se o meanDelay for muito grande (esperar amanhã ou próxima janela),
  // não devemos limitar a 15 min. O teto dinâmico garante isso.
  const maxLimit = Math.max(900000, meanDelay + stdDevDelay * 3);
  const delayMs = gaussianDelay(meanDelay, stdDevDelay, 30000, maxLimit); // 30s min

  console.log(`[WarmupPoolQueue] Job agendado com delay gaussiano de ${Math.round(delayMs / 1000)}s para o pool ${data.poolId}`);

  return warmupPoolQueue.add(`pool-${data.poolId}-${Date.now()}`, data, {
    delay: delayMs,
  });
}

/**
 * Cancela todos os jobs pendentes de um pool específico.
 */
export async function cancelWarmupPoolJobs(poolId: string): Promise<number> {
  const states = ['delayed', 'waiting', 'prioritized'] as const;
  let removed = 0;

  for (const state of states) {
    const jobs = await warmupPoolQueue.getJobs([state]);
    for (const job of jobs) {
      if (job.data?.poolId === poolId) {
        await job.remove();
        removed++;
      }
    }
  }

  console.log(`[WarmupPoolQueue] ${removed} jobs removidos da fila para o pool ${poolId}`);
  return removed;
}
