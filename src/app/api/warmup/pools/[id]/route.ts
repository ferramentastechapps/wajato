import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelWarmupPoolJobs, queuePoolMessage } from '@/lib/warmup-pool-queue';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const pool = await prisma.warmupPool.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: 'asc' },
          take: 150, // Últimas 150 mensagens
        },
      },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Pool não encontrado' }, { status: 404 });
    }

    return NextResponse.json(pool);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { action } = await req.json(); // 'pause' | 'resume' | 'stop'

    const pool = await prisma.warmupPool.findUnique({ where: { id } });
    if (!pool) {
      return NextResponse.json({ error: 'Pool não encontrado' }, { status: 404 });
    }

    if (action === 'pause') {
      if (pool.status !== 'RUNNING') {
        return NextResponse.json({ error: 'Pool não está ativo' }, { status: 400 });
      }
      await cancelWarmupPoolJobs(id);
      await prisma.warmupPool.update({
        where: { id },
        data: { status: 'PAUSED', restPeriodUntil: null },
      });
      return NextResponse.json({ success: true, message: 'Pool pausado.' });
    }

    if (action === 'resume') {
      if (pool.status !== 'PAUSED') {
        return NextResponse.json({ error: 'Pool não está pausado' }, { status: 400 });
      }
      await prisma.warmupPool.update({
        where: { id },
        data: { status: 'RUNNING', restPeriodUntil: null },
      });
      await queuePoolMessage(
        {
          poolId: id,
          isFirstMessageOfDay: false,
        },
        30000,
        15000
      );
      return NextResponse.json({ success: true, message: 'Pool retomado.' });
    }

    if (action === 'stop') {
      await cancelWarmupPoolJobs(id);
      await prisma.warmupPool.update({
        where: { id },
        data: { status: 'STOPPED' },
      });
      return NextResponse.json({ success: true, message: 'Pool encerrado.' });
    }

    return NextResponse.json({ error: 'Ação inválida. Use pause, resume ou stop.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const pool = await prisma.warmupPool.findUnique({ where: { id } });
    if (!pool) {
      return NextResponse.json({ error: 'Pool não encontrado' }, { status: 404 });
    }

    await cancelWarmupPoolJobs(id);
    await prisma.warmupPool.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Pool removido com sucesso.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
