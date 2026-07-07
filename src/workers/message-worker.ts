import { Worker, Job } from 'bullmq';
import { redisConfiguration } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../lib/evolution';
import { MessageJobData } from '../lib/queue';
import { getNextWhatsAppInstance, reportChipSuccess, reportChipFailure } from '../lib/chip-router';
import './warmup-worker'; // Importa para iniciar o worker de aquecimento junto
import './warmup-pool-worker'; // Importa o worker de pool mútuo
import './scheduler-worker'; // Importa o worker de agendamento de campanhas

console.log('Iniciando o Worker de Mensagens do WaJato...');

const worker = new Worker(
  'message-queue',
  async (job: Job<MessageJobData>) => {
    const { messageLogId, campaignId, contactId, phone } = job.data;
    console.log(`[Worker] Processando mensagem ${messageLogId} para o telefone ${phone}`);

    // 1. Busca os detalhes da campanha e do contato
    const log = await prisma.messageLog.findUnique({
      where: { id: messageLogId },
      include: {
        contact: true,
        campaign: {
          include: {
            template: true,
            group: true,
          },
        },
      },
    });

    if (!log) {
      console.error(`[Worker] Log de mensagem ${messageLogId} não encontrado no banco.`);
      return;
    }

    // 2. Se a campanha não estiver em andamento (ex: pausada ou cancelada), cancela o envio
    if (log.campaign.status !== 'SENDING') {
      console.log(`[Worker] Campanha ${campaignId} está com status "${log.campaign.status}". Ignorando envio.`);
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: { status: 'PENDING', error: 'Campanha não está ativa' },
      });
      return;
    }

    // 3. Monta a mensagem interpolando variáveis
    const contactName = log.contact.name || 'Cliente';
    // Se houver {{link}} no template, substitui pela descrição do grupo (onde salvamos o link do grupo)
    const groupLink = log.campaign.group.description || '';
    
    let messageText = log.campaign.template.body
      .replace(/{{nome}}/g, contactName)
      .replace(/{{link}}/g, groupLink);

    // 4. Seleciona dinamicamente o chip ativo / saudável
    const activeInstanceName = await getNextWhatsAppInstance();

    // 5. Executa o envio pela Evolution API
    try {
      let response;
      if (log.campaign.template.imageUrl) {
        // Envia mensagem de mídia (Imagem) com legenda
        response = await evolutionApi.sendMediaMessage(
          activeInstanceName,
          phone,
          log.campaign.template.imageUrl,
          'image',
          messageText
        );
      } else {
        // Envia texto simples
        response = await evolutionApi.sendTextMessage(
          activeInstanceName,
          phone,
          messageText
        );
      }

      console.log(`[Worker] Mensagem ${messageLogId} enviada com sucesso para ${phone} via ${activeInstanceName}`);

      // Registra sucesso do chip no router
      await reportChipSuccess(activeInstanceName);

      // 6. Atualiza o status no banco local para SENT
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          error: null,
        },
      });

      // 7. Verifica se esta foi a última mensagem da campanha para finalizá-la
      await checkAndUpdateCampaignStatus(campaignId);

    } catch (error: any) {
      const errorMsg = error.message || 'Erro desconhecido no envio';
      console.error(`[Worker] Erro ao enviar mensagem ${messageLogId}:`, errorMsg);
      
      // Registra falha do chip no router para rebaixar sua saúde
      await reportChipFailure(activeInstanceName, errorMsg);

      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          status: 'FAILED',
          error: errorMsg,
        },
      });

      await checkAndUpdateCampaignStatus(campaignId);
      throw error; // Lança para que o BullMQ registre a falha no job
    }
  },
  {
    connection: redisConfiguration,
    concurrency: 1, // Envia de um em um para respeitar o delay e evitar banimentos
  }
);

/**
 * Verifica o status de todos os logs da campanha e a finaliza se necessário
 */
async function checkAndUpdateCampaignStatus(campaignId: string) {
  // Conta quantas mensagens ainda estão pendentes
  const pendingCount = await prisma.messageLog.count({
    where: {
      campaignId,
      status: 'PENDING',
    },
  });

  if (pendingCount === 0) {
    // Nenhuma mensagem pendente. Campanha concluída!
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED' },
    });
    console.log(`[Worker] Campanha ${campaignId} foi CONCLUÍDA com sucesso!`);
  }
}

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} falhou:`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker] Erro fatal no Worker:', err);
});
