import { redisConnection } from './redis';

const KEY_PREFIX = 'wajato:sentBySystem:';
const TTL = 3600; // 1 hour in seconds

export const sentMessagesCache = {
  async add(messageId: string): Promise<void> {
    if (!messageId) return;
    try {
      await redisConnection.set(`${KEY_PREFIX}${messageId}`, '1', 'EX', TTL);
      console.log(`[SentMessagesCache] Adicionado: ${messageId}`);
    } catch (err) {
      console.error('[SentMessagesCache] Erro ao adicionar no Redis:', err);
    }
  },

  async has(messageId: string): Promise<boolean> {
    if (!messageId) return false;
    try {
      const exists = await redisConnection.exists(`${KEY_PREFIX}${messageId}`);
      return exists === 1;
    } catch (err) {
      console.error('[SentMessagesCache] Erro ao checar no Redis:', err);
      return false;
    }
  },

  async delete(messageId: string): Promise<void> {
    if (!messageId) return;
    try {
      await redisConnection.del(`${KEY_PREFIX}${messageId}`);
    } catch (err) {
      console.error('[SentMessagesCache] Erro ao deletar no Redis:', err);
    }
  }
};
