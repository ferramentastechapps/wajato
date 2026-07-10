import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ name: string }> };

// PATCH — Atualiza as configurações de proteção anti-ban por falta de resposta de um chip específico
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { name } = await params;
    const body = await req.json();
    const { unrepliedBlockEnabled, maxUnrepliedLimit } = body;

    const dbInst = await prisma.whatsAppInstance.findUnique({
      where: { name },
    });

    if (!dbInst) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    const updateData: any = {};
    if (typeof unrepliedBlockEnabled === 'boolean') {
      updateData.unrepliedBlockEnabled = unrepliedBlockEnabled;
    }
    if (typeof maxUnrepliedLimit === 'number') {
      if (maxUnrepliedLimit < 1 || maxUnrepliedLimit > 1000) {
        return NextResponse.json({ error: 'O limite de mensagens sem resposta deve ser entre 1 e 1000' }, { status: 400 });
      }
      updateData.maxUnrepliedLimit = maxUnrepliedLimit;
    }

    // Se desativou o bloqueio, também reseta o contador atual para liberar o chip imediatamente
    if (unrepliedBlockEnabled === false) {
      updateData.unrepliedMsgCount = 0;
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { name },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      unrepliedBlockEnabled: updated.unrepliedBlockEnabled,
      maxUnrepliedLimit: updated.maxUnrepliedLimit,
      unrepliedMsgCount: updated.unrepliedMsgCount,
    });
  } catch (error: any) {
    console.error(`Erro ao atualizar configurações de proteção da instância:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
