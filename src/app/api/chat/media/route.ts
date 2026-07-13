import { NextRequest, NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instanceName');
    const messageId = searchParams.get('messageId');
    const fromMe = searchParams.get('fromMe') === 'true';
    const remoteJid = searchParams.get('remoteJid');

    if (!instanceName || !messageId || !remoteJid) {
      return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 });
    }

    const data = await evolutionApi.getBase64Media(instanceName, {
      id: messageId,
      fromMe,
      remoteJid
    });

    if (!data || !data.base64 || !data.mimetype) {
      return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 });
    }

    const buffer = Buffer.from(data.base64, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': data.mimetype,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
