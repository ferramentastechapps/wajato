import { prisma } from './prisma';
import { logger } from './logger';

export interface ChatMessageInput {
  instanceName: string;
  remoteJid: string;
  phone?: string | null;
  pushName?: string | null;
  fromMe: boolean;
  body: string;
  messageId?: string | null;
  timestamp?: number; // epoch em segundos
}

/**
 * Registra uma mensagem de conversa no histórico local (tabela ChatMessage).
 * A tela de Conversas usa este histórico quando a Evolution não devolve os
 * chats/mensagens da instância. Nunca lança erro: falhar aqui não pode
 * derrubar o webhook nem o envio da mensagem.
 */
export async function recordChatMessage(input: ChatMessageInput): Promise<void> {
  try {
    if (!input.instanceName || !input.remoteJid) return;

    // Dedupe pelo id da mensagem (webhook pode entregar 2x; o eco do envio
    // via API chegaria com o mesmo id do registro feito no envio)
    if (input.messageId) {
      const existing = await prisma.chatMessage.findFirst({
        where: { instanceName: input.instanceName, messageId: input.messageId },
        select: { id: true },
      });
      if (existing) return;
    }

    await prisma.chatMessage.create({
      data: {
        instanceName: input.instanceName,
        remoteJid: input.remoteJid,
        phone: input.phone || null,
        pushName: input.pushName || null,
        fromMe: input.fromMe,
        body: input.body || '',
        messageId: input.messageId || null,
        timestamp: input.timestamp || Math.floor(Date.now() / 1000),
      },
    });
  } catch (err: any) {
    logger.error('[ChatStore] Erro ao registrar mensagem do chat', { error: err?.message });
  }
}

export interface LocalChatSummary {
  instanceName: string;
  remoteJid: string;
  phone: string | null;
  pushName: string | null;
  lastBody: string;
  lastTimestamp: number;
  lastFromMe: boolean;
}

/**
 * Resumo das conversas do histórico local (última mensagem de cada chat),
 * para mesclar com a lista de chats vinda da Evolution.
 */
export async function getLocalChatSummaries(instanceNames: string[]): Promise<LocalChatSummary[]> {
  if (instanceNames.length === 0) return [];

  const rows = await prisma.chatMessage.findMany({
    where: { instanceName: { in: instanceNames } },
    orderBy: { timestamp: 'desc' },
    take: 2000,
  });

  const byChat = new Map<string, LocalChatSummary>();
  for (const r of rows) {
    const key = `${r.instanceName}|${r.remoteJid}`;
    const existing = byChat.get(key);
    if (!existing) {
      byChat.set(key, {
        instanceName: r.instanceName,
        remoteJid: r.remoteJid,
        phone: r.phone,
        pushName: r.pushName,
        lastBody: r.body,
        lastTimestamp: r.timestamp,
        lastFromMe: r.fromMe,
      });
    } else if (!existing.pushName && r.pushName) {
      existing.pushName = r.pushName;
    }
  }
  return Array.from(byChat.values());
}

/** Converte uma ChatMessage local para o formato de mensagem da Evolution. */
export function localMessageToEvolutionShape(r: {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  body: string;
  messageId: string | null;
  timestamp: number;
  pushName: string | null;
}) {
  return {
    key: { id: r.messageId || r.id, fromMe: r.fromMe, remoteJid: r.remoteJid },
    message: { conversation: r.body },
    messageTimestamp: r.timestamp,
    pushName: r.pushName || undefined,
  };
}

/**
 * Nome mais recente conhecido de um contato no histórico local (pushName das
 * mensagens recebidas). A Evolution Go não devolve perfil do contato
 * (fetchProfile volta vazio), então o nome exibido vem daqui.
 */
export async function getLocalContactName(instanceName: string, phone: string): Promise<string | null> {
  try {
    const row = await prisma.chatMessage.findFirst({
      where: {
        instanceName,
        pushName: { not: null },
        OR: [{ phone }, { remoteJid: `${phone}@s.whatsapp.net` }],
      },
      orderBy: { timestamp: 'desc' },
      select: { pushName: true },
    });
    return row?.pushName || null;
  } catch {
    return null;
  }
}

/** Mensagens do histórico local de uma conversa, no formato da Evolution. */
export async function getLocalMessages(instanceName: string, remoteJid: string, limit: number = 100) {
  const rows = await prisma.chatMessage.findMany({
    where: { instanceName, remoteJid },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  return rows.map(localMessageToEvolutionShape);
}
