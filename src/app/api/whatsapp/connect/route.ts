import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';

const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';

// GET — Lista todas as instâncias cadastradas (para o dropdown no CreateWarmupModal)
export async function GET() {
  try {
    const instances = await prisma.whatsAppInstance.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { name: true, status: true, phone: true },
    });
    return NextResponse.json(instances);
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

    // 1. Verifica estado na Evolution API
    let connectionState = await evolutionApi.getConnectionState(INSTANCE_NAME);
    let qrCodeBase64 = null;

    if (connectionState === 'DISCONNECTED' || connectionState === 'INITIALIZING') {
      try {
        // Tenta obter QR Code. Se a instância não existir, dará erro e nós a criamos.
        const connectData = await evolutionApi.getQRCode(INSTANCE_NAME);
        qrCodeBase64 = connectData?.base64 || null;
      } catch (error) {
        console.log('Instância não encontrada ou offline. Criando nova instância...');
        // Instância não existe ou deu erro. Vamos criar.
        const createData = await evolutionApi.createInstance(INSTANCE_NAME);
        qrCodeBase64 = createData?.qrcode?.base64 || null;
        connectionState = 'INITIALIZING';
      }
    }

    // 2. Atualiza ou cria o registro no nosso banco de dados local
    const dbStatus = connectionState === 'CONNECTED' ? 'CONNECTED' : (qrCodeBase64 ? 'DISCONNECTED' : 'INITIALIZING');
    
    await prisma.whatsAppInstance.upsert({
      where: { name: INSTANCE_NAME },
      update: {
        status: dbStatus,
        qrCode: qrCodeBase64,
        updatedAt: new Date(),
      },
      create: {
        name: INSTANCE_NAME,
        status: dbStatus,
        qrCode: qrCodeBase64,
        updatedAt: new Date(),
      },
    });

    // 3. Configura o webhook para receber atualizações na API de webhook local
    if (connectionState === 'CONNECTED' || connectionState === 'INITIALIZING') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      try {
        await evolutionApi.setWebhook(INSTANCE_NAME, `${appUrl}/api/webhook`);
      } catch (webhookErr) {
        console.error('Erro ao registrar webhook:', webhookErr);
      }
    }

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
