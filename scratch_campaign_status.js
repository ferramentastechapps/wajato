const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      _count: { select: { logs: true } }
    }
  });

  console.log('=== CAMPANHAS ===');
  for (const c of campaigns) {
    const counts = await prisma.messageLog.groupBy({
      by: ['status'],
      where: { campaignId: c.id },
      _count: true
    });
    console.log(`Campanha: "${c.name}" | Status: ${c.status} | Total logs: ${c._count.logs}`);
    console.log('  Status logs:', counts);
  }

  // Ultimos 10 logs de mensagens
  const lastLogs = await prisma.messageLog.findMany({
    take: 10,
    orderBy: { updatedAt: 'desc' },
    include: {
      contact: { select: { name: true, phone: true } },
      campaign: { select: { name: true } }
    }
  });
  console.log('\n=== ULTIMOS 10 LOGS ===');
  for (const l of lastLogs) {
    console.log(`[${l.updatedAt.toISOString()}] Camp: ${l.campaign.name} | Para: ${l.contact.phone} (${l.contact.name}) | Status: ${l.status} | Erro: ${l.error || 'Nenhum'}`);
  }

  process.exit(0);
}

check();
