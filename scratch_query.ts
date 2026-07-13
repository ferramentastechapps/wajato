import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { redisConnection } from './src/lib/redis';

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.warmupCampaign.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      sourceInstance: true,
      targetPhone: true,
      endHour: true,
    }
  });
  console.log('--- WARMUP CAMPAIGNS ---');
  console.log(JSON.stringify(campaigns, null, 2));

  const logs = await prisma.warmupLog.findMany({
    take: 15,
    orderBy: { createdAt: 'desc' }
  });
  console.log('--- WARMUP LOGS ---');
  console.log(JSON.stringify(logs, null, 2));

  const queue = new Queue('warmup-queue', { connection: redisConnection as any });
  try {
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'failed', 'completed']);
    console.log('--- WARMUP QUEUE JOBS ---');
    console.log(JSON.stringify(
      jobs.map(j => ({
        id: j.id,
        name: j.name,
        data: j.data,
        delay: j.opts.delay,
        timestamp: new Date(j.timestamp),
        nextRun: new Date(j.timestamp + (j.opts.delay || 0))
      })),
      null,
      2
    ));
  } catch (err: any) {
    console.error('Error querying BullMQ:', err.message);
  } finally {
    await queue.close();
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
