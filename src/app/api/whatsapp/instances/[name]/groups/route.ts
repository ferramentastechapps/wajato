import { NextResponse } from 'next/server';
import { evolutionApi } from '@/lib/evolution';
import { getSessionUser } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
  }

  const { name } = await params;

  try {
    const rawGroups = await evolutionApi.fetchGroups(name);
    
    // Mapeia e limpa os dados retornados pela Evolution API
    // Cada item de fetchAll geralmente é um objeto contendo id (JID) e subject (Nome do grupo)
    const groups = rawGroups.map((g: any) => ({
      id: g.id || g.jid || '',
      subject: g.subject || g.name || 'Sem nome',
    })).filter(g => g.id.endsWith('@g.us'));

    return NextResponse.json({ success: true, groups });
  } catch (error: any) {
    console.error(`[groups-fetch] Erro ao buscar grupos para ${name}:`, error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar grupos da instância no Evolution API' },
      { status: 500 }
    );
  }
}
