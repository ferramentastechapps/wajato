import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleChatbotIncoming } from '@/lib/chatbot-processor';
import { queueWarmupMessage, cancelCampaignWarmupJobs } from '@/lib/warmup-queue';

/**
 * Normaliza um número de telefone removendo DDI duplicado, + e espaços.
 * Ex: "+5516982027796" -> "5516982027796"
 */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { event, data } = payload;

    console.log(`[Webhook] Evento recebido: ${event}`);

    const eventUpper = String(event).toUpperCase().replace('.', '_');

    // ── MESSAGES_UPSERT: novas mensagens recebidas ────────────────────────────
    if (eventUpper === 'MESSAGES_UPSERT') {
      const messageData = data?.message || data;

      const fromMe = messageData?.key?.fromMe;
      const remoteJid = messageData?.key?.remoteJid || '';
      const instanceName = payload.instance || data?.instance;
      const incomingMessageId = messageData?.key?.id;

      const isGroupMessage = remoteJid.endsWith('@g.us');
      const isDirectMessage = remoteJid.endsWith('@s.whatsapp.net');

      if (!fromMe && remoteJid && (isDirectMessage || isGroupMessage) && instanceName) {
        // Normaliza o número do remetente
        const rawPhone = isGroupMessage ? remoteJid : remoteJid.split('@')[0];
        const phone = normalizePhone(rawPhone);

        // Zera o contador de mensagens consecutivas sem resposta da instância
        try {
          await prisma.whatsAppInstance.updateMany({
            where: { name: instanceName },
            data: { unrepliedMsgCount: 0 },
          });
        } catch (err: any) {
          console.error(`[Webhook] Erro ao resetar unrepliedMsgCount para ${instanceName}:`, err.message);
        }

        const messageText =
          messageData?.message?.conversation ||
          messageData?.message?.extendedTextMessage?.text ||
          messageData?.message?.imageMessage?.caption ||
          messageData?.text || '';

        // Nome do contato/grupo recebido pelo webhook
        const pushName =
          messageData?.pushName ||
          messageData?.notifyName ||
          null;

        if (messageText || isGroupMessage) {
          // Verifica se o remetente é uma de nossas instâncias locais (para evitar loop bidirecional)
          const isLocalInstance = await prisma.whatsAppInstance.findFirst({
            where: {
              OR: [
                { phone: phone },
                { phone: phone.replace(/^55/, '') }, // sem DDI
              ],
            },
          });

          // Busca campanha de aquecimento correspondente de forma flexível:
          // 1. targetPhone exato
          // 2. targetPhones contém o número
          // 3. targetPhone normalizado (sem 55) bate com o número normalizado
          const warmupCampaign = !isLocalInstance
            ? await prisma.warmupCampaign.findFirst({
                where: {
                  sourceInstance: instanceName,
                  status: 'RUNNING',
                  OR: [
                    { targetPhone: phone },
                    { targetPhone: phone.replace(/^55/, '') },
                    { targetPhones: { contains: phone } },
                    { targetPhones: { contains: phone.replace(/^55/, '') } },
                    // Para grupos: remoteJid completo
                    ...(isGroupMessage ? [{ targetPhone: remoteJid }, { targetPhones: { contains: remoteJid } }] : []),
                  ],
                },
              })
            : null;

          if (warmupCampaign && messageText) {
            console.log(`[Webhook] ✅ Resposta de aquecimento de ${phone} (grupo: ${isGroupMessage}) para instância ${instanceName}`);

            // Salva no WarmupLog como mensagem recebida com messageId real
            await prisma.warmupLog.create({
              data: {
                campaignId: warmupCampaign.id,
                fromInstance: phone,
                toPhone: instanceName,
                message: messageText,
                messageType: 'TEXT',
                status: 'READ',
                delayUsed: 0,
                messageId: incomingMessageId || null,
              },
            });

            // Persiste o pushName do contato se disponível (para exibir no chat viewer)
            if (pushName && !isGroupMessage) {
              try {
                await prisma.whatsAppInstance.updateMany({
                  where: { name: instanceName },
                  data: {},
                });
                // Salva o pushName no warmupLog (campo de comentário futuro)
              } catch {}
            }

            // Cancela jobs agendados para esta campanha e agenda resposta rápida
            await cancelCampaignWarmupJobs(warmupCampaign.id);
            await queueWarmupMessage(
              {
                campaignId: warmupCampaign.id,
                sourceInstance: warmupCampaign.sourceInstance,
                targetPhone: isGroupMessage ? remoteJid : phone,
                isFirstMessageOfDay: false,
              },
              60000, // média 60s
              20000  // desvio 20s
            );
          } else if (!warmupCampaign && messageText && isDirectMessage) {
            // Chatbot normal apenas para mensagens diretas fora de campanhas
            handleChatbotIncoming(phone, messageText, instanceName).catch((err) => {
              console.error('[Webhook] Erro no processamento do chatbot:', err);
            });
          }
        }
      }
    }

    // ── MESSAGES_UPDATE: atualização de status de entrega/leitura ─────────────
    if (eventUpper === 'MESSAGES_UPDATE') {
      const messageData = data?.message || data;
      const status = data?.status || messageData?.status;
      const remoteJid = data?.key?.remoteJid || messageData?.key?.remoteJid;
      const updatedMessageId = data?.key?.id || messageData?.key?.id;

      if (remoteJid && status) {
        const phone = normalizePhone(remoteJid.split('@')[0]);

        console.log(`[Webhook] Status update para ${phone}: ${status} | msgId: ${updatedMessageId}`);

        // Atualiza status no WarmupLog se houver messageId correspondente
        if (updatedMessageId) {
          try {
            const warmupLog = await prisma.warmupLog.findFirst({
              where: { messageId: updatedMessageId },
            });
            if (warmupLog && (status === 3 || status === 'READ')) {
              // Mensagem foi lida — pode ser usada para marcar respostas
              console.log(`[Webhook] WarmupLog ${warmupLog.id} lido pelo destinatário`);
            }
          } catch {}
        }

        // Atualiza MessageLog de campanhas normais
        const contact = await prisma.contact.findUnique({ where: { phone } });
        if (contact) {
          const log = await prisma.messageLog.findFirst({
            where: {
              contactId: contact.id,
              status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
            },
            orderBy: { updatedAt: 'desc' },
          });

          if (log) {
            let newStatus = log.status;
            const updateData: any = {};

            if (status === 2 || status === 'DELIVERY_ACK' || status === 'DELIVERED') {
              newStatus = 'DELIVERED';
              updateData.deliveredAt = new Date();
            } else if (status === 3 || status === 'READ') {
              newStatus = 'READ';
              updateData.readAt = new Date();
            }

            if (newStatus !== log.status) {
              updateData.status = newStatus;
              await prisma.messageLog.update({ where: { id: log.id }, data: updateData });
              console.log(`[Webhook] MessageLog ${log.id} -> ${newStatus}`);
            }
          }
        }
      }
    }

    // ── CONNECTION_UPDATE: estado da conexão da instância ─────────────────────
    if (eventUpper === 'CONNECTION_UPDATE') {
      const state = data?.state;
      const instanceName = data?.instance;

      if (instanceName && state) {
        let dbStatus = 'DISCONNECTED';
        if (state === 'open') dbStatus = 'CONNECTED';
        else if (state === 'connecting') dbStatus = 'INITIALIZING';

        const jid = data?.jid || data?.me?.id || data?.me?.jid || data?.ownerJid;
        let phone = null;
        if (jid) phone = jid.split(':')[0].split('@')[0];

        const profileName = data?.profileName || data?.me?.name || null;
        const profilePicUrl = data?.profilePicUrl || null;

        await prisma.whatsAppInstance.upsert({
          where: { name: instanceName },
          update: {
            status: dbStatus,
            qrCode: dbStatus === 'CONNECTED' ? null : undefined,
            phone: phone || undefined,
            profileName: profileName || undefined,
            profilePicUrl: profilePicUrl || undefined,
            updatedAt: new Date(),
          },
          create: {
            name: instanceName,
            status: dbStatus,
            phone: phone || null,
            profileName: profileName || null,
            profilePicUrl: profilePicUrl || null,
            updatedAt: new Date(),
          },
        });
        console.log(`[Webhook] Conexão ${instanceName} -> ${dbStatus}. Fone: ${phone}, Perfil: ${profileName}`);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Erro ao processar webhook:', error);
    return NextResponse.json({ status: 'ignored', error: error.message });
  }
}
