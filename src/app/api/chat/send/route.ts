import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';

export async function POST(req: Request) {
  try {
    const { instanceName, remoteJid, message } = await req.json();

    if (!instanceName || !remoteJid || !message) {
      return NextResponse.json({ error: 'Parâmetros instanceName, remoteJid e message são obrigatórios' }, { status: 400 });
    }

    const response = await evolutionApi.sendTextMessage(instanceName, remoteJid, message);
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
