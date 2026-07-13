import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { redisConnection } from './src/lib/redis';

const prisma = new PrismaClient();

async function main() {
  console.log('1. Atualizando endHour das campanhas para 23...');
  await prisma.warmupCampaign.updateMany({
    data: { endHour: 23 }
  });
  console.log('   ✅ endHour atualizado.');

  console.log('2. Esvaziando a fila warmup-queue...');
  const queue = new Queue('warmup-queue', { connection: redisConnection as any });
  try {
    await queue.drain();
    console.log('   ✅ Fila esvaziada com sucesso.');
  } catch (err: any) {
    console.error('Erro ao limpar a fila:', err.message);
  } finally {
    await queue.close();
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
