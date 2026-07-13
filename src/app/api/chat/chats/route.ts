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

      return {
        id: chat.remoteJid || chat.id,
        name: chat.pushName || chat.remoteJid?.split('@')[0] || 'Desconhecido',
        unreadCount: chat.unreadCount || 0,
        conversationTimestamp: timestamp,
        lastMessage: lastMessageText,
      };
    });

    return NextResponse.json(mappedChats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
