import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        group: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, imageUrl: true } },
        _count: {
          select: { logs: true },
        },
      },
    });

    // Formata retorno com contagem de status de logs para cada campanha
    const formattedCampaigns = await Promise.all(
      campaigns.map(async (camp) => {
        const stats = await prisma.messageLog.groupBy({
          by: ['status'],
          where: { campaignId: camp.id },
          _count: { id: true },
        });

        const statusCounts = {
          PENDING: 0,
          SENT: 0,
          DELIVERED: 0,
          READ: 0,
          FAILED: 0,
        };

        stats.forEach((s) => {
          statusCounts[s.status as keyof typeof statusCounts] = s._count.id;
        });

        const totalSent = statusCounts.SENT + statusCounts.DELIVERED + statusCounts.READ;

        return {
          ...camp,
          stats: {
            total: camp._count.logs,
            sent: totalSent,
            delivered: statusCounts.DELIVERED,
            read: statusCounts.READ,
            failed: statusCounts.FAILED,
            pending: statusCounts.PENDING,
          },
        };
      })
    );

    return NextResponse.json({ success: true, campaigns: formattedCampaigns });
  } catch (error: any) {
    console.error('Erro ao listar campanhas:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { name, templateId, groupId, delayMin, delayMax } = await request.json();

    if (!name || !templateId || !groupId) {
      return NextResponse.json(
        { message: 'Nome, template e grupo de contatos são obrigatórios' },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        templateId,
        groupId,
        delayMin: parseInt(delayMin || '5', 10),
        delayMax: parseInt(delayMax || '15', 10),
        status: 'DRAFT',
      },
      include: {
        group: { select: { name: true } },
        template: { select: { name: true } },
      },
    });

    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    console.error('Erro ao criar campanha:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
