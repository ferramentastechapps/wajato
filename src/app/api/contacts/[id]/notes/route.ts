import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/contacts/[id]/notes
 * Body: { notes: string }
 * Atualiza as notas/anotações de um contato específico
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { notes } = body;

    const contact = await prisma.contact.update({
      where: { id },
      data: { notes: notes ?? null },
      select: { id: true, notes: true },
    });

    return NextResponse.json({ success: true, contact });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ message: 'Contato não encontrado' }, { status: 404 });
    }
    console.error('Erro ao salvar notas do contato:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}

/**
 * GET /api/contacts/[id]/notes
 * Retorna as notas e o histórico de mensagens enviadas ao contato
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    const contact = await prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        notes: true,
        logs: {
          select: {
            id: true,
            status: true,
            sentAt: true,
            deliveredAt: true,
            readAt: true,
            campaign: {
              select: { id: true, name: true },
            },
          },
          orderBy: { sentAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ message: 'Contato não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, contact });
  } catch (error: any) {
    console.error('Erro ao buscar notas do contato:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
