import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/contacts/[id]/optout
// Alterna o status de opt-out de um contato específico
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    const contact = await prisma.contact.findUnique({
      where: { id },
      select: { id: true, optOut: true },
    });

    if (!contact) {
      return NextResponse.json({ message: 'Contato não encontrado' }, { status: 404 });
    }

    const newOptOut = !contact.optOut;

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        optOut: newOptOut,
        optOutAt: newOptOut ? new Date() : null,
      },
      select: { id: true, optOut: true, optOutAt: true },
    });

    return NextResponse.json({
      success: true,
      optOut: updated.optOut,
      optOutAt: updated.optOutAt,
      message: newOptOut
        ? 'Contato marcado como opt-out (não receberá mais mensagens).'
        : 'Opt-out removido. Contato voltará a receber mensagens.',
    });
  } catch (error: any) {
    console.error('Erro ao alterar opt-out:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
