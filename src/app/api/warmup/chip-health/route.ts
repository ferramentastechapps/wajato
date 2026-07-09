/**
 * GET /api/warmup/chip-health
 * Retorna o status de saúde de todos os chips com dados em tempo real
 * (health score, contadores diários e horários via Redis sliding window).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getInstanceDailyCount, getInstanceHourlyCount } from '@/lib/warmup-rate-limiter';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
  }

  try {
    // Busca todos os chips registrados no banco
    const instances = await prisma.whatsAppInstance.findMany({
      orderBy: [
        { status: 'asc' },      // CONNECTED primeiro
        { healthScore: 'desc' }, // Maior saúde primeiro
      ],
    });

    // Enriquece com dados do Redis (contadores em tempo real)
    const enriched = await Promise.all(
      instances.map(async (inst) => {
        const [dailyCount, hourlyCount] = await Promise.all([
          getInstanceDailyCount(inst.name),
          getInstanceHourlyCount(inst.name),
        ]);

        return {
          id:           inst.id,
          name:         inst.name,
          status:       inst.status,
          phone:        inst.phone,
          profileName:  inst.profileName,
          profilePicUrl: inst.profilePicUrl,
          healthScore:  inst.healthScore,
          dailyMsgCount: dailyCount,   // Valor real do Redis (não do banco)
          hourlyMsgCount: hourlyCount, // Msgs nas últimas 60 min (sliding window)
          proxy:        inst.proxy,
          updatedAt:    inst.updatedAt,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (err: any) {
    console.error('[chip-health] Erro:', err);
    return NextResponse.json({ error: 'Erro ao buscar saúde dos chips.' }, { status: 500 });
  }
}
