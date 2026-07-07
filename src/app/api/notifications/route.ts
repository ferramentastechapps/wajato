import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const lastClearedStr = cookieStore.get('last_cleared_notifications_at')?.value;
    const lastCleared = lastClearedStr ? new Date(lastClearedStr) : new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 horas atrás por padrão se não limpo

    // 1. Busca instâncias de WhatsApp desconectadas
    const disconnectedInstances = await prisma.whatsAppInstance.findMany({
      where: {
        status: 'DISCONNECTED',
        updatedAt: { gte: lastCleared },
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
      },
      take: 5,
    });

    // 2. Busca campanhas recentemente finalizadas
    const completedCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: { gte: lastCleared },
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    // 3. Busca logs de mensagem com falha recente
    const failedMessages = await prisma.messageLog.findMany({
      where: {
        status: 'FAILED',
        updatedAt: { gte: lastCleared },
      },
      select: {
        id: true,
        error: true,
        updatedAt: true,
        contact: {
          select: { name: true, phone: true },
        },
        campaign: {
          select: { name: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    // 4. Junta tudo em um único array de notificações formatadas
    const notifications: any[] = [];

    disconnectedInstances.forEach((inst) => {
      notifications.push({
        id: `inst-${inst.id}-${inst.updatedAt.getTime()}`,
        title: 'Chip Desconectado ⚠️',
        description: `A instância "${inst.name}" perdeu a conexão com o WhatsApp.`,
        type: 'WARNING',
        createdAt: inst.updatedAt.toISOString(),
      });
    });

    completedCampaigns.forEach((camp) => {
      notifications.push({
        id: `camp-${camp.id}-${camp.updatedAt.getTime()}`,
        title: 'Campanha Concluída ✅',
        description: `A campanha "${camp.name}" finalizou todos os disparos programados.`,
        type: 'SUCCESS',
        createdAt: camp.updatedAt.toISOString(),
      });
    });

    failedMessages.forEach((msg) => {
      notifications.push({
        id: `msg-${msg.id}-${msg.updatedAt.getTime()}`,
        title: 'Falha no Disparo ❌',
        description: `Erro ao enviar para ${msg.contact.name || msg.contact.phone}: ${msg.error || 'Erro desconhecido'}. (Campanha: ${msg.campaign.name})`,
        type: 'ERROR',
        createdAt: msg.updatedAt.toISOString(),
      });
    });

    // Ordena do mais recente para o mais antigo
    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, notifications });
  } catch (error: any) {
    console.error('Erro ao buscar notificações:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // Salva cookie indicando a última vez que o usuário limpou/arquivou as notificações
    const cookieStore = await cookies();
    cookieStore.set('last_cleared_notifications_at', new Date().toISOString(), {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 ano
      httpOnly: true,
      sameSite: 'lax',
    });

    return NextResponse.json({ success: true, message: 'Notificações limpas com sucesso' });
  } catch (error: any) {
    console.error('Erro ao limpar notificações:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
