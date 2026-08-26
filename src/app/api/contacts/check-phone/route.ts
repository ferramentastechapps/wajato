import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';

// GET /api/contacts/check-phone?phone=5511999999999
// Retorna se o número já existe no banco, para feedback em tempo real no formulário
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawPhone = searchParams.get('phone') || '';

    if (!rawPhone || rawPhone.replace(/\D/g, '').length < 8) {
      return NextResponse.json({ exists: false });
    }

    const cleanPhone = evolutionApi.formatPhone(rawPhone);
    if (!cleanPhone) {
      return NextResponse.json({ exists: false });
    }

    const contact = await (prisma.contact as any).findUnique({
      where: { phone: cleanPhone },
      select: {
        id: true,
        name: true,
        optOut: true,
        optOutAt: true,
        group: { select: { id: true, name: true } },
        tags: true,
        createdAt: true,
      },
    });

    if (!contact) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      contact: {
        id: contact.id,
        name: contact.name,
        optOut: contact.optOut,
        optOutAt: contact.optOutAt,
        group: contact.group,
        tags: contact.tags,
        createdAt: contact.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Erro ao verificar telefone:', error);
    return NextResponse.json({ exists: false });
  }
}
