/**
 * warmup-rate-limiter.ts
 * Rate limiter por instância do WhatsApp usando Redis.
 * Garante que múltiplas campanhas na mesma instância
 * não enviem mensagens simultaneamente (evita ban por burst).
 */

import { redisConnection } from './redis';

const SLOT_TTL_SECONDS = 120; // Slot expira em 2 minutos se não liberado
const INSTANCE_COOLDOWN_KEY = (instance: string) => `warmup:instance:lock:${instance}`;
const INSTANCE_MSG_COUNT_KEY = (instance: string, date: string) => `warmup:instance:daily:${instance}:${date}`;
const MAX_MSGS_PER_INSTANCE_PER_HOUR = 60; // Máximo global por hora por instância (segurança extra)

/**
 * Tenta adquirir o slot de envio para uma instância.
 * Se outra campanha está usando a instância, retorna false.
 * Usa SET NX EX para garantir atomicidade.
 */
export async function acquireInstanceSlot(instanceName: string): Promise<boolean> {
  const key = INSTANCE_COOLDOWN_KEY(instanceName);
  
  // SET key value NX EX ttl — somente seta se não existir
  const result = await redisConnection.set(key, '1', 'EX', SLOT_TTL_SECONDS, 'NX');
  return result === 'OK';
}

/**
 * Libera o slot da instância após envio concluído.
 */
export async function releaseInstanceSlot(instanceName: string): Promise<void> {
  const key = INSTANCE_COOLDOWN_KEY(instanceName);
  await redisConnection.del(key);
}

/**
 * Registra uma mensagem enviada no contador diário da instância.
 * Retorna o total de mensagens enviadas hoje por essa instância.
 */
export async function recordInstanceMessage(instanceName: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = INSTANCE_MSG_COUNT_KEY(instanceName, today);
  
  const count = await redisConnection.incr(key);
  // TTL de 25 horas para garantir limpeza automática
  if (count === 1) {
    await redisConnection.expire(key, 25 * 60 * 60);
  }
  return count;
}

/**
 * Retorna o número de mensagens enviadas hoje pela instância.
 */
export async function getInstanceDailyCount(instanceName: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = INSTANCE_MSG_COUNT_KEY(instanceName, today);
  const val = await redisConnection.get(key);
  return val ? parseInt(val, 10) : 0;
}

/**
 * Verifica se a instância está dentro do limite global por hora.
 * Usa uma janela deslizante simples.
 */
export async function isInstanceWithinHourlyLimit(instanceName: string): Promise<boolean> {
  const hourKey = `warmup:instance:hourly:${instanceName}:${new Date().getUTCHours()}`;
  const count = await redisConnection.get(hourKey);
  return !count || parseInt(count, 10) < MAX_MSGS_PER_INSTANCE_PER_HOUR;
}

/**
 * Registra uma mensagem no contador por hora da instância.
 */
export async function recordInstanceHourlyMessage(instanceName: string): Promise<void> {
  const hourKey = `warmup:instance:hourly:${instanceName}:${new Date().getUTCHours()}`;
  const count = await redisConnection.incr(hourKey);
  if (count === 1) {
    await redisConnection.expire(hourKey, 3600); // expira em 1 hora
  }
}
