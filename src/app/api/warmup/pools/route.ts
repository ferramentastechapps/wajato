import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queuePoolMessage } from '@/lib/warmup-pool-queue';
import { getRampUpTarget } from '@/lib/warmup-schedule';

export async function GET() {
  try {
    const pools = await prisma.warmupPool.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { logs: true } },
      },
    });

    const enriched = await Promise.all(
      pools.map(async (pool) => {
        // Última mensagem
        const lastLog = await prisma.warmupPoolLog.findFirst({
          where: { poolId: pool.id },
          orderBy: { createdAt: 'desc' },
        });

        // Taxa de sucesso
        const totalLogs = pool._count.logs;
        const successLogs = await prisma.warmupPoolLog.count({
          where: { poolId: pool.id, status: 'SENT' },
        });
        const successRate = totalLogs > 0 ? successLogs / totalLogs : 1;

        // Trocadas hoje
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const msgsToday = await prisma.warmupPoolLog.count({
          where: {
            poolId: pool.id,
            createdAt: { gte: todayStart },
          },
        });

        // Breakdown de tipos
        const typeStats = await prisma.warmupPoolLog.groupBy({
          by: ['messageType'],
          where: { poolId: pool.id },
          _count: { id: true },
        });

        const messageTypeBreakdown = Object.fromEntries(
          typeStats.map(t => [t.messageType, t._count.id])
        );

        return {
          ...pool,
          stats: {
            total: totalLogs,
            successful: successLogs,
            successRate: Math.round(successRate * 100),
            msgsToday,
            lastMessage: lastLog
              ? {
                  text: lastLog.message,
                  from: lastLog.fromInstance,
                  to: lastLog.toInstance,
                  at: lastLog.createdAt,
                  type: lastLog.messageType,
                }
              : null,
            messageTypeBreakdown,
          },
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      instanceNames, // Array de strings
      totalDays = 30,
      startHour = 8,
      endHour = 22,
      initialMsgsPerDay = 5,
      maxMsgsPerDay = 150,
    } = body;

    if (!name || !instanceNames || !Array.isArray(instanceNames) || instanceNames.length < 2) {
      return NextResponse.json(
        { error: 'Nome e no mínimo 2 instâncias participantes são obrigatórios.' },
        { status: 400 }
      );
    }

    // Valida se as instâncias existem
    const instancesInDb = await prisma.whatsAppInstance.findMany({
      where: { name: { in: instanceNames } },
    });

    if (instancesInDb.length !== instanceNames.length) {
      return NextResponse.json(
        { error: 'Uma ou mais instâncias fornecidas não existem no banco de dados.' },
        { status: 400 }
      );
    }

    const targetMsgs = getRampUpTarget(1, initialMsgsPerDay, maxMsgsPerDay);

    const pool = await prisma.warmupPool.create({
      data: {
        name,
        instanceNames,
        totalDays,
        targetMsgsToday: targetMsgs,
        initialMsgsPerDay,
        maxMsgsPerDay,
        startHour,
        endHour,
      },
    });

    // Agenda o primeiro job na fila de pools com jitter de 15s-60s
    await queuePoolMessage(
      {
        poolId: pool.id,
        isFirstMessageOfDay: true,
      },
      30000,
      15000
    );

    return NextResponse.json(pool, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
