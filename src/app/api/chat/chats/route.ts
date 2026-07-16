import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';
import { lidResolver } from '@/lib/lid-resolver';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instanceName');

    if (!instanceName) {
      return NextResponse.json({ error: 'Parâmetro instanceName é obrigatório' }, { status: 400 });
    }

    let chats: any[] = [];
    if (instanceName === 'all') {
      const dbInsts = await prisma.whatsAppInstance.findMany({
        where: { status: 'CONNECTED' },
        select: { name: true }
      });
      const names = dbInsts.map(i => i.name);
      if (names.length === 0) {
        return NextResponse.json([]);
      }
      
      const chatsPromises = names.map(async (name) => {
        try {
          const list = await evolutionApi.findChats(name);
          return list.map((c: any) => ({ ...c, instanceName: name }));
        } catch (err) {
          console.error(`[Chats Route] Erro ao buscar chats para ${name}:`, err);
          return [];
        }
      });
      
      const results = await Promise.all(chatsPromises);
      chats = results.flat();
    } else {
      const list = await evolutionApi.findChats(instanceName);
      chats = list.map((c: any) => ({ ...c, instanceName }));
    }
    
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
          if (chat.remoteJid?.includes('@lid')) {
            lidResolver.addMapping(chat.remoteJid, altJid);
          }
        } else {
          const savedPhone = chat.remoteJid?.includes('@lid') ? lidResolver.getPhone(chat.remoteJid) : null;
          phoneNumber = savedPhone || chat.remoteJid?.split('@')[0] || '';
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

    // Buscar nomes dos contatos salvos no banco local (CRM) para substituir na exibição
    const phoneNumbers = mappedChats
      .map((c: any) => c.phoneNumber)
      .filter(Boolean) as string[];

    const normalizedPhones = [
      ...phoneNumbers,
      ...phoneNumbers.map(p => p.startsWith('55') ? p.slice(2) : `55${p}`)
    ];

    const dbContacts = await prisma.contact.findMany({
      where: {
        phone: { in: normalizedPhones },
      },
      select: {
        phone: true,
        name: true,
      },
    });

    const contactMap = new Map<string, string>();
    for (const c of dbContacts) {
      if (c.name) {
        contactMap.set(c.phone, c.name);
      }
    }

    // Salvar contatos não cadastrados ou sem nome usando o pushName do WhatsApp
    const contactsToUpsert = [];
    for (let i = 0; i < mappedChats.length; i++) {
      const c = mappedChats[i];
      const chat = chats[i];
      if (c.phoneNumber && chat.pushName && !chat.pushName.includes('@') && !chat.remoteJid?.endsWith('@g.us')) {
        const dbName = contactMap.get(c.phoneNumber) || 
                       contactMap.get(c.phoneNumber.startsWith('55') ? c.phoneNumber.slice(2) : `55${c.phoneNumber}`);
        if (!dbName) {
          contactsToUpsert.push({
            phone: c.phoneNumber,
            name: chat.pushName,
          });
        }
      }
    }

    if (contactsToUpsert.length > 0) {
      await Promise.all(
        contactsToUpsert.map(item => 
          prisma.contact.upsert({
            where: { phone: item.phone },
            update: { name: item.name },
            create: { phone: item.phone, name: item.name },
          }).catch(err => console.error(`[Chats Route] Erro ao cadastrar/atualizar contato ${item.phone}:`, err.message))
        )
      );

      for (const item of contactsToUpsert) {
        contactMap.set(item.phone, item.name);
      }
    }

    const finalChats = mappedChats.map((c: any, index: number) => {
      const chat = chats[index];
      let finalName = c.name;
      if (c.phoneNumber) {
        const dbName = contactMap.get(c.phoneNumber) || 
                       contactMap.get(c.phoneNumber.startsWith('55') ? c.phoneNumber.slice(2) : `55${c.phoneNumber}`);
        if (dbName) {
          finalName = dbName;
        }
      }
      return {
        ...c,
        name: finalName,
        profilePicUrl: chat.profilePicUrl || null,
      };
    });

    // Ordenar por data da última conversa decrescente
    finalChats.sort((a: any, b: any) => {
      const tsA = a.conversationTimestamp || 0;
      const tsB = b.conversationTimestamp || 0;
      return tsB - tsA;
    });

    return NextResponse.json(finalChats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
