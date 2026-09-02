import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * PATCH /api/contacts/move-group
 * Body: { ids: string[], groupId: string | null }
 * Move uma lista de contatos para um grupo (ou remove do grupo se groupId for null)
 */
export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, groupId } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ message: 'Lista de IDs é obrigatória' }, { status: 400 });
    }

    // Valida que o grupo existe (se fornecido)
    if (groupId) {
      const group = await prisma.contactGroup.findUnique({ where: { id: groupId } });
      if (!group) {
        return NextResponse.json({ message: 'Grupo não encontrado' }, { status: 404 });
      }
    }

    const result = await prisma.contact.updateMany({
      where: { id: { in: ids } },
      data: { groupId: groupId || null },
    });

    return NextResponse.json({
      success: true,
      updated: result.count,
      message: `${result.count} contato(s) movido(s) com sucesso.`,
    });
  } catch (error: any) {
    console.error('Erro ao mover contatos:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
