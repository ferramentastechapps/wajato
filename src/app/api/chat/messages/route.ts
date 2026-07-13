import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instanceName');
    const remoteJid = searchParams.get('remoteJid');

    if (!instanceName || !remoteJid) {
      return NextResponse.json({ error: 'Parâmetros instanceName e remoteJid são obrigatórios' }, { status: 400 });
    }

    const messages = await evolutionApi.findMessages(instanceName, remoteJid, 100);
    return NextResponse.json(messages);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
