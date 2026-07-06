import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const pool = await prisma.warmupPool.findUnique({
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

    if (!pool) {
      return NextResponse.json({ error: 'Pool não encontrado' }, { status: 404 });
    }

    const logs = await prisma.warmupPoolLog.findMany({
      where: { poolId: id },
      select: {
        createdAt: true,
        status: true,
        messageType: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dayMap = new Map<string, { sent: number; failed: number; types: Record<string, number> }>();

    for (const log of logs) {
      const dayKey = log.createdAt.toISOString().split('T')[0];
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

    const totalSent = logs.filter(l => l.status === 'SENT').length;
    const totalFailed = logs.filter(l => l.status !== 'SENT').length;

    const typeBreakdown: Record<string, number> = {};
    for (const log of logs) {
      const t = log.messageType || 'TEXT';
      typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    }

    return NextResponse.json({
      pool,
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
