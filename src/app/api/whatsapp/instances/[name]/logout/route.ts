import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ name: string }> };

export async function POST(_req: Request, { params }: Params) {
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

    // 1. Faz logout no Evolution API
    try {
      await evolutionApi.logoutInstance(name);
    } catch (err) {
      console.warn(`Erro ao tentar fazer logout da instância ${name} na Evolution API:`, err);
    }

    // 2. Atualiza no banco local
    const updated = await prisma.whatsAppInstance.update({
      where: { name },
      data: {
        status: 'DISCONNECTED',
        qrCode: null,
        profilePicUrl: null,
        profileName: null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Instância desconectada com sucesso.',
      instance: updated,
    });
  } catch (error: any) {
    console.error(`Erro ao efetuar logout da instância:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
