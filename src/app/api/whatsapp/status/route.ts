import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';

const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // 1. Verifica o estado global de todas as instâncias cadastradas:
    // Se houver qualquer instância conectada, o cabeçalho mostra CONECTADO.
    const activeConnected = await prisma.whatsAppInstance.findFirst({
      where: { status: 'CONNECTED' },
    });

    let status: 'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED' = 'DISCONNECTED';

    if (activeConnected) {
      status = 'CONNECTED';
    } else {
      const activeInitializing = await prisma.whatsAppInstance.findFirst({
        where: { status: 'INITIALIZING' },
      });
      status = activeInitializing ? 'INITIALIZING' : 'DISCONNECTED';
    }

    return NextResponse.json({
      success: true,
      status,
      updatedAt: new Date(),
    });
  } catch (error: any) {
    console.error('Erro ao buscar status global do WhatsApp:', error);
    return NextResponse.json({ status: 'DISCONNECTED' }, { status: 500 });
  }
}

/**
 * Desconecta a instância do WhatsApp (Logout)
 */
export async function DELETE() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // 1. Faz logout na Evolution API
    try {
      await evolutionApi.logoutInstance(INSTANCE_NAME);
    } catch (err) {
      console.log('Erro ao tentar deslogar instância, removendo do banco local...');
    }

    // 2. Remove a instância localmente também
    await prisma.whatsAppInstance.update({
      where: { name: INSTANCE_NAME },
      data: {
        status: 'DISCONNECTED',
        qrCode: null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Desconectado com sucesso',
    });
  } catch (error: any) {
    console.error('Erro ao desconectar WhatsApp:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
