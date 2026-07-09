/**
 * warmup-rate-limiter.ts
 * Rate limiter por instância do WhatsApp usando Redis.
 *
 * v3.0 — Melhorias críticas:
 * - Janela deslizante REAL com Redis Sorted Set (ZADD + ZREMRANGEBYSCORE + ZCARD)
 *   Elimina o bug da hora fixa UTC onde era possível enviar 60+60=120 mensagens
 *   em 2 minutos na virada de hora.
 * - Operação de registro+verificação mais segura e atômica por design.
 */

import { redisConnection } from './redis';

const SLOT_TTL_SECONDS = 120;    // Slot expira em 2 minutos se não liberado
const SLIDING_WINDOW_SECONDS = 3600; // Janela deslizante de 60 minutos
const MAX_MSGS_PER_INSTANCE_PER_HOUR = 60; // Limite real por 60 min corridos

const INSTANCE_COOLDOWN_KEY  = (instance: string) => `warmup:instance:lock:${instance}`;
const INSTANCE_DAILY_KEY     = (instance: string, date: string) => `warmup:instance:daily:${instance}:${date}`;
const INSTANCE_SLIDING_KEY   = (instance: string) => `warmup:instance:sliding:${instance}`;

// ─── Mutex de instância (1 envio por vez por chip) ───────────────────────────

/**
 * Tenta adquirir o slot de envio para uma instância.
 * Se outra campanha está usando a instância, retorna false.
 * Usa SET NX EX para garantir atomicidade total.
 */
export async function acquireInstanceSlot(instanceName: string): Promise<boolean> {
  const key = INSTANCE_COOLDOWN_KEY(instanceName);
  const result = await redisConnection.set(key, '1', 'EX', SLOT_TTL_SECONDS, 'NX');
  return result === 'OK';
}

/**
 * Libera o slot da instância após envio concluído.
 */
export async function releaseInstanceSlot(instanceName: string): Promise<void> {
  await redisConnection.del(INSTANCE_COOLDOWN_KEY(instanceName));
}

// ─── Contador diário (persiste 25h para análise) ─────────────────────────────

/**
 * Registra uma mensagem enviada no contador diário da instância.
 * Retorna o total de mensagens enviadas hoje.
 */
export async function recordInstanceMessage(instanceName: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = INSTANCE_DAILY_KEY(instanceName, today);
  const count = await redisConnection.incr(key);
  if (count === 1) {
    // TTL de 25 horas garante limpeza automática após o dia
    await redisConnection.expire(key, 25 * 60 * 60);
  }
  return count;
}

/**
 * Retorna o número de mensagens enviadas hoje pela instância.
 */
export async function getInstanceDailyCount(instanceName: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = INSTANCE_DAILY_KEY(instanceName, today);
  const val = await redisConnection.get(key);
  return val ? parseInt(val, 10) : 0;
}

// ─── Janela deslizante real (Sliding Window — Redis Sorted Set) ───────────────

/**
 * Verifica se a instância está dentro do limite de 60 msgs/60min corridos.
 *
 * Usa Redis Sorted Set onde:
 *   score = timestamp Unix em ms do envio
 *   member = UUID único do envio
 *
 * A janela remove automaticamente eventos anteriores a (agora - 60min),
 * garantindo que o limite seja sempre calculado sobre os últimos 60 minutos
 * REAIS, sem o bug de virada de hora do contador fixo.
 */
export async function isInstanceWithinHourlyLimit(instanceName: string): Promise<boolean> {
  const key = INSTANCE_SLIDING_KEY(instanceName);
  const now = Date.now();
  const windowStart = now - SLIDING_WINDOW_SECONDS * 1000;

  // Remove entradas antigas fora da janela de 60 min
  await redisConnection.zremrangebyscore(key, '-inf', windowStart);

  // Conta mensagens na janela atual
  const count = await redisConnection.zcard(key);
  return count < MAX_MSGS_PER_INSTANCE_PER_HOUR;
}

/**
 * Registra uma mensagem na janela deslizante da instância.
 * Deve ser chamado APÓS o envio bem-sucedido, junto com recordInstanceMessage.
 */
export async function recordInstanceHourlyMessage(instanceName: string): Promise<void> {
  const key = INSTANCE_SLIDING_KEY(instanceName);
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 9)}`;

  // Adiciona o evento com score = timestamp atual
  await redisConnection.zadd(key, now, member);

  // TTL de 2 horas garante limpeza automática (janela máxima é 60 min)
  await redisConnection.expire(key, SLIDING_WINDOW_SECONDS * 2);
}

/**
 * Retorna o número de mensagens enviadas nos últimos 60 minutos pela instância.
 * Útil para exibir no dashboard de saúde dos chips.
 */
export async function getInstanceHourlyCount(instanceName: string): Promise<number> {
  const key = INSTANCE_SLIDING_KEY(instanceName);
  const windowStart = Date.now() - SLIDING_WINDOW_SECONDS * 1000;

  // Limpa entradas antigas
  await redisConnection.zremrangebyscore(key, '-inf', windowStart);

  return redisConnection.zcard(key);
}
