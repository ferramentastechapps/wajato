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
    return NextResponse.json(chats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
