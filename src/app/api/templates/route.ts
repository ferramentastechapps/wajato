import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const templates = await prisma.template.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, templates });
  } catch (error: any) {
    console.error('Erro ao listar templates:', error);
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

    const { id, name, body, imageUrl } = await request.json();

    if (!name || !body) {
      return NextResponse.json(
        { message: 'Nome e texto da mensagem são obrigatórios' },
        { status: 400 }
      );
    }

    const template = await prisma.template.upsert({
      where: { id: id || 'new-uuid' },
      update: {
        name,
        body,
        imageUrl: imageUrl || null,
      },
      create: {
        name,
        body,
        imageUrl: imageUrl || null,
      },
    });

    return NextResponse.json({ success: true, template });
  } catch (error: any) {
    console.error('Erro ao salvar template:', error);
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
        { message: 'ID do template não informado' },
        { status: 400 }
      );
    }

    await prisma.template.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Template excluído' });
  } catch (error: any) {
    console.error('Erro ao excluir template:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
