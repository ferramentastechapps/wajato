import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';
import { getSessionUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// Helper to save base64 to public directory and return its url
async function saveBase64File(base64Data: string, type: 'image' | 'video'): Promise<string> {
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Formato base64 inválido');
  }

  const fileBuffer = Buffer.from(matches[2], 'base64');
  
  // Detect extension
  const mimeType = matches[1];
  let extension = 'bin';
  if (type === 'image') {
    if (mimeType === 'image/png') extension = 'png';
    else if (mimeType === 'image/gif') extension = 'gif';
    else if (mimeType === 'image/webp') extension = 'webp';
    else extension = 'jpg';
  } else if (type === 'video') {
    if (mimeType === 'video/webm') extension = 'webm';
    else if (mimeType === 'video/ogg') extension = 'ogg';
    else extension = 'mp4';
  }

  const filename = `status_${Date.now()}_${Math.floor(Math.random() * 10000)}.${extension}`;
  
  // Ensure public/uploads directory exists
  const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(publicUploadsDir)) {
    fs.mkdirSync(publicUploadsDir, { recursive: true });
  }

  const filePath = path.join(publicUploadsDir, filename);
  fs.writeFileSync(filePath, fileBuffer);

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return `${appUrl}/api/uploads/${filename}`;
}

// ── GET: Listar Statuses dos contatos das últimas 24h ─────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instanceName');

    if (!instanceName) {
      return NextResponse.json({ error: 'Parâmetro instanceName é obrigatório' }, { status: 400 });
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Busca os statuses do banco nas últimas 24 horas para aquela instância
    const statuses = await prisma.whatsAppStatus.findMany({
      where: {
        instanceName,
        createdAt: { gte: yesterday },
      },
      orderBy: { createdAt: 'asc' }, // ordena do mais antigo para o mais novo
    });

    if (statuses.length === 0) {
      return NextResponse.json([]);
    }

    // Extrai números para buscar fotos e nomes de contatos locais
    const jids = Array.from(new Set(statuses.map(s => s.senderJid)));
    const phones = jids.map(j => j.split('@')[0]);
    const normalizedPhones = [
      ...phones,
      ...phones.map(p => p.startsWith('55') ? p.slice(2) : `55${p}`),
    ];

    const dbContacts = await prisma.contact.findMany({
      where: { phone: { in: normalizedPhones } },
      select: { phone: true, name: true },
    });

    const contactMap = new Map<string, string>();
    for (const c of dbContacts) {
      if (c.name) {
        contactMap.set(c.phone, c.name);
      }
    }

    // Agrupar por JID
    const grouped = new Map<string, any>();
    for (const s of statuses) {
      const jid = s.senderJid;
      const phone = jid.split('@')[0];
      const name = contactMap.get(phone) || 
                   contactMap.get(phone.startsWith('55') ? phone.slice(2) : `55${phone}`) || 
                   s.senderName || 
                   `+${phone}`;

      if (!grouped.has(jid)) {
        grouped.set(jid, {
          senderJid: jid,
          senderName: name,
          profilePicUrl: null, // Pode ser preenchido caso tenhamos futuramente
          statuses: [],
        });
      }

      grouped.get(jid).statuses.push({
        id: s.id,
        mediaType: s.mediaType,
        content: s.content,
        mediaUrl: s.mediaUrl,
        createdAt: s.createdAt,
      });
    }

    // Ordenar a lista final pela data do status mais recente enviado
    const list = Array.from(grouped.values()).sort((a, b) => {
      const latestA = new Date(a.statuses[a.statuses.length - 1].createdAt).getTime();
      const latestB = new Date(b.statuses[b.statuses.length - 1].createdAt).getTime();
      return latestB - latestA; // Mais recente primeiro
    });

    return NextResponse.json(list);
  } catch (error: any) {
    console.error('Erro ao buscar status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST: Postar nova atualização de Status ──────────────────────────────
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { instanceName, type, content, mediaUrl } = body;

    if (!instanceName || !type || !content) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes (instanceName, type, content)' }, { status: 400 });
    }

    if (type !== 'text' && type !== 'image' && type !== 'video') {
      return NextResponse.json({ error: 'Tipo inválido. Deve ser "text", "image" ou "video"' }, { status: 400 });
    }

    let finalMediaUrl = mediaUrl;
    if (mediaUrl && mediaUrl.startsWith('data:')) {
      try {
        finalMediaUrl = await saveBase64File(mediaUrl, type);
      } catch (err: any) {
        console.error('Erro ao salvar arquivo base64:', err);
        return NextResponse.json({ error: 'Erro ao salvar o arquivo enviado.' }, { status: 500 });
      }
    }

    // 1. Envia o status para a Evolution API
    try {
      await evolutionApi.sendStatusUpdate(instanceName, content, type, undefined, finalMediaUrl);
    } catch (err: any) {
      console.error('Erro na rota de status:', err);
      let friendlyError = 'Erro ao postar status no gateway Evolution';
      if (err.message && err.message.includes('Contacts not found')) {
        friendlyError = 'Nenhum contato ou conversa ativa foi encontrado nesta instância do WhatsApp. Para publicar um status, o chip precisa ter pelo menos uma conversa iniciada ou contato sincronizado.';
      } else if (err.message && err.message.includes('Failed to fetch stream')) {
        friendlyError = 'Não foi possível baixar o arquivo de mídia enviado. Tente novamente.';
      } else {
        friendlyError = `Erro da Evolution API: ${err.message}`;
      }
      return NextResponse.json({ error: friendlyError }, { status: 400 });
    }

    // 2. Busca informações do próprio chip para salvar no banco
    const dbInst = await prisma.whatsAppInstance.findUnique({
      where: { name: instanceName },
    });

    const myJid = dbInst?.phone ? `${dbInst.phone}@s.whatsapp.net` : `me@s.whatsapp.net`;
    const myName = dbInst?.profileName || dbInst?.name || 'Eu';

    // 3. Salva no banco de dados local para aparecer no histórico/feed do painel
    await prisma.whatsAppStatus.create({
      data: {
        instanceName,
        senderJid: myJid,
        senderName: `${myName} (Você)`,
        mediaType: type,
        content: content,
        mediaUrl: finalMediaUrl || null,
      },
    });

    return NextResponse.json({ success: true, message: 'Status postado com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao postar status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
