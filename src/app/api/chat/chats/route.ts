import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instanceName');

    if (!instanceName) {
      return NextResponse.json({ error: 'Parâmetro instanceName é obrigatório' }, { status: 400 });
    }

    const chats = await evolutionApi.findChats(instanceName);
    
    const mappedChats = chats.map((chat: any) => {
      let lastMessageText = '';
      if (chat.lastMessage) {
        lastMessageText = 
          chat.lastMessage.message?.conversation ||
          chat.lastMessage.message?.extendedTextMessage?.text ||
          chat.lastMessage.message?.imageMessage?.caption ||
          chat.lastMessage.text || '';
      }

      let timestamp = undefined;
      if (chat.lastMessage?.messageTimestamp) {
        timestamp = Number(chat.lastMessage.messageTimestamp);
      } else if (chat.updatedAt) {
        timestamp = Math.floor(new Date(chat.updatedAt).getTime() / 1000);
      }

      let phoneNumber = '';
      if (chat.remoteJid?.endsWith('@s.whatsapp.net')) {
        phoneNumber = chat.remoteJid.split('@')[0];
      } else {
        const altJid = chat.lastMessage?.key?.remoteJidAlt || chat.lastMessage?.key?.participantAlt;
        if (altJid?.endsWith('@s.whatsapp.net')) {
          phoneNumber = altJid.split('@')[0];
        } else {
          phoneNumber = chat.remoteJid?.split('@')[0] || '';
        }
      }

      const displayName = chat.pushName && !chat.pushName.includes('@')
        ? chat.pushName
        : phoneNumber
          ? `+${phoneNumber}`
          : chat.remoteJid?.split('@')[0] || 'Desconhecido';

      return {
        id: chat.remoteJid || chat.id,
        name: displayName,
        unreadCount: chat.unreadCount || 0,
        conversationTimestamp: timestamp,
        lastMessage: lastMessageText,
        phoneNumber: phoneNumber || undefined,
      };
    });

    return NextResponse.json(mappedChats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
