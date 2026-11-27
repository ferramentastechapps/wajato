import { prisma } from './prisma';
import { logger } from './logger';
import { evolutionApi } from './evolution';

// Controle de assinaturas (CineON) e aviso automático de vencimento.
// Os clientes pagantes estão nos DOIS painéis (Painel Plus e SmartPlay) e o
// Painel Plus não tem API de gestão — por isso o controle vive no Wajato.
// Pagar pelo link do painel renova o MESMO usuário (o painel estende sozinho).

export type SubscriptionPanel = 'painel_plus' | 'smartplay';
export type SubscriptionStatus = 'trial' | 'active' | 'expired';

/** Painel exibido no código ('Painel Plus' | 'SmartPlay' | 'Sigma') -> slug do banco */
export function panelSlug(panel: string): SubscriptionPanel {
  return panel.toLowerCase().includes('plus') ? 'painel_plus' : 'smartplay';
}

export function panelLabel(panel: string): string {
  return panel === 'painel_plus' ? 'Painel Plus' : 'SmartPlay';
}

/**
 * Converte a data de vencimento que vem dos painéis para Date.
 * Os links devolvem "YYYY-MM-DD HH:mm:ss" (horário de Brasília, sem fuso);
 * a API do Sigma devolve ISO. Sem fuso explícito, assume -03:00 (BRT).
 * Retorna null quando não dá para interpretar.
 */
export function parsePanelDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // "2026-11-27 01:52:05" -> "2026-11-27T01:52:05-03:00"
  const brtMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (brtMatch) {
    const d = new Date(
      `${brtMatch[1]}-${brtMatch[2]}-${brtMatch[3]}T${brtMatch[4]}:${brtMatch[5]}:${brtMatch[6] || '00'}-03:00`,
    );
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

export interface TrialSubscriptionInput {
  phone: string;
  contactId?: string | null;
  panel: string; // 'Painel Plus' | 'SmartPlay' | 'Sigma'
  username: string;
  planName?: string | null;
  connections?: number | null;
  expiresAt: unknown;
  payUrl?: string | null;
}

/**
 * Auto-registro do teste gerado pelo agente (caminho dos links E caminho Sigma).
 * Nunca lança erro e nunca rebaixa uma assinatura 'active' para 'trial':
 * se o cliente já é pagante, o teste novo não toca no registro dele.
 */
export async function recordTrialSubscription(input: TrialSubscriptionInput): Promise<void> {
  try {
    const normPhone = input.phone.replace(/\D/g, '');
    const expiresAt = parsePanelDate(input.expiresAt);
    if (!normPhone || !input.username || !expiresAt) {
      logger.warn('[Assinaturas] Teste sem telefone, usuário ou vencimento válido — não registrado', {
        phone: normPhone,
        username: input.username,
        expiresAt: input.expiresAt,
      });
      return;
    }

    const panel = panelSlug(input.panel);
    const existing = await prisma.subscription.findFirst({
      where: { phone: normPhone, username: input.username },
      orderBy: { createdAt: 'desc' },
    });

    if (existing?.status === 'active') return; // pagante: o teste não toca no registro

    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          contactId: input.contactId ?? existing.contactId,
          panel,
          planName: input.planName ?? existing.planName,
          connections: input.connections ?? existing.connections,
          expiresAt,
          payUrl: input.payUrl ?? existing.payUrl,
          status: 'trial',
          warnedAt: null,
        },
      });
      return;
    }

    await prisma.subscription.create({
      data: {
        contactId: input.contactId ?? null,
        phone: normPhone,
        panel,
        username: input.username,
        planName: input.planName ?? null,
        connections: input.connections ?? null,
        expiresAt,
        payUrl: input.payUrl ?? null,
        status: 'trial',
      },
    });
  } catch (error: any) {
    logger.error('[Assinaturas] Erro ao registrar teste como assinatura', error);
  }
}

function formatExpiryBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Rotina diária de aviso de vencimento (roda de manhã, ver scheduler-worker).
 * Para cada assinatura 'active' com vencimento dentro de 3 dias e sem aviso
 * válido para este vencimento, envia o aviso no WhatsApp pela instância
 * vinculada à empresa do cliente e grava warnedAt. Sem instância vinculada,
 * pula e registra no log. Nunca envia duas vezes o mesmo aviso para o
 * mesmo vencimento: warnedAt só é considerado válido quando é posterior a
 * (expiresAt - 3 dias), ou seja, foi enviado dentro da janela deste vencimento.
 */
export async function runExpiryWarnings(): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 };
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  try {
    const due = await prisma.subscription.findMany({
      where: {
        status: 'active',
        expiresAt: { gt: now, lte: windowEnd },
      },
      include: { contact: { select: { id: true, companyId: true, optOut: true } } },
      orderBy: { expiresAt: 'asc' },
    });

    if (due.length === 0) {
      logger.info('[Assinaturas] Nenhum vencimento em 3 dias para avisar.');
      return result;
    }

    for (const sub of due) {
      try {
        // Aviso já enviado dentro da janela deste vencimento? Não repete.
        const windowStart = new Date(sub.expiresAt.getTime() - 3 * 24 * 60 * 60 * 1000);
        if (sub.warnedAt && sub.warnedAt.getTime() >= windowStart.getTime()) {
          result.skipped++;
          continue;
        }

        if (sub.contact?.optOut) {
          logger.info('[Assinaturas] Contato em opt-out — aviso pulado', { subscriptionId: sub.id });
          result.skipped++;
          continue;
        }

        // Instância vinculada à empresa do cliente
        const companyId = sub.contact?.companyId;
        if (!companyId) {
          logger.warn('[Assinaturas] Assinatura sem empresa vinculada (contato sem companyId) — aviso pulado', {
            subscriptionId: sub.id,
            phone: sub.phone,
          });
          result.skipped++;
          continue;
        }

        const instance = await prisma.whatsAppInstance.findFirst({
          where: { companyId, status: 'CONNECTED' },
          orderBy: { healthScore: 'desc' },
        });
        if (!instance) {
          logger.warn('[Assinaturas] Sem instância WhatsApp conectada para a empresa — aviso pulado', {
            subscriptionId: sub.id,
            companyId,
          });
          result.skipped++;
          continue;
        }

        const daysLeft = Math.max(
          1,
          Math.ceil((sub.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        );
        const daysText = daysLeft === 1 ? 'em 1 dia' : `em ${daysLeft} dias`;
        const expiryBR = formatExpiryBR(sub.expiresAt);
        const message = sub.payUrl
          ? `Olá! Seu plano da CineON vence ${daysText} (${expiryBR}). Para continuar assistindo sem interrupção, renove aqui: ${sub.payUrl}`
          : `Olá! Seu plano da CineON vence ${daysText} (${expiryBR}). Para continuar assistindo sem interrupção, fale com a gente aqui no WhatsApp para renovar.`;

        await evolutionApi.sendTextMessage(instance.name, sub.phone, message);
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { warnedAt: new Date() },
        });

        logger.info('[Assinaturas] Aviso de vencimento enviado', {
          subscriptionId: sub.id,
          phone: sub.phone,
          instance: instance.name,
          expiresAt: sub.expiresAt,
        });
        result.sent++;
      } catch (error: any) {
        // Falha no envio: NÃO grava warnedAt — tenta de novo na próxima rodada
        logger.error('[Assinaturas] Falha ao enviar aviso de vencimento', {
          subscriptionId: sub.id,
          error: error?.message,
        });
        result.failed++;
      }
    }
  } catch (error: any) {
    logger.error('[Assinaturas] Erro na rotina de avisos de vencimento', error);
  }

  logger.info('[Assinaturas] Rotina de avisos concluída', result);
  return result;
}
