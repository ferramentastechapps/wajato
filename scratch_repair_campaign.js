const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const prisma = new PrismaClient();
const redis = new Redis('redis://127.0.0.1:6379');
const messageQueue = new Queue('message-queue', { connection: redis });

const CAMPAIGN_ID = '67301fab-ec32-4cc3-96b5-f0ebc047c837';

async function repair() {
  console.log('=== 1. LIMPANDO JOBS RESIDUAIS ANTIGOS NO BULLMQ ===');
  const delayed = await messageQueue.getDelayed();
  console.log(`Encontrados ${delayed.length} jobs delayed no total.`);
  let removedCount = 0;
  for (const j of delayed) {
    if (j.data?.campaignId === CAMPAIGN_ID) {
      await j.remove().catch(() => {});
      removedCount++;
    }
  }
  console.log(`Removidos ${removedCount} jobs antigos com delay estático da campanha.`);

  console.log('\n=== 2. RESTAURANDO CONTATOS MARCADOS INDEVIDAMENTE ===');
  const failedLogs = await prisma.messageLog.findMany({
    where: {
      campaignId: CAMPAIGN_ID,
      status: 'FAILED',
      error: 'Número de telefone não possui conta ativa no WhatsApp'
    },
    select: { id: true, contactId: true }
  });
  console.log(`Encontrados ${failedLogs.length} logs para restaurar.`);

  if (failedLogs.length > 0) {
    const contactIds = [...new Set(failedLogs.map(l => l.contactId))];
    
    // Reseta status do contato (remove optOut indevido)
    const updatedContacts = await prisma.contact.updateMany({
      where: { id: { in: contactIds } },
      data: { optOut: false, optOutAt: null }
    });
    console.log(`Restaurados ${updatedContacts.count} contatos (optOut = false).`);

    // Reseta MessageLogs para PENDING
    const updatedLogs = await prisma.messageLog.updateMany({
      where: {
        campaignId: CAMPAIGN_ID,
        status: 'FAILED',
        error: 'Número de telefone não possui conta ativa no WhatsApp'
      },
      data: { status: 'PENDING', error: null }
    });
    console.log(`Restaurados ${updatedLogs.count} messageLogs para PENDING.`);
  }

  console.log('\n=== 3. INICIANDO DISPARO DA ESTEIRA DINÂMICA (DELAY 0) ===');
  const firstPending = await prisma.messageLog.findFirst({
    where: { campaignId: CAMPAIGN_ID, status: 'PENDING' },
    orderBy: { updatedAt: 'asc' },
    include: { contact: true }
  });

  if (firstPending) {
    console.log(`Enfileirando primeiro contato pendente: ${firstPending.contact.name || firstPending.contact.phone} (${firstPending.id})`);
    // Remove qualquer job residual com esse id antes de adicionar
    const existingJob = await messageQueue.getJob(firstPending.id);
    if (existingJob) await existingJob.remove().catch(() => {});

    await messageQueue.add(
      `send-message-${firstPending.id}`,
      {
        messageLogId: firstPending.id,
        campaignId: CAMPAIGN_ID,
        contactId: firstPending.contactId,
        phone: firstPending.contact.phone
      },
      {
        delay: 0,
        jobId: firstPending.id,
        removeOnComplete: true
      }
    );
    console.log('✅ Primeiro contato enfileirado com sucesso!');
  } else {
    console.log('Nenhum contato pendente encontrado na campanha.');
  }

  process.exit(0);
}

repair().catch(err => {
  console.error('Erro no repair:', err);
  process.exit(1);
});
