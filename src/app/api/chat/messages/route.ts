import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';
import { lidResolver } from '@/lib/lid-resolver';

async function fetchUnifiedMessages(instanceName: string, remoteJid: string, limit = 100) {
  const messages = await evolutionApi.findMessages(instanceName, remoteJid, limit);
  
  let otherJid = null;
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    const phone = remoteJid.split('@')[0];
    const lid = lidResolver.getLid(phone);
    if (lid) otherJid = lid;
  } else if (remoteJid.endsWith('@lid')) {
    const phone = lidResolver.getPhone(remoteJid);
    if (phone) otherJid = `${phone}@s.whatsapp.net`;
  }
  
  if (otherJid) {
    try {
      const otherMessages = await evolutionApi.findMessages(instanceName, otherJid, limit);
      if (Array.isArray(otherMessages) && otherMessages.length > 0) {
        // Mescla e remove duplicados usando a chave da mensagem
        const merged = [...messages, ...otherMessages];
        const unique = new Map<string, any>();
        for (const msg of merged) {
          const id = msg.key?.id;
          if (id) {
            if (!unique.has(id) || (msg.messageTimestamp && !unique.get(id).messageTimestamp)) {
              unique.set(id, msg);
            }
          }
        }
        
        // Ordena por timestamp decrescente (mais recente primeiro)
        const sorted = Array.from(unique.values()).sort((a, b) => {
          const tsA = Number(a.messageTimestamp || 0);
          const tsB = Number(b.messageTimestamp || 0);
          return tsB - tsA;
        });
        
        return sorted.slice(0, limit);
      }
    } catch (err) {
      console.error(`[Fetch Unified Messages] Erro ao buscar JID secundário ${otherJid}:`, err);
    }
  }
  
  return messages;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instanceName');
    const remoteJid = searchParams.get('remoteJid');

    if (!instanceName || !remoteJid) {
      return NextResponse.json({ error: 'Parâmetros instanceName e remoteJid são obrigatórios' }, { status: 400 });
    }

    const messages = await fetchUnifiedMessages(instanceName, remoteJid, 100);
    return NextResponse.json(messages);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
