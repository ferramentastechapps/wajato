const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const instances = await prisma.whatsAppInstance.findMany({
    select: { name: true, proxy: true, allowCampaigns: true }
  });
  console.log('Proxies:', instances);
  process.exit(0);
}
run();
