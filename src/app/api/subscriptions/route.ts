import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VALID_PANELS = ['painel_plus', 'smartplay'];
const VALID_STATUSES = ['trial', 'active', 'expired'];

function normalizePhone(phone: unknown): string {
  return typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const subscriptions = await prisma.subscription.findMany({
      orderBy: { expiresAt: 'asc' },
      include: {
        contact: { select: { id: true, name: true, phone: true, companyId: true } },
      },
    });

    return NextResponse.json({ success: true, subscriptions });
  } catch (error: any) {
    console.error('Erro ao listar assinaturas:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const phone = normalizePhone(body.phone);
    const panel = typeof body.panel === 'string' ? body.panel : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const status = typeof body.status === 'string' ? body.status : 'trial';
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    if (!phone) {
      return NextResponse.json({ message: 'Telefone é obrigatório' }, { status: 400 });
    }
    if (!VALID_PANELS.includes(panel)) {
      return NextResponse.json({ message: 'Painel inválido (painel_plus ou smartplay)' }, { status: 400 });
    }
    if (!username) {
      return NextResponse.json({ message: 'Usuário é obrigatório' }, { status: 400 });
    }
    if (!expiresAt || isNaN(expiresAt.getTime())) {
      return NextResponse.json({ message: 'Vencimento inválido' }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ message: 'Status inválido (trial, active ou expired)' }, { status: 400 });
    }

    const contact = await prisma.contact.findUnique({ where: { phone }, select: { id: true } });

    const subscription = await prisma.subscription.create({
      data: {
        contactId: contact?.id ?? null,
        phone,
        panel,
        username,
        planName: typeof body.planName === 'string' && body.planName.trim() ? body.planName.trim() : null,
        connections: typeof body.connections === 'number' ? body.connections : null,
        expiresAt,
        payUrl: typeof body.payUrl === 'string' && body.payUrl.trim() ? body.payUrl.trim() : null,
        status,
      },
      include: {
        contact: { select: { id: true, name: true, phone: true, companyId: true } },
      },
    });

    return NextResponse.json({ success: true, subscription }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar assinatura:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
