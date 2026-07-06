/**
 * warmup-queue.ts
 * Fila de mensagens de warmup com jitter gaussiano (Box-Muller Transform).
 * O jitter gaussiano é muito mais humano que o jitter linear uniforme —
 * ele concentra delays perto da média com variações naturais nas bordas,
 * exatamente como humanos reais respondem mensagens.
 */
import { Queue } from 'bullmq';
import { redisConnection } from './redis';

const WARMUP_QUEUE_NAME = 'warmup-queue';

export const warmupQueue = new Queue(WARMUP_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000, // 10s, 20s, 40s — mais conservador
    },
    removeOnComplete: { count: 100 }, // Mantém os últimos 100 jobs completos para debug
    removeOnFail: { count: 200 },     // Mantém os últimos 200 falhos para análise
  },
});

export interface WarmupJobData {
  campaignId: string;
  sourceInstance: string;
  targetPhone: string;
  isFirstMessageOfDay?: boolean;
  isRestPeriodEnd?: boolean;   // Sinaliza que é o primeiro job após rest period
  currentTopic?: string;        // Tópico atual da conversa para continuidade
}

/**
 * Gera um número aleatório com distribuição Gaussiana (normal).
 * Usa a transformada de Box-Muller para converter dois uniforms → Gaussian.
 * 
 * @returns Número com média 0 e desvio padrão 1
 */
function gaussianRandom(): number {
  let u = 0, v = 0;
  // Evita log(0)
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Gera um delay aleatório com distribuição gaussiana (bell curve).
 * A maioria dos delays fica próxima à média, com variações naturais nas bordas.
 * Muito mais humano e difícil de detectar do que delay linear uniforme.
 * 
 * @param meanMs - Média do delay em ms (centro da bell curve)
 * @param stdDevMs - Desvio padrão em ms (largura da bell curve)
 * @param minMs - Delay mínimo absoluto (floor)
 * @param maxMs - Delay máximo absoluto (ceiling)
 */
export function gaussianDelay(
  meanMs: number,
  stdDevMs: number,
  minMs: number = 15000,
  maxMs: number = 300000
): number {
  const gaussian = gaussianRandom();
  const delay = Math.round(meanMs + gaussian * stdDevMs);
  return Math.max(minMs, Math.min(maxMs, delay));
}

/**
 * Adiciona uma mensagem de warmup na fila com delay gaussiano.
 * O padrão profissional usa média de 90s com desvio de 45s,
 * resultando em delays concentrados entre 45s e 3 min.
 */
export async function queueWarmupMessage(
  data: WarmupJobData,
  meanDelay: number = 90000,   // 90 segundos de média
  stdDevDelay: number = 45000  // 45 segundos de desvio padrão
) {
  const delayMs = gaussianDelay(meanDelay, stdDevDelay, 20000, 600000);

  console.log(`[WarmupQueue] Job agendado com delay gaussiano de ${Math.round(delayMs / 1000)}s para campanha ${data.campaignId}`);

  return warmupQueue.add(`warmup-${data.campaignId}-${Date.now()}`, data, {
    delay: delayMs,
  });
}

/**
 * Remove todos os jobs pendentes de uma campanha específica da fila.
 * Usado ao pausar, encerrar ou deletar uma campanha.
 */
export async function cancelCampaignWarmupJobs(campaignId: string): Promise<number> {
  const states = ['delayed', 'waiting', 'prioritized'] as const;
  let removed = 0;

  for (const state of states) {
    const jobs = await warmupQueue.getJobs([state]);
    for (const job of jobs) {
      if (job.data?.campaignId === campaignId) {
        await job.remove();
        removed++;
      }
    }
  }

  console.log(`[WarmupQueue] ${removed} jobs removidos da fila para campanha ${campaignId}`);
  return removed;
}
