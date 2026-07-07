import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // 1. Agrupamento de contatos por status
    const logsGroupByStatus = await prisma.messageLog.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const statusCounts = {
      PENDING: 0,
      SENT: 0,
      DELIVERED: 0,
      READ: 0,
      FAILED: 0,
    };

    logsGroupByStatus.forEach((item) => {
      statusCounts[item.status as keyof typeof statusCounts] = item._count.id;
    });

    // 2. Busca logs detalhados de falhas para exibição de relatório de erros
    const failedLogs = await prisma.messageLog.findMany({
      where: { status: 'FAILED' },
      take: 50,
      orderBy: { updatedAt: 'desc' },
      include: {
        contact: { select: { name: true, phone: true } },
        campaign: { select: { name: true } },
      },
    });

    // 3. Campanhas ativas/concluídas totais
    const campaignsCount = await prisma.campaign.count();
    const contactsCount = await prisma.contact.count();

    // 4. Todos os logs (para exportação em CSV no cliente)
    const exportLogs = await prisma.messageLog.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        contact: { select: { name: true, phone: true } },
        campaign: { select: { name: true } },
      },
      take: 1000, // Limita a 1000 logs para evitar sobrecarregar
    });

    // 5. Histórico dos últimos 7 dias para gráficos
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentLogs = await prisma.messageLog.findMany({
      where: {
        updatedAt: { gte: sevenDaysAgo },
        status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] }
      },
      select: {
        status: true,
        updatedAt: true
      }
    });

    const dailyHistory: Record<string, { sent: number; delivered: number; read: number; failed: number }> = {};
    
    // Inicializa o mapa com os últimos 7 dias (fuso BRT)
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyHistory[dateStr] = { sent: 0, delivered: 0, read: 0, failed: 0 };
    }

    recentLogs.forEach(log => {
      if (log.updatedAt) {
        const dateStr = log.updatedAt.toISOString().split('T')[0];
        if (dailyHistory[dateStr]) {
          if (log.status === 'SENT') dailyHistory[dateStr].sent++;
          else if (log.status === 'DELIVERED') dailyHistory[dateStr].delivered++;
          else if (log.status === 'READ') dailyHistory[dateStr].read++;
          else if (log.status === 'FAILED') dailyHistory[dateStr].failed++;
        }
      }
    });

    const dailyHistoryArray = Object.entries(dailyHistory).map(([date, counts]) => ({
      date,
      ...counts
    })).sort((a, b) => a.date.localeCompare(b.date));

    // 6. Desempenho e saúde dos chips ativos
    const chipPerformance = await prisma.whatsAppInstance.findMany({
      orderBy: { dailyMsgCount: 'desc' },
      select: {
        name: true,
        phone: true,
        status: true,
        dailyMsgCount: true,
        healthScore: true,
        profileName: true
      }
    });

    return NextResponse.json({
      success: true,
      metrics: {
        statusCounts,
        campaignsCount,
        contactsCount,
        failedLogs,
        exportLogs,
        dailyHistory: dailyHistoryArray,
        chipPerformance,
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar métricas:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
