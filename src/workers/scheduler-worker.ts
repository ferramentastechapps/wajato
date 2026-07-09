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
import { runProxySelfHealer } from '../lib/proxy-healer';

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

// ─── Cron diário: zera contadores de chip às 00:05 BRT ──────────────────────
/**
 * Agenda o reset diário dos contadores (dailyMsgCount) de todos os chips.
 * Executa às 00:05 BRT (03:05 UTC) todo dia.
 *
 * Isso corrige o bug identificado v3.0: resetDailyMsgCounters() nunca
 * era chamado automaticamente, fazendo o dailyMsgCount acumular para sempre.
 */
async function scheduleDailyChipReset() {
  const { resetDailyMsgCounters } = await import('../lib/chip-router');

  function getMsUntilNextReset(): number {
    const now = new Date();
    // Próximo 03:05 UTC = 00:05 BRT
    const next = new Date(now);
    next.setUTCHours(3, 5, 0, 0);
    if (next.getTime() <= now.getTime()) {
      // Já passou hoje, agenda para amanhã
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  async function runReset() {
    logger.info('[Scheduler] Iniciando reset diário dos contadores de chip...');
    await resetDailyMsgCounters();
    logger.info('[Scheduler] ✅ Reset diário dos chips concluído.');
    // Re-agenda para o próximo dia
    setTimeout(runReset, getMsUntilNextReset());
  }

  // Agenda o primeiro reset
  const msUntilFirst = getMsUntilNextReset();
  logger.info(`[Scheduler] Reset de chips agendado em ${Math.round(msUntilFirst / 3600000)}h.`);
  setTimeout(runReset, msUntilFirst);
}

scheduleDailyChipReset().catch(err =>
  logger.error('[Scheduler] Erro ao iniciar cron de reset de chips:', err)
);

// ─── Cron de Auto-Healing de Proxies (Verificação a cada 5 minutos) ──────────
const PROXY_CHECK_INTERVAL_MS = 300_000;
runProxySelfHealer().catch(err =>
  logger.error('[Scheduler] Erro na verificação inicial de proxies:', err)
);
setInterval(() => {
  runProxySelfHealer().catch(err =>
    logger.error('[Scheduler] Erro na execução periódica do Proxy Healer:', err)
  );
}, PROXY_CHECK_INTERVAL_MS);
