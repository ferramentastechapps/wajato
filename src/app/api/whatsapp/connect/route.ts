import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';

const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';

// GET — Lista e sincroniza todas as instâncias cadastradas (para o dropdown no CreateWarmupModal)
export async function GET() {
  try {
    const instances = await prisma.whatsAppInstance.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true,
        status: true,
        phone: true,
        dailyMsgCount: true,
        maxDailyLimit: true,
        dailyLimitToday: true,
        warmupStage: true,
      },
    });

    // Sincroniza em paralelo com a Evolution API para refletir o status real do socket
    const synced = await Promise.all(
      instances.map(async (inst) => {
        try {
          const liveState = await evolutionApi.getConnectionState(inst.name);
          if (liveState !== inst.status) {
            await prisma.whatsAppInstance.updateMany({
              where: { name: inst.name },
              data: { status: liveState },
            });
            return { ...inst, status: liveState };
          }
        } catch {}
        return inst;
      })
    );

    return NextResponse.json(synced);
  } catch (error: any) {
    return NextResponse.json({ instances: [] }, { status: 200 });
  }
}

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // Busca se já existe uma instância cadastrada para conectar
    const existingInstance = await prisma.whatsAppInstance.findFirst({
      orderBy: { updatedAt: 'asc' },
    });

    if (!existingInstance) {
      return NextResponse.json(
        { message: 'Nenhuma instância cadastrada. Crie uma conexão na tela de Conexões primeiro.' },
        { status: 400 }
      );
    }

    const targetName = existingInstance.name;
    const connectionState = await evolutionApi.getConnectionState(targetName);
    let qrCodeBase64 = null;

    if (connectionState === 'DISCONNECTED' || connectionState === 'INITIALIZING') {
      try {
        const connectData = await evolutionApi.getQRCode(targetName);
        qrCodeBase64 = connectData?.base64 || (connectData as any)?.qrcode?.base64 || null;
      } catch (error) {
        // Ignora
      }
    }

    if (qrCodeBase64 && !qrCodeBase64.startsWith('data:')) {
      qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
    }

    const dbStatus = connectionState === 'CONNECTED' ? 'CONNECTED' : (connectionState === 'INITIALIZING' ? 'INITIALIZING' : 'DISCONNECTED');

    await prisma.whatsAppInstance.update({
      where: { id: existingInstance.id },
      data: {
        status: dbStatus,
        qrCode: qrCodeBase64,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      status: dbStatus,
      qrCode: qrCodeBase64,
    });
  } catch (error: any) {
    console.error('Erro ao conectar WhatsApp:', error);
    return NextResponse.json(
      { message: error.message || 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
