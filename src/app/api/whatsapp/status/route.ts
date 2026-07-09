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

    // 1. Consulta o estado atual na Evolution API
    const connectionState = await evolutionApi.getConnectionState(INSTANCE_NAME);
    let qrCodeBase64 = null;

    if (connectionState === 'DISCONNECTED') {
      try {
        const connectData = await evolutionApi.getQRCode(INSTANCE_NAME);
        qrCodeBase64 = connectData?.base64 || null;
      } catch (error) {
        // Se a instância não existe, retorna desconectado sem QR Code.
        // O frontend chamará /connect para recriá-la
      }
    }

    const status = connectionState === 'CONNECTED' ? 'CONNECTED' : (qrCodeBase64 ? 'DISCONNECTED' : 'INITIALIZING');

    // 2. Atualiza no banco local apenas se a instância principal existir
    const existingInstance = await prisma.whatsAppInstance.findUnique({
      where: { name: INSTANCE_NAME },
    });

    let status = connectionState === 'CONNECTED' ? 'CONNECTED' : (qrCodeBase64 ? 'DISCONNECTED' : 'INITIALIZING');
    let updatedAt = new Date();

    if (existingInstance) {
      await prisma.whatsAppInstance.update({
        where: { name: INSTANCE_NAME },
        data: {
          status,
          qrCode: qrCodeBase64,
          updatedAt,
        },
      });
    } else {
      // Se a instância principal foi excluída pelo usuário, não recriamos ela
      status = 'DISCONNECTED';
    }

    return NextResponse.json({
      success: true,
      status,
      qrCode: qrCodeBase64,
      updatedAt,
    });
  } catch (error: any) {
    console.error('Erro ao verificar status do WhatsApp:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
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
