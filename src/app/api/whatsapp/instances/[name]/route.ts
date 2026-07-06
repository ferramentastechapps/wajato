import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ name: string }> };

// GET — Obtém ou atualiza o status de conexão de uma instância específica (gera QR se precisar)
export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { name } = await params;

    const dbInst = await prisma.whatsAppInstance.findUnique({
      where: { name },
    });

    if (!dbInst) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    // 1. Consulta o estado atual na Evolution API
    const connectionState = await evolutionApi.getConnectionState(name);
    let qrCodeBase64 = null;

    if (connectionState === 'DISCONNECTED') {
      try {
        const connectData = await evolutionApi.getQRCode(name);
        qrCodeBase64 = connectData?.base64 || null;
      } catch (error) {
        // Se der erro ao pegar o QR, a instância pode não existir no gateway.
        // Vamos recriar no gateway para obter o QR Code
        try {
          const createData = await evolutionApi.createInstance(name);
          qrCodeBase64 = createData?.qrcode?.base64 || null;
          
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          await evolutionApi.setWebhook(name, `${appUrl}/api/webhook`);
        } catch (err) {
          console.error(`Erro ao recriar instância ${name}:`, err);
        }
      }
    }

    const status = connectionState === 'CONNECTED' ? 'CONNECTED' : (qrCodeBase64 ? 'DISCONNECTED' : 'INITIALIZING');

    // 2. Atualiza no banco local
    const updatedInst = await prisma.whatsAppInstance.update({
      where: { name },
      data: {
        status,
        qrCode: status === 'CONNECTED' ? null : qrCodeBase64,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      status: updatedInst.status,
      qrCode: updatedInst.qrCode,
      phone: updatedInst.phone,
      profileName: updatedInst.profileName,
      profilePicUrl: updatedInst.profilePicUrl,
    });
  } catch (error: any) {
    console.error(`Erro ao consultar status da instância:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}

// DELETE — Remove completamente a instância da API Evolution e do banco local
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { name } = await params;

    const dbInst = await prisma.whatsAppInstance.findUnique({
      where: { name },
    });

    if (!dbInst) {
      return NextResponse.json({ error: 'Instância não encontrada no banco' }, { status: 404 });
    }

    // 1. Exclui no Evolution API
    try {
      await evolutionApi.deleteInstance(name);
    } catch (err) {
      console.warn(`Erro ao excluir instância ${name} do gateway:`, err);
    }

    // 2. Exclui do banco local
    await prisma.whatsAppInstance.delete({
      where: { name },
    });

    return NextResponse.json({
      success: true,
      message: 'Instância excluída com sucesso',
    });
  } catch (error: any) {
    console.error(`Erro ao excluir instância:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
