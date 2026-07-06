import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DashboardView from '@/components/dashboard/DashboardView';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getSessionUser();

  // Se não houver usuário na sessão, redireciona para a página de login
  if (!user) {
    redirect('/login');
  }

  // Define o início do dia de hoje para contagem diária
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // 1. Coleta dados agregados do banco de dados utilizando Prisma
  const [
    totalContacts,
    totalCampaigns,
    totalSent,
    totalFailed,
    sentToday,
    pendingMessages,
    rawRecentCampaigns,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.campaign.count(),
    prisma.messageLog.count({
      where: {
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
      },
    }),
    prisma.messageLog.count({
      where: { status: 'FAILED' },
    }),
    prisma.messageLog.count({
      where: {
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
        updatedAt: { gte: startOfToday },
      },
    }),
    prisma.messageLog.count({
      where: { status: 'PENDING' },
    }),
    prisma.campaign.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        group: { select: { name: true } },
        logs: { select: { status: true } },
      },
    }),
  ]);

  // Calcula taxa de sucesso
  const totalAttempts = totalSent + totalFailed;
  const successRate = totalAttempts > 0 ? (totalSent / totalAttempts) * 100 : 100;

  // Formata as campanhas recentes para o frontend
  const recentCampaigns = rawRecentCampaigns.map((camp) => {
    const totalLogs = camp.logs.length;
    const sentLogs = camp.logs.filter((log) => 
      ['SENT', 'DELIVERED', 'READ'].includes(log.status)
    ).length;

    return {
      id: camp.id,
      name: camp.name,
      groupName: camp.group?.name || 'Sem grupo',
      status: camp.status,
      sentCount: sentLogs,
      totalCount: totalLogs,
      createdAt: camp.createdAt.toISOString(),
    };
  });

  const stats = {
    totalContacts,
    totalCampaigns,
    totalSent,
    successRate,
    sentToday,
    pendingMessages,
  };

  return (
    <DashboardView 
      initialStats={stats} 
      initialCampaigns={recentCampaigns}
    />
  );
}
