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

    return NextResponse.json({
      success: true,
      metrics: {
        statusCounts,
        campaignsCount,
        contactsCount,
        failedLogs,
        exportLogs,
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
