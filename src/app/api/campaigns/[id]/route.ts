import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cancelCampaignJobs } from '@/lib/queue';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        group: { select: { name: true } },
        template: { select: { name: true, imageUrl: true, body: true } },
        logs: {
          orderBy: { updatedAt: 'desc' },
          include: {
            contact: {
              select: { name: true, phone: true },
            },
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ message: 'Campanha não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    console.error('Erro ao buscar detalhes da campanha:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    // 1. Limpa da fila de disparos se estiver ativa
    await cancelCampaignJobs(id);

    // 2. Exclui a campanha do banco (os logs serão excluídos por cascade onDelete)
    await prisma.campaign.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Campanha excluída com sucesso' });
  } catch (error: any) {
    console.error('Erro ao excluir campanha:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
