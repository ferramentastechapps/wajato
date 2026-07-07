/**
 * scheduler-worker.ts
 * Worker de agendamento de campanhas.
 * Verifica a cada 60 segundos se há campanhas com scheduledAt <= now() com status DRAFT
 * e as dispara automaticamente via a action de start.
 */
import { prisma } from '../lib/prisma';
import { messageQueue } from '../lib/queue';
import { resolveContactsForSegment } from '../lib/segment-resolver';
import { logger } from '../lib/logger';

logger.info('Worker de agendamento de campanhas (Scheduler) iniciado.');

const POLL_INTERVAL_MS = 60_000; // 60 segundos

async function dispatchScheduledCampaigns() {
  try {
    const now = new Date();

    // Busca campanhas em DRAFT com scheduledAt no passado ou presente
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: 'DRAFT',
        scheduledAt: {
          lte: now,
          not: null,
        },
      },
      include: {
        group: {
          include: {
            contacts: {
              select: { id: true, phone: true },
            },
          },
        },
        segment: true,
        template: { select: { id: true, name: true } },
      },
    });

    if (campaigns.length === 0) return;

    logger.info('Campanhas agendadas encontradas para despachar', { count: campaigns.length });

    for (const campaign of campaigns) {
      try {
        let contacts: { id: string; phone: string }[] = [];

        if (campaign.segmentId && campaign.segment) {
          const filters = typeof campaign.segment.filters === 'string'
            ? JSON.parse(campaign.segment.filters)
            : (campaign.segment.filters as any);
          contacts = await resolveContactsForSegment(filters);
        } else if (campaign.group) {
          contacts = campaign.group.contacts;
        }

        if (contacts.length === 0) {
          logger.warn('Campanha sem contatos. Ignorando.', { campaignId: campaign.id });
          // Marca como COMPLETED diretamente
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'COMPLETED' },
          });
          continue;
        }

        // Muda status para SENDING antes de enfileirar
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'SENDING' },
        });

        const delayMin = campaign.delayMin ?? 5;
        const delayMax = campaign.delayMax ?? 15;
        let cumulativeDelay = 0;

        for (const contact of contacts) {
          // Cria o MessageLog
          const messageLog = await prisma.messageLog.create({
            data: {
              campaignId: campaign.id,
              contactId: contact.id,
              status: 'PENDING',
            },
          });

          // Delay aleatório entre mensagens para parecer humano
          const individualDelay =
            Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
          cumulativeDelay += individualDelay;

          await messageQueue.add(
            `send-message-${messageLog.id}`,
            {
              messageLogId: messageLog.id,
              campaignId: campaign.id,
              contactId: contact.id,
              phone: contact.phone,
            },
            {
              delay: cumulativeDelay,
              jobId: messageLog.id,
            }
          );
        }

        logger.info('Campanha agendada despachada para a fila', {
          campaignId: campaign.id,
          campaignName: campaign.name,
          contactsCount: contacts.length,
        });
      } catch (err: any) {
        logger.error('Erro ao despachar campanha agendada', { campaignId: campaign.id, error: err.message });
      }
    }
  } catch (err: any) {
    logger.error('Erro crítico no loop de agendamento do Scheduler', { error: err.message });
  }
}

// Executa imediatamente na inicialização e depois a cada intervalo
dispatchScheduledCampaigns();
setInterval(dispatchScheduledCampaigns, POLL_INTERVAL_MS);
