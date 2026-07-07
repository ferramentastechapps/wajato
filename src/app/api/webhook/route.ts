import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleChatbotIncoming } from '@/lib/chatbot-processor';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { event, data } = payload;

    console.log(`[Webhook] Evento recebido: ${event}`);

    // Processa novas mensagens recebidas (Chatbot Auto-responder)
    if (event === 'MESSAGES_UPSERT') {
      const messageData = data?.message || data;
      
      // Ignora mensagens enviadas por nós mesmos para evitar loops infinitos
      const fromMe = messageData?.key?.fromMe;
      const remoteJid = messageData?.key?.remoteJid;
      const instanceName = payload.instance || data?.instance;

      if (!fromMe && remoteJid && remoteJid.endsWith('@s.whatsapp.net') && instanceName) {
        const phone = remoteJid.split('@')[0];
        const messageText = messageData?.message?.conversation || 
                            messageData?.message?.extendedTextMessage?.text || 
                            messageData?.text || '';
        
        if (messageText) {
          // Executa processador do chatbot de forma assíncrona (non-blocking)
          handleChatbotIncoming(phone, messageText, instanceName).catch((err) => {
            console.error('[Webhook] Erro no processamento do chatbot:', err);
          });
        }
      }
    }

    // Processa atualizações de status de mensagem
    if (event === 'MESSAGES_UPDATE') {
      const messageData = data?.message || data;
      const status = data?.status || messageData?.status;
      const remoteJid = data?.key?.remoteJid || messageData?.key?.remoteJid;

      if (remoteJid && status) {
        // Extrai apenas os números do JID (ex: 5511999999999@s.whatsapp.net -> 5511999999999)
        const phone = remoteJid.split('@')[0];
        
        console.log(`[Webhook] Status update para ${phone}: ${status}`);

        // Busca o log mais recente desse contato que esteja ativo (SENT ou PENDING)
        const contact = await prisma.contact.findUnique({
          where: { phone },
        });

        if (contact) {
          const log = await prisma.messageLog.findFirst({
            where: {
              contactId: contact.id,
              status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
            },
            orderBy: { updatedAt: 'desc' },
          });

          if (log) {
            // Mapeia o status do WhatsApp Web/Baileys
            // 2 ou 'DELIVERY_ACK' ou 'DELIVERED' -> Entregue
            // 3 ou 'READ' -> Lido
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
              
              await prisma.messageLog.update({
                where: { id: log.id },
                data: updateData,
              });
              console.log(`[Webhook] Log ${log.id} atualizado para ${newStatus}`);
            }
          }
        }
      }
    }

    // Processa atualização do estado da conexão
    if (event === 'CONNECTION_UPDATE') {
      const state = data?.state;
      const instanceName = data?.instance;
      
      if (instanceName && state) {
        let dbStatus = 'DISCONNECTED';
        if (state === 'open') dbStatus = 'CONNECTED';
        else if (state === 'connecting') dbStatus = 'INITIALIZING';

        // Extrai o telefone do JID do proprietário se disponível
        const jid = data?.jid || data?.me?.id || data?.me?.jid || data?.ownerJid;
        let phone = null;
        if (jid) {
          phone = jid.split(':')[0].split('@')[0];
        }

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
        console.log(`[Webhook] Conexão da instância ${instanceName} atualizada para ${dbStatus}. Fone: ${phone}, Perfil: ${profileName}`);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Erro ao processar webhook:', error);
    // Retorna OK de qualquer forma para evitar loops de retry do servidor da Evolution API
    return NextResponse.json({ status: 'ignored', error: error.message });
  }
}
