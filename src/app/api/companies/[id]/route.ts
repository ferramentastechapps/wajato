import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { companySchema } from '@/lib/validation';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            campaigns: true,
            contacts: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ message: 'Empresa não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, company });
  } catch (error: any) {
    console.error('Erro ao buscar empresa:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
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
    const body = await request.json();
    const result = companySchema.safeParse({ ...body, id });

    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = result.data;

    // Se marcar como default, desmarca as outras
    if (data.isDefault) {
      await prisma.company.updateMany({
        where: { id: { not: id }, isDefault: true },
        data: { isDefault: false },
      });
    }

    const company = await prisma.company.update({
      where: { id },
      data: {
        name: data.name,
        segment: data.segment || null,
        description: data.description,
        productsServices: data.productsServices,
        faq: data.faq || null,
        policies: data.policies || null,
        contactInfo: data.contactInfo || null,
        toneOfVoice: data.toneOfVoice || null,
        aiInstructions: data.aiInstructions || null,
        isDefault: data.isDefault,
      },
    });

    return NextResponse.json({ success: true, company });
  } catch (error: any) {
    console.error('Erro ao atualizar empresa:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
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
    const totalCompanies = await prisma.company.count();
    if (totalCompanies <= 1) {
      return NextResponse.json(
        { message: 'Você deve manter pelo menos uma empresa cadastrada no sistema.' },
        { status: 400 }
      );
    }

    const companyToDelete = await prisma.company.findUnique({
      where: { id },
    });

    if (!companyToDelete) {
      return NextResponse.json({ message: 'Empresa não encontrada' }, { status: 404 });
    }

    await prisma.company.delete({
      where: { id },
    });

    // Se a excluída era a default, elege outra empresa como default
    if (companyToDelete.isDefault) {
      const remaining = await prisma.company.findFirst();
      if (remaining) {
        await prisma.company.update({
          where: { id: remaining.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao excluir empresa:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
