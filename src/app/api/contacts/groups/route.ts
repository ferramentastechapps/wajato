import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const groups = await prisma.contactGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { contacts: true },
        },
      },
    });

    return NextResponse.json({ success: true, groups });
  } catch (error: any) {
    console.error('Erro ao listar grupos:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json(
        { message: 'O nome do grupo é obrigatório' },
        { status: 400 }
      );
    }

    const group = await prisma.contactGroup.upsert({
      where: { name },
      update: {
        description: description || null,
      },
      create: {
        name,
        description: description || null,
      },
    });

    return NextResponse.json({ success: true, group });
  } catch (error: any) {
    console.error('Erro ao criar grupo:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { message: 'ID do grupo não informado' },
        { status: 400 }
      );
    }

    // Se deletar o grupo, os contatos vinculados a ele terão groupId setado como null (onDelete: SetNull no Prisma)
    await prisma.contactGroup.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Grupo excluído com sucesso' });
  } catch (error: any) {
    console.error('Erro ao excluir grupo:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
