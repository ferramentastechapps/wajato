const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const chips = await prisma.whatsAppInstance.findMany({
    where: { status: 'CONNECTED' },
    select: { name: true, phone: true, status: true, allowCampaigns: true, healthScore: true, dailyMsgCount: true }
  });
  console.log('Chips CONNECTED:', chips);
  process.exit(0);
}
check();
