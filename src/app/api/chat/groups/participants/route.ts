import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instanceName');
    const groupJid = searchParams.get('groupJid');

    if (!instanceName || !groupJid) {
      return NextResponse.json({ error: 'Parâmetros instanceName e groupJid são obrigatórios' }, { status: 400 });
    }

    const participants = await evolutionApi.fetchGroupParticipants(instanceName, groupJid);
    return NextResponse.json({ success: true, participants });
  } catch (error: any) {
    console.error('Erro ao buscar participantes do grupo:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
