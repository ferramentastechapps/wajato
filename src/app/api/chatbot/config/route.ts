import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chatbotConfigSchema } from '@/lib/validation';

// Config GLOBAL (fallback): linha histórica id 'global', com companyId nulo.
async function getOrCreateGlobalConfig() {
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

  return config;
}

// Resolve a chave de IA a ser salva, respeitando a máscara retornada ao frontend:
// '********' = não alterou | ''/null = limpou o campo | outro valor = nova chave.
function resolveApiKeyToSave(incomingKey: string | null | undefined, existingKey: string | null | undefined) {
  let finalApiKey = existingKey || null;

  if (incomingKey !== undefined) {
    if (incomingKey === '********') {
      finalApiKey = existingKey || null;
    } else if (incomingKey === '' || incomingKey === null) {
      finalApiKey = null;
    } else {
      finalApiKey = incomingKey;
    }
  }

  return finalApiKey;
}

function maskConfig(config: any) {
  return {
    ...config,
    geminiApiKey: config.geminiApiKey ? '********' : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const companyId = request.nextUrl.searchParams.get('companyId');

    // Config de uma empresa específica: cria sob demanda a partir da global
    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        return NextResponse.json({ message: 'Empresa não encontrada' }, { status: 404 });
      }

      let config = await prisma.chatbotConfig.findUnique({
        where: { companyId },
      });

      if (!config) {
        const globalConfig = await getOrCreateGlobalConfig();
        config = await prisma.chatbotConfig.create({
          data: {
            id: `company-${companyId}`,
            companyId,
            aiEnabled: globalConfig.aiEnabled,
            aiContext: globalConfig.aiContext,
            geminiApiKey: globalConfig.geminiApiKey,
            businessHoursOnly: globalConfig.businessHoursOnly,
            startHour: globalConfig.startHour,
            endHour: globalConfig.endHour,
          },
        });
      }

      return NextResponse.json({ success: true, config: maskConfig(config) });
    }

    const config = await getOrCreateGlobalConfig();

    return NextResponse.json({ success: true, config: maskConfig(config) });
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

    const { companyId, aiEnabled, aiContext, geminiApiKey, businessHoursOnly, startHour, endHour } = result.data;

    // Salva a config própria da empresa (cria sob demanda via upsert)
    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        return NextResponse.json({ message: 'Empresa não encontrada' }, { status: 404 });
      }

      const existingConfig = await prisma.chatbotConfig.findUnique({
        where: { companyId },
      });

      const finalApiKey = resolveApiKeyToSave(geminiApiKey, existingConfig?.geminiApiKey);

      const config = await prisma.chatbotConfig.upsert({
        where: { companyId },
        update: {
          aiEnabled,
          aiContext,
          geminiApiKey: finalApiKey,
          businessHoursOnly,
          startHour,
          endHour,
        },
        create: {
          id: `company-${companyId}`,
          companyId,
          aiEnabled,
          aiContext,
          geminiApiKey: finalApiKey,
          businessHoursOnly,
          startHour,
          endHour,
        },
      });

      return NextResponse.json({ success: true, config: maskConfig(config) });
    }

    // Busca a config existente para saber a chave anterior
    const existingConfig = await prisma.chatbotConfig.findUnique({
      where: { id: 'global' },
    });

    const finalApiKey = resolveApiKeyToSave(geminiApiKey, existingConfig?.geminiApiKey);

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

    return NextResponse.json({ success: true, config: maskConfig(config) });
  } catch (error: any) {
    console.error('Erro ao salvar configuração do chatbot:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
