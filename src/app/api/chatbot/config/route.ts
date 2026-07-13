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
          aiContext: 'Você é um atendente humano da nossa equipe de suporte. Seu objetivo é ajudar o cliente de forma prestativa, educada e natural.',
          geminiApiKey: null,
          businessHoursOnly: false,
          startHour: 8,
          endHour: 18,
        },
      });
    }

    // Mascarar a API Key se ela existir para evitar expor no frontend
    const responseConfig = {
      ...config,
      geminiApiKey: config.geminiApiKey ? '********' : null,
    };

    return NextResponse.json({ success: true, config: responseConfig });
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

    const { aiEnabled, aiContext, geminiApiKey, businessHoursOnly, startHour, endHour } = result.data;

    // Busca a config existente para saber a chave anterior
    const existingConfig = await prisma.chatbotConfig.findUnique({
      where: { id: 'global' },
    });

    let finalApiKey = existingConfig?.geminiApiKey || null;

    if (geminiApiKey !== undefined) {
      if (geminiApiKey === '********') {
        // O usuário não alterou a chave mascarada
        finalApiKey = existingConfig?.geminiApiKey || null;
      } else if (geminiApiKey === '' || geminiApiKey === null) {
        // O usuário limpou o campo
        finalApiKey = null;
      } else {
        // O usuário digitou uma nova chave
        finalApiKey = geminiApiKey;
      }
    }

    const config = await prisma.chatbotConfig.upsert({
      where: { id: 'global' },
      update: {
        aiEnabled,
        aiContext,
        geminiApiKey: finalApiKey,
        businessHoursOnly,
        startHour,
        endHour,
      },
      create: {
        id: 'global',
        aiEnabled,
        aiContext,
        geminiApiKey: finalApiKey,
        businessHoursOnly,
        startHour,
        endHour,
      },
    });

    // Retorna a config mascarada
    const responseConfig = {
      ...config,
      geminiApiKey: config.geminiApiKey ? '********' : null,
    };

    return NextResponse.json({ success: true, config: responseConfig });
  } catch (error: any) {
    console.error('Erro ao salvar configuração do chatbot:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
