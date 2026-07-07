import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { queueMessage, cancelCampaignJobs } from '@/lib/queue';
import { evolutionApi } from '@/lib/evolution';
import { resolveContactsForSegment } from '@/lib/segment-resolver';

const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const { action } = await request.json();

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { group: true, segment: true },
    });

    if (!campaign) {
      return NextResponse.json({ message: 'Campanha não encontrada' }, { status: 404 });
    }

    if (action === 'START') {
      // 1. Verifica se o WhatsApp está conectado
      const waStatus = await evolutionApi.getConnectionState(INSTANCE_NAME);
      if (waStatus !== 'CONNECTED') {
        return NextResponse.json(
          { message: 'WhatsApp desconectado. Conecte no dashboard antes de disparar.' },
          { status: 400 }
        );
      }

      // 2. Busca contatos vinculados ao grupo ou segmento da campanha
      let contacts: any[] = [];
      if (campaign.segmentId && campaign.segment) {
        const filters = typeof campaign.segment.filters === 'string'
          ? JSON.parse(campaign.segment.filters)
          : (campaign.segment.filters as any);
        contacts = await resolveContactsForSegment(filters);
      } else if (campaign.groupId) {
        contacts = await prisma.contact.findMany({
          where: { groupId: campaign.groupId },
        });
      }

      if (contacts.length === 0) {
        return NextResponse.json(
          { message: 'A segmentação ou grupo selecionado não possui contatos válidos.' },
          { status: 400 }
        );
      }

      // 3. Atualiza status da campanha para SENDING
      await prisma.campaign.update({
        where: { id },
        data: { status: 'SENDING' },
      });

      // 4. Limpa quaisquer jobs pendentes residuais no BullMQ por precaução
      await cancelCampaignJobs(id);

      // 5. Agenda os disparos com delay progressivo
      let accumulatedDelayMs = 0;
      const delayMinMs = campaign.delayMin * 1000;
      const delayMaxMs = campaign.delayMax * 1000;

      for (const contact of contacts) {
        // Verifica se já existe um log de sucesso/falha definitiva para evitar re-enviar
        let log = await prisma.messageLog.findFirst({
          where: {
            campaignId: id,
            contactId: contact.id,
          },
        });

        // Se já foi enviado com sucesso, ignora
        if (log && ['SENT', 'DELIVERED', 'READ'].includes(log.status)) {
          continue;
        }

        // Se for um log falho ou inexistente, vamos processar (ou re-tentar)
        if (!log) {
          log = await prisma.messageLog.create({
            data: {
              campaignId: id,
              contactId: contact.id,
              status: 'PENDING',
            },
          });
        } else {
          // Se já existia (mas falhou), volta para PENDING
          log = await prisma.messageLog.update({
            where: { id: log.id },
            data: { status: 'PENDING', error: null },
          });
        }

        // Adiciona à fila com delay progressivo
        // Ex: Contato 1 = delay 0ms. Contato 2 = 10s. Contato 3 = 22s.
        await queueMessage(
          {
            messageLogId: log.id,
            campaignId: id,
            contactId: contact.id,
            phone: contact.phone,
          },
          accumulatedDelayMs
        );

        // Gera delay aleatório entre min e max para o próximo contato
        const randomDelay = Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1)) + delayMinMs;
        accumulatedDelayMs += randomDelay;
      }

      console.log(`[Campanha] ${campaign.name} iniciada/retomada. Disparos agendados.`);
      return NextResponse.json({ success: true, message: 'Campanha iniciada com sucesso' });
    }

    if (action === 'PAUSE') {
      // 1. Atualiza status para PAUSED no banco
      await prisma.campaign.update({
        where: { id },
        data: { status: 'PAUSED' },
      });

      // 2. Remove jobs pendentes da fila no Redis
      await cancelCampaignJobs(id);

      console.log(`[Campanha] ${campaign.name} pausada. Fila limpa.`);
      return NextResponse.json({ success: true, message: 'Campanha pausada' });
    }

    if (action === 'CANCEL') {
      // 1. Atualiza status para CANCELLED no banco
      await prisma.campaign.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // 2. Remove da fila no Redis
      await cancelCampaignJobs(id);

      // 3. Marca mensagens restantes que continuavam PENDING como FAILED (canceladas)
      await prisma.messageLog.updateMany({
        where: {
          campaignId: id,
          status: 'PENDING',
        },
        data: {
          status: 'FAILED',
          error: 'Campanha cancelada pelo usuário',
        },
      });

      console.log(`[Campanha] ${campaign.name} cancelada.`);
      return NextResponse.json({ success: true, message: 'Campanha cancelada' });
    }

    return NextResponse.json({ message: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('Erro na ação da campanha:', error);
    return NextResponse.json(
      { message: error.message || 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
