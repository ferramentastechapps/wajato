import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VALID_PANELS = ['painel_plus', 'smartplay'];
const VALID_STATUSES = ['trial', 'active', 'expired'];

function normalizePhone(phone: unknown): string {
  return typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: 'Assinatura não encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      if (!phone) {
        return NextResponse.json({ message: 'Telefone inválido' }, { status: 400 });
      }
      data.phone = phone;
    }
    if (body.panel !== undefined) {
      if (!VALID_PANELS.includes(body.panel)) {
        return NextResponse.json({ message: 'Painel inválido (painel_plus ou smartplay)' }, { status: 400 });
      }
      data.panel = body.panel;
    }
    if (body.username !== undefined) {
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      if (!username) {
        return NextResponse.json({ message: 'Usuário é obrigatório' }, { status: 400 });
      }
      data.username = username;
    }
    if (body.planName !== undefined) {
      data.planName = typeof body.planName === 'string' && body.planName.trim() ? body.planName.trim() : null;
    }
    if (body.connections !== undefined) {
      data.connections = typeof body.connections === 'number' ? body.connections : null;
    }
    if (body.expiresAt !== undefined) {
      const expiresAt = new Date(body.expiresAt);
      if (isNaN(expiresAt.getTime())) {
        return NextResponse.json({ message: 'Vencimento inválido' }, { status: 400 });
      }
      data.expiresAt = expiresAt;
      // Vencimento mudou: novo ciclo de aviso
      if (expiresAt.getTime() !== existing.expiresAt.getTime()) {
        data.warnedAt = null;
      }
    }
    if (body.payUrl !== undefined) {
      data.payUrl = typeof body.payUrl === 'string' && body.payUrl.trim() ? body.payUrl.trim() : null;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ message: 'Status inválido (trial, active ou expired)' }, { status: 400 });
      }
      data.status = body.status;
    }

    // Telefone mudou: tenta religar ao contato certo
    if (data.phone && data.phone !== existing.phone) {
      const contact = await prisma.contact.findUnique({
        where: { phone: data.phone as string },
        select: { id: true },
      });
      data.contactId = contact?.id ?? null;
    }

    const subscription = await prisma.subscription.update({
      where: { id },
      data,
      include: {
        contact: { select: { id: true, name: true, phone: true, companyId: true } },
      },
    });

    return NextResponse.json({ success: true, subscription });
  } catch (error: any) {
    console.error('Erro ao atualizar assinatura:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: 'Assinatura não encontrada' }, { status: 404 });
    }

    await prisma.subscription.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao excluir assinatura:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
