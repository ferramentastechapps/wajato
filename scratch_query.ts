import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.warmupLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  console.log('--- WARMUP LOGS ---');
  console.log(JSON.stringify(logs, null, 2));
  
  const campaigns = await prisma.warmupCampaign.findMany({
    select: {
      id: true,
      name: true,
      sourceInstance: true,
      targetPhone: true,
      targetPhones: true,
      status: true,
      isGroup: true
    }
  });
  console.log('--- CAMPAIGNS ---');
  console.log(JSON.stringify(campaigns, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
