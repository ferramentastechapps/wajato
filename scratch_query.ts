import { PrismaClient } from '@prisma/client';
import { queueWarmupMessage } from './src/lib/warmup-queue';

const prisma = new PrismaClient();

async function main() {
  const vitoriaCampaign = await prisma.warmupCampaign.update({
    where: { id: 'b29b9b87-36ff-458d-a63e-7a11d988642e' },
    data: {
      msgsSentToday: 0,
      currentDay: 2,
      targetMsgsToday: 8,
    }
  });

  console.log('Campaign updated:', vitoriaCampaign);

  // Enfileira mensagem para a vitoria iniciar o aquecimento hoje
  await queueWarmupMessage(
    {
      campaignId: vitoriaCampaign.id,
      sourceInstance: vitoriaCampaign.sourceInstance,
      targetPhone: vitoriaCampaign.targetPhone,
      isFirstMessageOfDay: true,
    },
    15000,
    5000
  );

  console.log('Mensagem de aquecimento para vitoria enfileirada com sucesso!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
