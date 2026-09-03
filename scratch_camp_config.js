const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const camp = await prisma.campaign.findUnique({
    where: { id: '67301fab-ec32-4cc3-96b5-f0ebc047c837' }
  });
  console.log('Campaign config:', camp);
  process.exit(0);
}
run();
