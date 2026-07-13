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

// PUT /api/warmup/[id] — Editar parâmetros de uma campanha existente
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const campaign = await prisma.warmupCampaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    const {
      name,
      targetPhone,
      currentDay,
      msgsSentToday,
      targetMsgsToday,
      totalDays,
      startHour,
      endHour,
      customContext,
      initialMsgsPerDay,
      maxMsgsPerDay,
      enableStatus,
      statusFrequency,
      statusType,
    } = body;

    if (startHour !== undefined && endHour !== undefined) {
      if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 23 || startHour >= endHour) {
        return NextResponse.json({ error: 'Horários inválidos' }, { status: 400 });
      }
    }

    // Atualiza campanha no banco
    const updated = await prisma.warmupCampaign.update({
      where: { id },
      data: {
        name: name !== undefined ? name : campaign.name,
        targetPhone: targetPhone !== undefined ? targetPhone : campaign.targetPhone,
        targetPhones: targetPhone !== undefined ? targetPhone : campaign.targetPhones,
        currentDay: currentDay !== undefined ? Number(currentDay) : campaign.currentDay,
        msgsSentToday: msgsSentToday !== undefined ? Number(msgsSentToday) : campaign.msgsSentToday,
        targetMsgsToday: targetMsgsToday !== undefined ? Number(targetMsgsToday) : campaign.targetMsgsToday,
        totalDays: totalDays !== undefined ? Number(totalDays) : campaign.totalDays,
        startHour: startHour !== undefined ? Number(startHour) : campaign.startHour,
        endHour: endHour !== undefined ? Number(endHour) : campaign.endHour,
        customContext: customContext !== undefined ? customContext : campaign.customContext,
        initialMsgsPerDay: initialMsgsPerDay !== undefined ? Number(initialMsgsPerDay) : campaign.initialMsgsPerDay,
        maxMsgsPerDay: maxMsgsPerDay !== undefined ? Number(maxMsgsPerDay) : campaign.maxMsgsPerDay,
        enableStatus: enableStatus !== undefined ? Boolean(enableStatus) : campaign.enableStatus,
        statusFrequency: statusFrequency !== undefined ? Number(statusFrequency) : campaign.statusFrequency,
        statusType: statusType !== undefined ? statusType : campaign.statusType,
      },
    });

    // Se a campanha estiver ativa (RUNNING), cancela jobs anteriores e reagenda com novas configs
    if (updated.status === 'RUNNING') {
      await cancelCampaignWarmupJobs(id);
      await queueWarmupMessage(
        {
          campaignId: id,
          sourceInstance: updated.sourceInstance,
          targetPhone: updated.targetPhone,
          isFirstMessageOfDay: false,
        },
        30000,
        15000
      );
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
