import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';

export async function POST(req: Request) {
  try {
    const { instanceName, remoteJid, message, quotedMessageId, quotedMessage } = await req.json();

    if (!instanceName || !remoteJid || !message) {
      return NextResponse.json(
        { error: 'Parâmetros instanceName, remoteJid e message são obrigatórios' },
        { status: 400 }
      );
    }

    const formattedPhone = evolutionApi.formatPhone(remoteJid);

    // Build request body — with optional quoted message (reply)
    const body: any = {
      number: formattedPhone,
      text: message,
      options: {
        delay: 1000,
        presence: 'composing',
      },
    };

    if (quotedMessageId) {
      body.quoted = {
        key: {
          id: quotedMessageId,
          remoteJid: formattedPhone,
          fromMe: false,
        },
        message: quotedMessage || {},
      };
    }

    // Use direct HTTP call to support the quoted field properly
    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('[Chat Send] Erro ao enviar mensagem:', error?.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
