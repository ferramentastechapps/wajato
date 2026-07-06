import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

// GET /api/warmup/[id]/stats — Métricas diárias detalhadas
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const campaign = await prisma.warmupCampaign.findUnique({
      where: { id },
      select: {
        id: true,
        currentDay: true,
        totalDays: true,
        heatScore: true,
        msgsSentToday: true,
        targetMsgsToday: true,
        createdAt: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    // Agrupar mensagens por dia (usando a data de criação)
    const logs = await prisma.warmupLog.findMany({
      where: { campaignId: id },
      select: {
        createdAt: true,
        status: true,
        messageType: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por dia
    const dayMap = new Map<string, { sent: number; failed: number; types: Record<string, number> }>();

    for (const log of logs) {
      const dayKey = log.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { sent: 0, failed: 0, types: {} });
      }
      const entry = dayMap.get(dayKey)!;
      if (log.status === 'SENT') entry.sent++;
      else entry.failed++;

      const type = log.messageType || 'TEXT';
      entry.types[type] = (entry.types[type] || 0) + 1;
    }

    const dailyStats = Array.from(dayMap.entries()).map(([date, data]) => ({
      date,
      sent: data.sent,
      failed: data.failed,
      total: data.sent + data.failed,
      successRate: data.sent + data.failed > 0
        ? Math.round((data.sent / (data.sent + data.failed)) * 100)
        : 0,
      types: data.types,
    }));

    // Totais gerais
    const totalSent = logs.filter(l => l.status === 'SENT').length;
    const totalFailed = logs.filter(l => l.status !== 'SENT').length;

    // Breakdown de tipos total
    const typeBreakdown: Record<string, number> = {};
    for (const log of logs) {
      const t = log.messageType || 'TEXT';
      typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    }

    return NextResponse.json({
      campaign,
      totals: {
        sent: totalSent,
        failed: totalFailed,
        total: logs.length,
        successRate: logs.length > 0 ? Math.round((totalSent / logs.length) * 100) : 0,
      },
      typeBreakdown,
      dailyStats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
