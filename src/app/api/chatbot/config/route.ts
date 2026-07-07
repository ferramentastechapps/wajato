import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chatbotConfigSchema } from '@/lib/validation';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    let config = await prisma.chatbotConfig.findUnique({
      where: { id: 'global' },
    });

    if (!config) {
      config = await prisma.chatbotConfig.create({
        data: {
          id: 'global',
          aiEnabled: false,
          aiContext: 'Você é um assistente de atendimento virtual prestativo e educado.',
          businessHoursOnly: false,
          startHour: 8,
          endHour: 18,
        },
      });
    }

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error('Erro ao buscar configuração do chatbot:', error);
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
    const result = chatbotConfigSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { aiEnabled, aiContext, businessHoursOnly, startHour, endHour } = result.data;

    const config = await prisma.chatbotConfig.upsert({
      where: { id: 'global' },
      update: {
        aiEnabled,
        aiContext,
        businessHoursOnly,
        startHour,
        endHour,
      },
      create: {
        id: 'global',
        aiEnabled,
        aiContext,
        businessHoursOnly,
        startHour,
        endHour,
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error('Erro ao salvar configuração do chatbot:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
