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

import { templateSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const result = templateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { id, name, body: messageBody, imageUrl } = result.data;

    let template;
    if (id) {
      template = await prisma.template.update({
        where: { id },
        data: {
          name,
          body: messageBody,
          imageUrl: imageUrl || null,
        },
      });
    } else {
      template = await prisma.template.create({
        data: {
          name,
          body: messageBody,
          imageUrl: imageUrl || null,
        },
      });
    }

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
