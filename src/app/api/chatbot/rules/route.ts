import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chatbotRuleSchema } from '@/lib/validation';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const rules = await prisma.chatbotRule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const logs = await prisma.chatbotLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, rules, logs });
  } catch (error: any) {
    console.error('Erro ao listar regras do chatbot:', error);
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

    const body = await request.json();
    const result = chatbotRuleSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { id, trigger, matchType, response, imageUrl, isActive } = result.data;

    let rule;
    if (id) {
      rule = await prisma.chatbotRule.update({
        where: { id },
        data: {
          trigger,
          matchType,
          response,
          imageUrl: imageUrl || null,
          isActive,
        },
      });
    } else {
      // Evita triggers duplicados
      const existing = await prisma.chatbotRule.findUnique({
        where: { trigger },
      });
      if (existing) {
        return NextResponse.json(
          { message: 'Já existe uma regra cadastrada com essa palavra-chave' },
          { status: 400 }
        );
      }

      rule = await prisma.chatbotRule.create({
        data: {
          trigger,
          matchType,
          response,
          imageUrl: imageUrl || null,
          isActive,
        },
      });
    }

    return NextResponse.json({ success: true, rule });
  } catch (error: any) {
    console.error('Erro ao salvar regra do chatbot:', error);
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
        { message: 'ID da regra não informado' },
        { status: 400 }
      );
    }

    await prisma.chatbotRule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Regra excluída com sucesso' });
  } catch (error: any) {
    console.error('Erro ao excluir regra do chatbot:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
