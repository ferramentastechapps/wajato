import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleChatbotIncoming } from '@/lib/chatbot-processor';
import { queueWarmupMessage, cancelCampaignWarmupJobs } from '@/lib/warmup-queue';
import { lidResolver } from '@/lib/lid-resolver';
import { sentMessagesCache } from '@/lib/sent-messages-cache';

/**
 * Normaliza um número de telefone removendo DDI duplicado, + e espaços.
 * Ex: "+5516982027796" -> "5516982027796"
 */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Compara dois números de telefone de forma flexível, tolerando a presença
 * ou ausência do 9º dígito (Brasil) e prefixos/DDI.
 */
function matchBrazilianPhone(phone1: string, phone2: string): boolean {
  const p1 = phone1.replace(/\D/g, '');
  const p2 = phone2.replace(/\D/g, '');
  
  if (p1 === p2) return true;
  
  // Extrai o DDD + número (remove o prefixo 55 se houver)
  const clean1 = p1.startsWith('55') ? p1.slice(2) : p1;
  const clean2 = p2.startsWith('55') ? p2.slice(2) : p2;
  
  if (clean1.length >= 10 && clean2.length >= 10) {
    const ddd1 = clean1.slice(0, 2);
    const num1 = clean1.slice(2);
    const ddd2 = clean2.slice(0, 2);
    const num2 = clean2.slice(2);
    
    if (ddd1 === ddd2) {
      // Normaliza removendo o '9' se o número tiver 9 dígitos e começar com '9'
      const norm1 = num1.length === 9 && num1.startsWith('9') ? num1.slice(1) : num1;
      const norm2 = num2.length === 9 && num2.startsWith('9') ? num2.slice(1) : num2;
      return norm1 === norm2;
    }
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { event, data } = payload;

    console.log(`[Webhook] Evento recebido: ${event}`);

    const eventUpper = String(event).toUpperCase().replace('.', '_');

    // ── MESSAGES_UPSERT: novas mensagens recebidas ────────────────────────────
    if (eventUpper === 'MESSAGES_UPSERT') {
      // Evolution API pode enviar de 3 formas:
      // 1. data.messages[] → array de mensagens (alguns endpoints v2)
      // 2. data diretamente com data.key → objeto mensagem único
      // 3. data como array → array direto
      const messagesArray: any[] = Array.isArray(data?.messages)
        ? data.messages
        : data?.key  // objeto mensagem direto (tem key, message, pushName no mesmo nível)
          ? [data]
          : Array.isArray(data)
            ? data
            : [data];

      const instanceName = payload.instance || data?.instance;

      console.log(`[Webhook Debug] MESSAGES_UPSERT - instance: ${instanceName}, mensagens: ${messagesArray.length}, payload:`, JSON.stringify(payload, null, 2));

      for (const messageData of messagesArray) {
        const fromMe = messageData?.key?.fromMe;
        const remoteJid = messageData?.key?.remoteJid || '';
        const incomingMessageId = messageData?.key?.id;

        const isGroupMessage = remoteJid.endsWith('@g.us');
        const isDirectMessage = remoteJid.endsWith('@s.whatsapp.net');
        const isLidMessage = remoteJid.endsWith('@lid');
        const isStatusUpdate = remoteJid === 'status@broadcast';

        if (!fromMe && remoteJid && (isDirectMessage || isLidMessage || isGroupMessage || isStatusUpdate) && instanceName) {
          // Se for mensagem direta e tiver altJid (LID), prefere o altJid para obter o número real em vez do ID interno
          const altJid = messageData?.key?.remoteJidAlt || messageData?.key?.participantAlt;
          const senderJid = (isGroupMessage || isStatusUpdate)
            ? (messageData?.key?.participant || remoteJid)
            : (altJid && altJid.includes('@s.whatsapp.net') ? altJid : remoteJid);
          
          let phone = normalizePhone(senderJid.split('@')[0]);
          if (senderJid.endsWith('@lid')) {
            const resolved = lidResolver.getPhone(senderJid);
            if (resolved) {
              phone = resolved;
            }
          }

          // Registrar mapeamento de LID se aplicável
          if (isLidMessage && altJid) {
            lidResolver.addMapping(remoteJid, altJid);
          }

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
            data?.pushName ||
            payload?.pushName ||
            null;

          console.log(`[Webhook Debug] Mensagem de ${phone} (fromMe:${fromMe}, grupo:${isGroupMessage}, status:${isStatusUpdate}): "${messageText}" pushName:"${pushName}"`);

          // Se for uma atualização de Status do WhatsApp, salva e continua
          if (isStatusUpdate) {
            try {
              let mediaType = 'text';
              let content = messageText || '';
              let mediaUrl = null;

              const messageObj = messageData?.message;
              if (messageObj?.imageMessage) {
                mediaType = 'image';
                content = messageObj.imageMessage.caption || '';
                mediaUrl = `/api/chat/media?instanceName=${instanceName}&messageId=${incomingMessageId}&fromMe=false&remoteJid=status@broadcast`;
              } else if (messageObj?.videoMessage) {
                mediaType = 'video';
                content = messageObj.videoMessage.caption || '';
                mediaUrl = `/api/chat/media?instanceName=${instanceName}&messageId=${incomingMessageId}&fromMe=false&remoteJid=status@broadcast`;
              } else if (messageObj?.audioMessage) {
                mediaType = 'audio';
                mediaUrl = `/api/chat/media?instanceName=${instanceName}&messageId=${incomingMessageId}&fromMe=false&remoteJid=status@broadcast`;
              }

              await prisma.whatsAppStatus.create({
                data: {
                  instanceName,
                  senderJid,
                  senderName: pushName || phone,
                  mediaType,
                  content,
                  mediaUrl,
                },
              });
              console.log(`[Webhook] Novo status de ${pushName || phone} salvo para a instância ${instanceName}`);
            } catch (err: any) {
              console.error('[Webhook] Erro ao processar atualização de status:', err.message);
            }
            continue;
          }

          // Salva ou atualiza o contato no banco de dados local com o nome de perfil do WhatsApp
          if ((isDirectMessage || isLidMessage) && phone && pushName && !pushName.includes('@')) {
            try {
              const contact = await prisma.contact.findUnique({ where: { phone } });
              if (!contact) {
                await prisma.contact.create({
                  data: { phone, name: pushName },
                });
                console.log(`[Webhook] Contato ${phone} cadastrado automaticamente com pushName: ${pushName}`);
              } else if (!contact.name) {
                await prisma.contact.update({
                  where: { id: contact.id },
                  data: { name: pushName },
                });
                console.log(`[Webhook] Contato ${phone} atualizado com nome pushName: ${pushName}`);
              }
            } catch (err: any) {
              console.error(`[Webhook] Erro ao cadastrar/atualizar contato ${phone}:`, err.message);
            }
          }

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

            // Busca todas as campanhas ativas para esta instância no banco
            const runningCampaigns = !isLocalInstance
              ? await prisma.warmupCampaign.findMany({
                  where: {
                    sourceInstance: instanceName,
                    status: 'RUNNING'
                  }
                })
              : [];

            // Encontra a campanha correspondente usando comparação flexível
            const warmupCampaign = runningCampaigns.find(camp => {
              const target = camp.targetPhone;
              const targetPhones = camp.targetPhones || '';
              if (isGroupMessage) {
                return target === remoteJid || targetPhones.includes(remoteJid);
              }
              return matchBrazilianPhone(phone, target) || targetPhones.split(',').some(p => matchBrazilianPhone(phone, p));
            }) || null;

            if (warmupCampaign && messageText) {
              console.log(`[Webhook] ✅ Resposta de aquecimento de ${phone} (grupo: ${isGroupMessage}) mapeada para campanha ${warmupCampaign.id} (${warmupCampaign.targetPhone})`);

              // Salva no WarmupLog como mensagem recebida
              await prisma.warmupLog.create({
                data: {
                  campaignId: warmupCampaign.id,
                  fromInstance: isGroupMessage ? phone : warmupCampaign.targetPhone,
                  toPhone: instanceName,
                  message: messageText,
                  messageType: 'TEXT',
                  status: 'READ',
                  delayUsed: 0,
                  messageId: incomingMessageId || null,
                  senderName: pushName,
                },
              });

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
            } else if (!warmupCampaign && messageText && (isDirectMessage || isLidMessage)) {
              // Chatbot normal apenas para mensagens diretas fora de campanhas
              handleChatbotIncoming(phone, messageText, instanceName).catch((err) => {
                console.error('[Webhook] Erro no processamento do chatbot:', err);
              });
            }
          }
        } else if (fromMe && remoteJid && (isDirectMessage || isLidMessage) && instanceName) {
          // Mensagem enviada a partir da nossa própria instância
          const altJid = messageData?.key?.remoteJidAlt || messageData?.key?.participantAlt;
          const senderJid = altJid && altJid.includes('@s.whatsapp.net') ? altJid : remoteJid;
          let phone = normalizePhone(senderJid.split('@')[0]);
          if (senderJid.endsWith('@lid')) {
            const resolved = lidResolver.getPhone(senderJid);
            if (resolved) {
              phone = resolved;
            }
          }

          // Checa se a mensagem foi enviada pelo sistema de forma automática
          const isSystem = await sentMessagesCache.has(incomingMessageId);
          if (!isSystem) {
            // Foi uma interação manual feita pelo usuário (no app do celular ou web UI do Wajato)
            const pausedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
            try {
              await prisma.contact.upsert({
                where: { phone },
                update: { chatbotPausedUntil: pausedUntil },
                create: { phone, name: `+${phone}`, chatbotPausedUntil: pausedUntil },
              });
              console.log(`[Webhook] Chatbot pausado para ${phone} até ${pausedUntil.toISOString()} devido a resposta manual.`);
            } catch (err: any) {
              console.error(`[Webhook] Erro ao pausar chatbot para ${phone}:`, err.message);
            }
          } else {
            // Deleta do cache do Redis para não acumular
            await sentMessagesCache.delete(incomingMessageId);
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
