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

    if (connectionState === 'DISCONNECTED' || connectionState === 'INITIALIZING') {
      try {
        const connectData = await evolutionApi.getQRCode(name);
        qrCodeBase64 = connectData?.base64 || null;
        if (!qrCodeBase64) {
          throw new Error('QR Code indisponível ou limite de tentativas atingido');
        }
      } catch (error) {
        // Se der erro ou vier sem QR Code (limite atingido), força recriação no gateway
        try {
          console.log(`[GET Instance] Forçando recriação da instância ${name} no gateway para obter novo QR Code...`);
          try {
            await evolutionApi.deleteInstance(name);
          } catch (delErr) {
            // Ignora se não existir ou falhar ao deletar
          }
          const createData = await evolutionApi.createInstance(name);
          qrCodeBase64 = createData?.qrcode?.base64 || null;
          
          const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          await evolutionApi.setWebhook(name, `${appUrl}/api/webhook`);

          if (dbInst.proxy) {
            try {
              await evolutionApi.setInstanceProxy(name, dbInst.proxy);
              console.log(`[GET Instance] Proxy reconfigurado com sucesso para ${name}`);
            } catch (proxyErr) {
              console.error(`Erro ao reconfigurar proxy para ${name}:`, proxyErr);
            }
          }
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

// PATCH — Atualiza configurações da instância (como a proxy)
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { name } = await params;
    const body = await req.json();
    const { proxy } = body;

    const dbInst = await prisma.whatsAppInstance.findUnique({
      where: { name },
    });

    if (!dbInst) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    // 1. Atualiza no banco local
    const updatedInst = await prisma.whatsAppInstance.update({
      where: { name },
      data: { proxy: proxy || null },
    });

    // 2. Envia o proxy para o Evolution API
    if (proxy) {
      try {
        await evolutionApi.setInstanceProxy(name, proxy);
        console.log(`[PATCH Instance] Proxy atualizado com sucesso no gateway para ${name}`);
      } catch (proxyErr: any) {
        console.error(`Erro ao atualizar proxy no gateway para ${name}:`, proxyErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      instance: updatedInst,
    });
  } catch (error: any) {
    console.error(`Erro ao atualizar instância:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}

