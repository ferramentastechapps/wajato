import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueWarmupMessage } from '@/lib/warmup-queue';
import { getRampUpTarget, calculateHeatScore } from '@/lib/warmup-schedule';

export async function GET() {
  try {
    const campaigns = await prisma.warmupCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { logs: true } },
      },
    });

    // Enriquecer cada campanha com métricas
    const enriched = await Promise.all(
      campaigns.map(async (camp) => {
        // Última mensagem
        const lastLog = await prisma.warmupLog.findFirst({
          where: { campaignId: camp.id },
          orderBy: { createdAt: 'desc' },
        });

        // Buscar últimas mensagens para calcular falhas consecutivas
        const lastLogs = await prisma.warmupLog.findMany({
          where: { campaignId: camp.id },
          orderBy: { createdAt: 'desc' },
          take: 3,
        });

        let consecutiveFailures = 0;
        for (const log of lastLogs) {
          if (log.status === 'FAILED') {
            consecutiveFailures++;
          } else {
            break;
          }
        }

        // Taxa de sucesso
        const totalLogs = camp._count.logs;
        const successLogs = await prisma.warmupLog.count({
          where: { campaignId: camp.id, status: 'SENT' },
        });
        const successRate = totalLogs > 0 ? successLogs / totalLogs : 1;

        // Mensagens de hoje (hoje = últimas 24h como proxy)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const msgsToday = await prisma.warmupLog.count({
          where: {
            campaignId: camp.id,
            createdAt: { gte: todayStart },
          },
        });

        // Distribuição por tipo de mensagem
        const typeStats = await prisma.warmupLog.groupBy({
          by: ['messageType'],
          where: { campaignId: camp.id },
          _count: { id: true },
        });

        const messageTypeBreakdown = Object.fromEntries(
          typeStats.map(t => [t.messageType, t._count.id])
        );

        return {
          ...camp,
          stats: {
            total: totalLogs,
            successful: successLogs,
            successRate: Math.round(successRate * 100),
            msgsToday,
            heatScore: camp.heatScore,
            consecutiveFailures,
            lastMessage: lastLog
              ? {
                  text: lastLog.message,
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
      sourceInstance,
      targetInstance,
      targetPhone,
      targetPhones,
      customContext,
      isGroup = false,
      totalDays = 30,
      startHour = 8,
      endHour = 22,
      initialMsgsPerDay = 5,
      maxMsgsPerDay = 150,
      enableStatus = false,
      statusFrequency = 2,
      statusType = 'text',
    } = body;

    const resolvedTargetPhones = targetPhones || targetPhone;

    if (!sourceInstance || !resolvedTargetPhones) {
      return NextResponse.json({ error: 'Instância de origem e telefones de destino são obrigatórios' }, { status: 400 });
    }

    const phonesList = resolvedTargetPhones.split(',').map((p: string) => p.trim()).filter(Boolean);
    if (phonesList.length === 0) {
      return NextResponse.json({ error: 'Nenhum telefone de destino válido fornecido' }, { status: 400 });
    }

    // Validações
    if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 23 || startHour >= endHour) {
      return NextResponse.json({ error: 'Horários inválidos' }, { status: 400 });
    }

    if (initialMsgsPerDay < 1 || initialMsgsPerDay > 50) {
      return NextResponse.json({ error: 'initialMsgsPerDay deve ser entre 1 e 50' }, { status: 400 });
    }

    const firstDayTarget = getRampUpTarget(1, initialMsgsPerDay, maxMsgsPerDay);
    const campaignsCreated = [];

    // ── Distribuição aleatória do total de mensagens entre contatos ──────────
    // Se houver múltiplos contatos, o total de mensagens por dia é dividido
    // de forma aleatória/desproporcional entre as campanhas (soma = firstDayTarget).
    // Se houver apenas 1 contato, ele recebe o total inteiro.
    function randomDistribute(total: number, count: number): number[] {
      if (count === 1) return [total];
      // Gera pesos aleatórios
      const weights = Array.from({ length: count }, () => Math.random() + 0.1);
      const sumWeights = weights.reduce((a, b) => a + b, 0);
      const shares = weights.map(w => Math.max(1, Math.round((w / sumWeights) * total)));
      // Ajusta para garantir que a soma bate exatamente com total
      let diff = total - shares.reduce((a, b) => a + b, 0);
      let i = 0;
      while (diff !== 0) {
        const delta = diff > 0 ? 1 : -1;
        if (shares[i % count] + delta >= 1) {
          shares[i % count] += delta;
          diff -= delta;
        }
        i++;
      }
      return shares;
    }

    const perContactTargets = randomDistribute(firstDayTarget, phonesList.length);
    const perContactInitial = randomDistribute(initialMsgsPerDay, phonesList.length);
    const perContactMax = randomDistribute(maxMsgsPerDay, phonesList.length);

    // Cria uma campanha independente para cada número para paralelizar e isolar o histórico.
    for (let idx = 0; idx < phonesList.length; idx++) {
      const phone = phonesList[idx];
      const campaignIsGroup = phone.endsWith('@g.us');
      const cleanPhoneLabel = phone.endsWith('@g.us') ? phone.split('@')[0] : phone;
      const campaignName = phonesList.length > 1
        ? `${name || `Aquecimento ${sourceInstance}`} (${cleanPhoneLabel})`
        : (name || `Aquecimento ${sourceInstance}`);

      const campaign = await prisma.warmupCampaign.create({
        data: {
          name: campaignName,
          sourceInstance,
          targetInstance: targetInstance || null,
          targetPhone: phone,
          targetPhones: phone, // Apenas este telefone para esta campanha
          customContext: customContext || null,
          isGroup: campaignIsGroup,
          totalDays,
          targetMsgsToday: perContactTargets[idx],
          initialMsgsPerDay: perContactInitial[idx],
          maxMsgsPerDay: perContactMax[idx],
          startHour,
          endHour,
          enableStatus,
          statusFrequency,
          statusType,
        },
      });

      // Agenda a primeira mensagem com jitter curto de 10s-60s
      await queueWarmupMessage(
        {
          campaignId: campaign.id,
          sourceInstance,
          targetPhone: phone,
          isFirstMessageOfDay: true,
        },
        30000,
        20000
      );

      campaignsCreated.push(campaign);
    }

    return NextResponse.json(campaignsCreated[0], { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
