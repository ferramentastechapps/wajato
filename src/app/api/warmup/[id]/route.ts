import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelCampaignWarmupJobs, queueWarmupMessage } from '@/lib/warmup-queue';

type Params = { params: Promise<{ id: string }> };

// GET /api/warmup/[id] — Detalhes de uma campanha específica
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const campaign = await prisma.warmupCampaign.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: 'asc' },
          take: 100, // Últimas 100 mensagens
        },
        _count: { select: { logs: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    return NextResponse.json(campaign);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/warmup/[id] — Pausar, retomar, ou encerrar campanha
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { action } = await req.json(); // 'pause' | 'resume' | 'stop'

    const campaign = await prisma.warmupCampaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    if (action === 'pause') {
      if (campaign.status !== 'RUNNING') {
        return NextResponse.json({ error: 'Campanha não está em execução' }, { status: 400 });
      }
      // Cancela jobs pendentes e pausa
      await cancelCampaignWarmupJobs(id);
      await prisma.warmupCampaign.update({
        where: { id },
        data: { status: 'PAUSED', restPeriodUntil: null },
      });
      return NextResponse.json({ success: true, message: 'Campanha pausada. Jobs removidos da fila.' });
    }

    if (action === 'resume') {
      if (campaign.status !== 'PAUSED') {
        return NextResponse.json({ error: 'Campanha não está pausada' }, { status: 400 });
      }
      // Retoma e agenda o próximo job
      await prisma.warmupCampaign.update({
        where: { id },
        data: { status: 'RUNNING', restPeriodUntil: null },
      });
      await queueWarmupMessage(
        {
          campaignId: id,
          sourceInstance: campaign.sourceInstance,
          targetPhone: campaign.targetPhone,
          isFirstMessageOfDay: false,
        },
        30000,
        15000
      );
      return NextResponse.json({ success: true, message: 'Campanha retomada.' });
    }

    if (action === 'stop') {
      // Cancela todos os jobs e encerra definitivamente
      await cancelCampaignWarmupJobs(id);
      await prisma.warmupCampaign.update({
        where: { id },
        data: { status: 'STOPPED' },
      });
      return NextResponse.json({ success: true, message: 'Campanha encerrada.' });
    }

    return NextResponse.json({ error: 'Ação inválida. Use: pause, resume, stop' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/warmup/[id] — Remover campanha permanentemente
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const campaign = await prisma.warmupCampaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    // Cancela jobs antes de deletar
    await cancelCampaignWarmupJobs(id);

    // Prisma deleta os logs em cascade
    await prisma.warmupCampaign.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Campanha removida com sucesso.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
