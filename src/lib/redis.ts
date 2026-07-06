import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

const redisConfiguration = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  maxRetriesPerRequest: null, // Obrigatório para BullMQ
};

export const redisConnection = new Redis(redisConfiguration);

redisConnection.on('error', (err) => {
  console.error('Erro de conexão com o Redis:', err);
});
export { redisConfiguration };
