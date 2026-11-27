import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';
import { recordChatMessage } from '@/lib/chat-store';

export async function POST(req: Request) {
  try {
    const { instanceName, remoteJid, message, mediaUrl, mediaType, quotedMessageId, quotedMessage } = await req.json();

    if (!remoteJid || (!message && !mediaUrl)) {
      return NextResponse.json(
        { error: 'Parâmetros remoteJid e (message ou mediaUrl) são obrigatórios' },
        { status: 400 }
      );
    }

    let activeInstance = instanceName;
    if (!activeInstance || activeInstance === 'all') {
      const dbInst = await prisma.whatsAppInstance.findFirst({
        where: { status: 'CONNECTED' },
        orderBy: { healthScore: 'desc' },
      });
      activeInstance = dbInst?.name || process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';
    }

    if (mediaUrl) {
      const sentMedia = await evolutionApi.sendMediaMessage(
        activeInstance,
        remoteJid,
        mediaUrl,
        mediaType || 'image',
        message || ''
      );
      const mediaLabels: Record<string, string> = { image: '[Imagem]', video: '[Vídeo]', audio: '[Áudio]', document: '[Documento]' };
      await recordChatMessage({
        instanceName: activeInstance,
        remoteJid,
        phone: remoteJid.endsWith('@s.whatsapp.net') ? remoteJid.split('@')[0] : null,
        fromMe: true,
        body: message || mediaLabels[mediaType || 'image'] || '[Mídia]',
        messageId: sentMedia?.key?.id || sentMedia?.id || null,
      });
      return NextResponse.json(sentMedia);
    }

    const formattedPhone = evolutionApi.formatPhone(remoteJid);

    // Resposta citada (reply), quando a tela de Conversas manda uma
    const quoted = quotedMessageId
      ? {
          key: {
            id: quotedMessageId,
            remoteJid: formattedPhone,
            fromMe: false,
          },
          message: quotedMessage || {},
        }
      : undefined;

    // Envia pelo evolutionApi (Evolution Go primeiro, Node como fallback).
    // A chamada direta ao endpoint antigo /message/sendText não funciona na Go.
    const data = await evolutionApi.sendTextMessage(activeInstance, formattedPhone, message, 1000, quoted);
    if (message) {
      await recordChatMessage({
        instanceName: activeInstance,
        remoteJid: remoteJid.endsWith('@g.us') ? remoteJid : `${formattedPhone}@s.whatsapp.net`,
        phone: formattedPhone,
        fromMe: true,
        body: message,
        messageId: data?.key?.id || data?.id || null,
      });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Chat Send] Erro ao enviar mensagem:', error?.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
