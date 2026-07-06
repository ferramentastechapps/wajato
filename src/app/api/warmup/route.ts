import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueWarmupMessage } from '@/lib/warmup-queue';

export async function GET() {
  try {
    const campaigns = await prisma.warmupCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { logs: true }
        }
      }
    });
    return NextResponse.json(campaigns);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sourceInstance, targetInstance, targetPhone, totalDays } = body;

    if (!sourceInstance || !targetPhone) {
      return NextResponse.json({ error: 'Faltam campos obrigatórios' }, { status: 400 });
    }

    // Criar a campanha de warmup
    const campaign = await prisma.warmupCampaign.create({
      data: {
        sourceInstance,
        targetInstance: targetInstance || null,
        targetPhone,
        totalDays: totalDays || 7,
        targetMsgsToday: 15, // Começa com poucas mensagens
      }
    });

    // Agenda a primeira mensagem (Jitter curto inicial de 5s a 30s)
    await queueWarmupMessage({
      campaignId: campaign.id,
      sourceInstance,
      targetPhone,
      isFirstMessageOfDay: true
    }, 5000, 30000);

    return NextResponse.json(campaign, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
