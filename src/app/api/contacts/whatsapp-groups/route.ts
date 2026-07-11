import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';

/**
 * GET /api/contacts/whatsapp-groups?instanceName=xxx
 *
 * Retorna a lista de grupos do WhatsApp em que a instância está participando.
 * Não inclui participantes para manter a resposta rápida (listagem inicial).
 */
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const instanceName = searchParams.get('instanceName');

    if (!instanceName) {
      return NextResponse.json(
        { message: 'O parâmetro instanceName é obrigatório' },
        { status: 400 }
      );
    }

    // Verifica se a instância está conectada antes de tentar buscar grupos
    const state = await evolutionApi.getConnectionState(instanceName);
    if (state !== 'CONNECTED') {
      return NextResponse.json(
        { message: `A instância "${instanceName}" não está conectada (estado atual: ${state})` },
        { status: 422 }
      );
    }

    const groups = await evolutionApi.fetchGroups(instanceName);

    // Normaliza e ordena por nome
    const normalized = groups
      .map((g: any) => ({
        id: g.id,
        subject: g.subject || g.id,
        desc: g.desc || null,
        size: g.size ?? g.participants?.length ?? null,
      }))
      .sort((a: any, b: any) => a.subject.localeCompare(b.subject, 'pt'));

    return NextResponse.json({ success: true, groups: normalized });
  } catch (error: any) {
    console.error('Erro ao listar grupos WhatsApp:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
