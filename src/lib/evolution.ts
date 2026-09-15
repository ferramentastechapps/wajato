import axios from 'axios';
import { prisma } from './prisma';
import { sentMessagesCache } from './sent-messages-cache';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8082';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'wajato_global_api_key_5544';

const evolutionClient = axios.create({
  baseURL: EVOLUTION_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': EVOLUTION_API_KEY,
  },
});

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  hash?: {
    apikey: string;
  };
  qrcode?: {
    base64?: string;
    pairingCode?: string;
    code?: string;
  };
  pairingCode?: string;
}

export interface GroupParticipant {
  id: string;        // JID ex: "5511999998888@s.whatsapp.net"
  admin: 'admin' | 'superadmin' | null;
  phoneNumber?: string;
  name?: string;
}

export interface WhatsAppGroup {
  id: string;          // JID ex: "120363...@g.us"
  subject: string;     // Nome do grupo
  subjectOwner?: string;
  creation?: number;
  desc?: string;
  participants: GroupParticipant[];
  size?: number;
}

export interface ConnectionStateResponse {
  instance: {
    instanceName: string;
    state: 'open' | 'connecting' | 'close';
  };
}

async function registerSentMessage(data: any) {
  try {
    if (!data) return;
    const messages = Array.isArray(data) ? data : [data];
    for (const m of messages) {
      const id = m?.key?.id || m?.id;
      if (id) {
        await sentMessagesCache.add(id);
      }
    }
  } catch (err) {
    console.error('[Evolution API] Erro ao registrar mensagem enviada:', err);
  }
}

/**
 * Extrai a mensagem de erro real retornada pela Evolution API (mesmo aninhada em response.message)
 */
export function extractEvolutionError(error: any, defaultMsg: string): string {
  const data = error?.response?.data;
  if (!data) return error?.message || defaultMsg;

  // Evolution API v2: { response: { message: ['Error: Connection Closed'] } } ou { message: '...' }
  const respMsg = data?.response?.message;
  if (Array.isArray(respMsg) && respMsg.length > 0) {
    return respMsg.filter(Boolean).join(', ');
  }
  if (typeof respMsg === 'string' && respMsg.trim()) {
    return respMsg.trim();
  }
  if (Array.isArray(data?.message) && data.message.length > 0) {
    return data.message.filter(Boolean).join(', ');
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }
  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }
  return error?.message || defaultMsg;
}

export const evolutionApi = {
  /**
   * Gera um token determinístico para a instância no Evolution Go
   */
  getInstanceToken(instanceName: string): string {
    const safeName = String(instanceName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `wajato_token_${safeName}`;
  },

  /**
   * Cria uma nova instância de conexão no Evolution API (compatível com Go e Node).
   * @param instanceName Nome da instância
   * @param qrcode Se true (padrão), gera QR code. Se false, usa modo pairing code.
   * @param number Número do telefone opcional (útil quando qrcode = false)
   */
  async createInstance(instanceName: string, qrcode: boolean = true, number?: string): Promise<CreateInstanceResponse> {
    const token = this.getInstanceToken(instanceName);
    try {
      const payload: any = {
        name: instanceName,
        instanceName,
        token,
        qrcode: true, // No Evolution Go whatsmeow, qrcode: true inicializa o cliente e permite tanto QR quanto Pairing Code
        integration: 'WHATSAPP-BAILEYS',
      };
      if (number) {
        payload.number = this.formatPhone(number);
        payload.phone = this.formatPhone(number);
      }
      const response = await evolutionClient.post<any>('/instance/create', payload);
      const data = response.data;
      return {
        instance: {
          instanceName: data?.data?.name || data?.instance?.instanceName || instanceName,
          status: data?.data?.connected ? 'connected' : 'created',
        },
        hash: {
          apikey: token,
        },
        qrcode: data?.data?.qrcode ? {
          base64: data?.data?.qrcode,
        } : data?.qrcode,
      };
    } catch (error: any) {
      // Se a instância já existe no Evolution Go, retorna de forma idempotente
      if (error?.response?.data?.error === 'instance already exists' || error?.response?.status === 409) {
        return {
          instance: {
            instanceName,
            status: 'created',
          },
          hash: {
            apikey: token,
          },
        };
      }
      console.error(`Erro ao criar instância ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || error?.response?.data?.error || 'Falha ao criar instância no Evolution API');
    }
  },


  /**
   * Busca a lista de todas as instâncias no Evolution API (suporta Go /instance/all e Node /instance/fetchInstances)
   */
  async fetchInstances(): Promise<any[]> {
    try {
      // 1. Tenta rota do Evolution Go (/instance/all)
      try {
        const goRes = await evolutionClient.get('/instance/all');
        const list = goRes.data?.data;
        if (Array.isArray(list)) {
          return list.map((inst: any) => ({
            id: inst.id || inst.name,
            name: inst.name,
            connectionStatus: inst.connected ? 'open' : (inst.qrcode ? 'connecting' : 'close'),
            ownerJid: inst.jid || null,
            profileName: inst.name,
            profilePicUrl: inst.profilePicUrl || null,
            qrcode: inst.qrcode ? { base64: inst.qrcode } : undefined,
            token: inst.token || this.getInstanceToken(inst.name),
            _count: { Message: 0, Contact: 0, Chat: 0 },
            raw: inst,
          }));
        }
      } catch (goErr: any) {
        // Se der 404, cai no fallback de Evolution Node
      }

      // 2. Fallback para Evolution API v2 tradicional (Node.js)
      const response = await evolutionClient.get('/instance/fetchInstances');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error('Erro ao buscar instâncias no Evolution API:', error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Obtém o QR Code atual para conexão
   */
  async getQRCode(instanceName: string): Promise<{ base64?: string; code?: string; count?: number }> {
    const token = this.getInstanceToken(instanceName);
    try {
      // 1. Tenta rota do Evolution Go (/instance/qr)
      try {
        try {
          await this.createInstance(instanceName, true);
        } catch (e) {}

        const goRes = await evolutionClient.get('/instance/qr', {
          headers: { apikey: token },
        });
        const data = goRes.data?.data;
        if (data?.qrcode) {
          return { base64: data.qrcode, code: data.code };
        }
      } catch (goErr: any) {
        // Se ainda está iniciando o socket do WhatsApp (400), retorna count: 1 para o cliente continuar polling
        if (goErr?.response?.status === 400) {
          return { count: 1 };
        }
      }

      // 2. Fallback Evolution Node (/instance/connect/:instanceName)
      const response = await evolutionClient.get(`/instance/connect/${instanceName}`);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao buscar QR Code para ${instanceName}:`, error?.response?.data || error.message);
      return { count: 0 };
    }
  },

  /**
   * Obtém o código de pareamento (Pairing Code) para a instância e telefone
   */
  async getPairingCode(instanceName: string, phone: string): Promise<{ code: string }> {
    const formattedPhone = this.formatPhone(phone);
    const token = this.getInstanceToken(instanceName);

    // 1. Tenta Evolution Go: POST /instance/pair com apikey: token
    try {
      // Garante que a instância existe no Evolution Go antes de solicitar o código de pareamento
      try {
        await this.createInstance(instanceName, true);
        await new Promise((r) => setTimeout(r, 1200));
      } catch (e) {
        // Já existe ou foi criada
      }

      const goRes = await evolutionClient.post(
        '/instance/pair',
        { phone: formattedPhone },
        { headers: { apikey: token } }
      );
      const pairCode = goRes.data?.data?.PairingCode || goRes.data?.PairingCode || goRes.data?.data?.pairingCode || goRes.data?.pairingCode;
      if (pairCode && typeof pairCode === 'string') {
        return { code: pairCode.trim() };
      }
    } catch (goErr: any) {
      // Fallback
    }

    // 2. Fallback Evolution Node v2: GET /instance/connect/:instanceName?number=...
    try {
      const response = await evolutionClient.get(`/instance/connect/${instanceName}`, {
        params: { number: formattedPhone },
      });

      const rawCandidates = [
        response.data?.pairingCode,
        response.data?.qrcode?.pairingCode,
        response.data?.pairing_code,
      ];

      const validCode = rawCandidates.find(
        (c) => typeof c === 'string' && c.trim().length >= 6 && c.trim().length <= 12 && !c.includes('+') && !c.includes('/') && !c.includes('@')
      );

      if (validCode) {
        return { code: validCode.trim() };
      }
    } catch (nodeErr: any) {
      console.error(`Erro ao buscar Pairing Code para ${instanceName}:`, nodeErr?.response?.data || nodeErr.message);
    }

    throw new Error('Evolution API não retornou um pairingCode válido');
  },

  /**
   * Desconecta o WhatsApp da instância
   */
  async logoutInstance(instanceName: string): Promise<void> {
    const token = this.getInstanceToken(instanceName);
    try {
      try {
        await evolutionClient.delete('/instance/logout', {
          headers: { apikey: token },
        });
        return;
      } catch (e) {}

      await evolutionClient.delete(`/instance/logout/${instanceName}`);
    } catch (error: any) {
      console.error(`Erro ao deslogar ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao deslogar a instância');
    }
  },

  /**
   * Exclui a instância do Evolution API
   */
  async deleteInstance(instanceName: string): Promise<void> {
    try {
      // 1. Se for UUID, tenta deletar diretamente no Evolution Go
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceName);
      if (isUuid) {
        await evolutionClient.delete(`/instance/delete/${instanceName}`);
        return;
      }

      // 2. Se for nome, busca o UUID correspondente na lista de instâncias do Evolution Go
      try {
        const instances = await this.fetchInstances();
        const found = instances.find(
          (i: any) => (i.name && i.name.toLowerCase() === instanceName.toLowerCase()) || i.id === instanceName
        );
        if (found?.id && found.id !== found.name) {
          await evolutionClient.delete(`/instance/delete/${found.id}`);
          return;
        }
      } catch (goErr) {
        // Fallback
      }

      // 3. Fallback Evolution Node (aceita nome diretamente na URL)
      await evolutionClient.delete(`/instance/delete/${instanceName}`);
    } catch (error: any) {
      console.error(`Erro ao excluir ${instanceName}:`, error?.response?.data || error.message);
      // Ignora se já estiver excluída
    }
  },

  /**
   * Verifica o status da conexão da instância
   */
  async getConnectionState(instanceName: string): Promise<'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED'> {
    const token = this.getInstanceToken(instanceName);
    try {
      // 1. Tenta Evolution Go (/instance/status com token da instância)
      try {
        const goRes = await evolutionClient.get('/instance/status', {
          headers: { apikey: token },
        });
        const data = goRes.data?.data;
        if (data) {
          if (data.LoggedIn) return 'CONNECTED';
          if (data.Connected) return 'INITIALIZING';
          return 'DISCONNECTED';
        }
      } catch (goErr: any) {
        // Fallback
      }

      // 2. Fallback Evolution Node (/instance/connectionState/:instanceName)
      const response = await evolutionClient.get<ConnectionStateResponse>(`/instance/connectionState/${instanceName}`);
      const state = response.data?.instance?.state;
      
      if (state === 'open') return 'CONNECTED';
      if (state === 'connecting') return 'INITIALIZING';
      return 'DISCONNECTED';
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return 'DISCONNECTED';
      }
      console.error(`Erro ao buscar estado da conexão para ${instanceName}:`, error?.response?.data || error.message);
      return 'DISCONNECTED';
    }
  },

  /**
   * Envia uma mensagem de texto simples
   */
  async sendTextMessage(instanceName: string, phone: string, text: string, delay: number = 1200): Promise<any> {
    const formattedPhone = this.formatPhone(phone);
    const token = this.getInstanceToken(instanceName);

    try {
      // 1. Tenta Evolution Go (POST /send/text com apikey: token)
      try {
        const goRes = await evolutionClient.post(
          '/send/text',
          {
            number: formattedPhone,
            text: text,
          },
          {
            headers: { apikey: token },
          }
        );
        await registerSentMessage(goRes.data);
        return goRes.data;
      } catch (goErr: any) {
        // Se for erro de validação ou erro de envio real do WhatsApp, extrai e lança
        if (goErr?.response?.status && goErr?.response?.status !== 404) {
          const errMsg = extractEvolutionError(goErr, 'Falha ao enviar mensagem de texto');
          throw new Error(errMsg);
        }
      }

      // 2. Fallback Evolution Node (/message/sendText/:instanceName)
      const response = await evolutionClient.post(`/message/sendText/${instanceName}`, {
        number: formattedPhone,
        text: text,
        options: {
          delay: delay,
          presence: 'composing',
        },
      });
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar mensagem de texto para ${phone}:`, error?.response?.data || error.message);
      const errMsg = extractEvolutionError(error, 'Falha ao enviar mensagem de texto');
      throw new Error(errMsg);
    }
  },

  /**
   * Envia uma mensagem de mídia (Imagem, Vídeo, Áudio, Documento)
   */
  async sendMediaMessage(
    instanceName: string,
    phone: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    caption?: string
  ): Promise<any> {
    const formattedPhone = this.formatPhone(phone);
    const token = this.getInstanceToken(instanceName);

    // Converte URLs relativas (/api/uploads/...) em URLs públicas absolutas
    let finalMediaUrl = mediaUrl;
    if (finalMediaUrl.startsWith('/')) {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://wajato.ftech-apps.com.br').replace(/\/$/, '');
      finalMediaUrl = `${baseUrl}${finalMediaUrl}`;
    }

    // 1. Tenta Evolution Go (POST /send/media com apikey: token)
    try {
      const goRes = await evolutionClient.post(
        '/send/media',
        {
          number: formattedPhone,
          url: finalMediaUrl,
          mediaType: mediaType,
          caption: caption || '',
        },
        {
          headers: { apikey: token },
        }
      );
      await registerSentMessage(goRes.data);
      return goRes.data;
    } catch (goErr: any) {
      if (goErr?.response?.status && goErr?.response?.status !== 404) {
        const errMsg = extractEvolutionError(goErr, 'Falha ao enviar mídia');
        throw new Error(errMsg);
      }
    }

    // 2. Fallback Evolution Node (/message/sendMedia/:instanceName)
    try {
      let fileName = 'file';
      if (mediaType === 'image') {
        fileName = finalMediaUrl.includes('.webp') ? 'image.webp' : (finalMediaUrl.includes('.png') ? 'image.png' : 'image.jpg');
      } else if (mediaType === 'video') {
        fileName = 'video.mp4';
      } else if (mediaType === 'audio') {
        fileName = 'audio.mp3';
      } else if (mediaType === 'document') {
        fileName = 'document.pdf';
      }

      const response = await evolutionClient.post(`/message/sendMedia/${instanceName}`, {
        number: formattedPhone,
        mediatype: mediaType,
        media: finalMediaUrl,
        caption: caption || '',
        fileName: fileName,
      });
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar mensagem de mídia para ${phone}:`, error?.response?.data || error.message);
      const errMsg = extractEvolutionError(error, 'Falha ao enviar mídia');
      throw new Error(errMsg);
    }
  },

  /**
   * Configura o Webhook na instância do Evolution API para escutar status
   */
  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    try {
      await evolutionClient.post(`/webhook/set/${instanceName}`, {
        webhook: {
          enabled: true,
          url: webhookUrl,
          by: 'default',
          headers: {
            'apikey': EVOLUTION_API_KEY
          },
          events: [
            'SEND_MESSAGE',
            'MESSAGES_SET',
            'MESSAGES_UPSERT', // Mensagens recebidas (chatbot auto-responder)
            'MESSAGES_UPDATE', // Contém o status (delivered, read)
            'CONNECTION_UPDATE'
          ]
        }
      });
    } catch (error: any) {
      if (error?.response?.status === 404) {
        // No Evolution Go, webhooks são globais ou desabilitados por padrão
        console.warn(`[Evolution] Webhook não suportado ou configurado de forma estática para ${instanceName}.`);
        return;
      }
      console.error(`Erro ao configurar webhook para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao configurar webhook');
    }
  },

  /**
   * Envia uma reação (emoji) a uma mensagem específica
   */
  async sendReaction(instanceName: string, phone: string, messageId: string, reaction: string): Promise<any> {
    const formattedPhone = this.formatPhone(phone);
    const token = this.getInstanceToken(instanceName);

    try {
      // 1. Tenta Evolution Go (POST /message/react)
      try {
        const goRes = await evolutionClient.post(
          '/message/react',
          {
            number: formattedPhone,
            id: messageId,
            reaction,
            fromMe: false,
          },
          { headers: { apikey: token } }
        );
        return goRes.data;
      } catch (goErr: any) {
        // Fallback
      }

      // 2. Fallback Evolution Node
      const response = await evolutionClient.post(`/message/sendReaction/${instanceName}`, {
        key: {
          remoteJid: `${formattedPhone}@s.whatsapp.net`,
          id: messageId,
        },
        reaction,
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar reação para ${phone}:`, error?.response?.data || error.message);
      // Reações não são críticas, não lança exceção
      return null;
    }
  },

  /**
   * Marca mensagens de um chat como lidas (simula abertura do chat)
   */
  async markAsRead(instanceName: string, phone: string): Promise<void> {
    const formattedPhone = this.formatPhone(phone);
    const token = this.getInstanceToken(instanceName);

    try {
      // 1. Tenta Evolution Go (POST /message/markread)
      try {
        await evolutionClient.post(
          '/message/markread',
          {
            number: formattedPhone,
            id: ['all'],
          },
          { headers: { apikey: token } }
        );
        return;
      } catch (goErr: any) {
        // Fallback
      }

      // 2. Fallback Evolution Node
      await evolutionClient.post(`/chat/markMessageAsRead/${instanceName}`, {
        readMessages: [
          {
            remoteJid: `${formattedPhone}@s.whatsapp.net`,
            fromMe: false,
            id: 'all',
          },
        ],
      });
    } catch (error: any) {
      // Não crítico, ignora silenciosamente
      console.warn(`[Warmup] Não foi possível marcar como lido para ${phone}`);
    }
  },

  /**
   * Envia um áudio via URL como PTT (Push to Talk — Nota de Voz nativa)
   * Usa o endpoint dedicado sendWhatsAppAudio da Evolution API com ptt: true.
   * Presença "recording" é enviada antes para máxima humanização.
   */
  async sendAudioUrl(instanceName: string, phone: string, audioUrl: string): Promise<any> {
    const formattedPhone = this.formatPhone(phone);
    const token = this.getInstanceToken(instanceName);

    // Converte URLs relativas em URLs públicas absolutas
    let finalAudioUrl = audioUrl;
    if (finalAudioUrl.startsWith('/')) {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://wajato.ftech-apps.com.br').replace(/\/$/, '');
      finalAudioUrl = `${baseUrl}${finalAudioUrl}`;
    }

    try {
      // 1. Tenta Evolution Go (POST /send/media com mediaType: audio)
      try {
        const goRes = await evolutionClient.post(
          '/send/media',
          {
            number: formattedPhone,
            url: finalAudioUrl,
            mediaType: 'audio',
          },
          { headers: { apikey: token } }
        );
        await registerSentMessage(goRes.data);
        return goRes.data;
      } catch (goErr: any) {
        // Fallback
      }

      // Primeiro: sinaliza que está "gravando" (aumenta humanização)
      try {
        await evolutionClient.post(`/chat/presence/${instanceName}`, {
          number: `${formattedPhone}@s.whatsapp.net`,
          options: { presence: 'recording', delay: 1500 },
        });
      } catch { /* não crítico */ }

      // Endpoint dedicado de áudio PTT da Evolution API
      const response = await evolutionClient.post(`/message/sendWhatsAppAudio/${instanceName}`, {
        number: formattedPhone,
        audio: finalAudioUrl,
        options: {
          encoding: true, // force re-encode para garantir OPUS
          delay: 1000,
        },
      });
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      // Fallback: sendMedia com mimetype opus (método antigo)
      try {
        const response = await evolutionClient.post(`/message/sendMedia/${instanceName}`, {
          number: formattedPhone,
          mediatype: 'audio',
          media: finalAudioUrl,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true,
          options: { presence: 'recording', delay: 1500 }
        });
        await registerSentMessage(response.data);
        return response.data;
      } catch (fallbackError: any) {
        console.error(`Erro ao enviar áudio PTT para ${phone}:`, fallbackError?.response?.data || fallbackError.message);
        const errMsg = extractEvolutionError(fallbackError, 'Falha ao enviar áudio PTT');
        throw new Error(errMsg);
      }
    }
  },

  /**
   * Envia um sticker via URL (.webp)
   */
  async sendSticker(instanceName: string, phone: string, stickerUrl: string): Promise<any> {
    const formattedPhone = this.formatPhone(phone);
    const token = this.getInstanceToken(instanceName);

    // Converte URLs relativas em URLs públicas absolutas
    let finalStickerUrl = stickerUrl;
    if (finalStickerUrl.startsWith('/')) {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://wajato.ftech-apps.com.br').replace(/\/$/, '');
      finalStickerUrl = `${baseUrl}${finalStickerUrl}`;
    }

    try {
      // 1. Tenta Evolution Go (POST /send/sticker)
      try {
        const goRes = await evolutionClient.post(
          '/send/sticker',
          {
            number: formattedPhone,
            sticker: finalStickerUrl,
          },
          { headers: { apikey: token } }
        );
        await registerSentMessage(goRes.data);
        return goRes.data;
      } catch (goErr: any) {
        // Fallback
      }

      // 2. Fallback Evolution Node
      const response = await evolutionClient.post(`/message/sendSticker/${instanceName}`, {
        number: formattedPhone,
        stickerMessage: {
          image: finalStickerUrl,
        },
      });
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar sticker para ${phone}:`, error?.response?.data || error.message);
      // Stickers não são críticos, não lança exceção
      return null;
    }
  },

  /**
   * Posta um Story/Status de texto, imagem ou vídeo.
   * CORREÇÃO: statusJidList deve conter JIDs completos com @s.whatsapp.net.
   */
  async sendStatusUpdate(instanceName: string, text: string, statusType: 'text' | 'image' | 'video' = 'text', targetPhone?: string, mediaUrl?: string): Promise<any> {
    const token = this.getInstanceToken(instanceName);

    try {
      // 1. Tenta Evolution Go
      if (statusType === 'text') {
        try {
          const goRes = await evolutionClient.post(
            '/send/status/text',
            { text },
            { headers: { apikey: token } }
          );
          await registerSentMessage(goRes.data);
          return goRes.data;
        } catch (goErr: any) {
          // Fallback
        }
      }

      // 2. Fallback Evolution Node
      const cleanPhone = targetPhone ? targetPhone.replace(/\D/g, '') : '';
      
      let statusJidList: string[] = [];
      if (cleanPhone) {
        statusJidList = [cleanPhone];
      } else {
        // Tentar obter pelo menos um contato real da lista de conversas da instância
        const chats = await this.findChats(instanceName);
        const realChat = chats.find(c => c.remoteJid && c.remoteJid !== '0@s.whatsapp.net' && !c.remoteJid.includes('@g.us'));
        if (realChat) {
          statusJidList = [realChat.remoteJid.split('@')[0]];
        } else {
          // Fallback: Tentar buscar qualquer contato importado no banco local
          const dbContact = await prisma.contact.findFirst({
            where: { phone: { not: '' } }
          });
          if (dbContact) {
            statusJidList = [dbContact.phone.replace(/\D/g, '')];
          }
        }
      }

      // Fallback final para garantir tamanho mínimo de 1 no schema de validação
      if (statusJidList.length === 0) {
        statusJidList = ['5511999999999'];
      }

      // Payload dinâmico de acordo com as exigências da Evolution API v2 para mídias
      const payload: any = {
        type: statusType,
        backgroundColor: '#128C7E',
        font: 2,
        statusJidList,
        allContacts: !cleanPhone,
      };

      if (statusType === 'text') {
        payload.content = text;
      } else {
        payload.content = mediaUrl || '';
        payload.caption = text;
      }

      const response = await evolutionClient.post(`/message/sendStatus/${instanceName}`, payload);
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao postar status para ${instanceName}:`, error?.response?.data || error.message);
      const errMsg = error?.response?.data?.response?.message?.[0] || error?.response?.data?.message || error.message;
      throw new Error(errMsg);
    }
  },

  /**
   * Atualiza o nome do perfil do WhatsApp da instância.
   */
  async updateProfileName(instanceName: string, name: string): Promise<any> {
    try {
      const response = await evolutionClient.post(`/chat/updateProfileName/${instanceName}`, { name });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao atualizar nome do perfil para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao atualizar nome do perfil');
    }
  },

  /**
   * Atualiza o recado (status/bio) do perfil do WhatsApp da instância.
   */
  async updateProfileStatus(instanceName: string, status: string): Promise<any> {
    try {
      const response = await evolutionClient.post(`/chat/updateProfileStatus/${instanceName}`, { status });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao atualizar recado do perfil para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao atualizar recado do perfil');
    }
  },

  /**
   * Atualiza a foto do perfil do WhatsApp da instância.
   * Aceita URL pública ou string Base64 da imagem.
   */
  async updateProfilePicture(instanceName: string, picture: string): Promise<any> {
    try {
      const response = await evolutionClient.post(`/chat/updateProfilePicture/${instanceName}`, { picture });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao atualizar foto do perfil para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao atualizar foto de perfil');
    }
  },

  /**
   * Envia uma enquete nativa do WhatsApp.
   * Altíssimo engajamento — usuário consegue votar de forma fácil e natural.
   */
  async sendPollMessage(instanceName: string, phone: string, question: string, options: string[], selectableCount: number = 1): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const response = await evolutionClient.post(`/message/sendPoll/${instanceName}`, {
        number: formattedPhone,
        name: question,
        selectableCount,
        values: options,
        options: {
          delay: 1200,
          presence: 'composing',
        },
      });
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar enquete para ${phone}:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Compartilha um contato (vCard) — comportamento humano de indicar pessoas.
   */
  async sendContactCard(instanceName: string, phone: string, displayName: string, vcard: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const response = await evolutionClient.post(`/message/sendContact/${instanceName}`, {
        number: formattedPhone,
        contact: [
          {
            fullName: displayName,
            wuid: '',
            phoneNumber: vcard,
          },
        ],
        options: { delay: 800 },
      });
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar contato para ${phone}:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Envia uma localização geográfica com texto introdutório natural.
   */
  async sendLocationMessage(instanceName: string, phone: string, latitude: number, longitude: number, name: string, address: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const response = await evolutionClient.post(`/message/sendLocation/${instanceName}`, {
        number: formattedPhone,
        latitude,
        longitude,
        name,
        address,
        options: { delay: 1200 },
      });
      await registerSentMessage(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar localização para ${phone}:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Define as configurações de Proxy para uma instância do Evolution API
   */
  async setInstanceProxy(instanceName: string, proxyUrl: string | null): Promise<void> {
    try {
      if (!proxyUrl) {
        await evolutionClient.post(`/proxy/set/${instanceName}`, {
          enabled: false
        });
        return;
      }

      const parsed = parseProxyUrl(proxyUrl);
      if (!parsed) {
        throw new Error('Formato de Proxy inválido. Use o padrão http://usuario:senha@ip:porta');
      }

      await evolutionClient.post(`/proxy/set/${instanceName}`, parsed);
    } catch (error: any) {
      console.error(`Erro ao definir proxy para instância ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao definir proxy no gateway');
    }
  },

  /**
   * Reinicia a instância no Evolution API para reconectar o socket
   */
  async restartInstance(instanceName: string): Promise<any> {
    try {
      const response = await evolutionClient.post(`/instance/restart/${instanceName}`);
      return response.data;
    } catch (error: any) {
      console.warn(`Erro ao reiniciar instância ${instanceName}:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Busca todos os grupos em que a instância está participando (sem participantes — listagem rápida)
   */
  async fetchGroups(instanceName: string): Promise<any[]> {
    try {
      const response = await evolutionClient.get(`/group/fetchAllGroups/${instanceName}?getParticipants=false`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error(`Erro ao buscar grupos da instância ${instanceName}:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Busca todos os grupos com a lista de participantes incluída.
   * Pode ser lento para instâncias em muitos grupos grandes.
   */
  async fetchGroupsWithParticipants(instanceName: string): Promise<WhatsAppGroup[]> {
    try {
      const response = await evolutionClient.get<WhatsAppGroup[]>(
        `/group/fetchAllGroups/${instanceName}?getParticipants=true`
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error(`Erro ao buscar grupos com participantes para ${instanceName}:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Busca os participantes de um grupo específico pelo JID.
   * Preferir este método quando quiser membros de grupos individuais.
   */
  async fetchGroupParticipants(instanceName: string, groupJid: string): Promise<GroupParticipant[]> {
    try {
      const response = await evolutionClient.get<{ participants: GroupParticipant[] }>(
        `/group/participants/${instanceName}`,
        { params: { groupJid } }
      );
      // A Evolution API pode retornar o array diretamente ou dentro de { participants: [] }
      const data = response.data as any;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.participants)) return data.participants;
      return [];
    } catch (error: any) {
      console.error(`Erro ao buscar participantes do grupo ${groupJid}:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Busca informações de um contato (nome, foto de perfil) via Evolution API.
   * Funciona para contatos individuais (@s.whatsapp.net) e grupos (@g.us).
   */
  async fetchContactInfo(instanceName: string, phone: string): Promise<{
    name: string | null;
    pushName: string | null;
    profilePicUrl: string | null;
    about?: string | null;
    isGroup: boolean;
    groupSubject: string | null;
  }> {
    const isGroup = phone.includes('@g.us');
    try {
      if (isGroup) {
        // Para grupos, busca via endpoint de grupo
        const groupJid = phone.includes('@') ? phone : `${phone}@g.us`;
        const response = await evolutionClient.get(`/group/findGroupInfos/${instanceName}`, {
          params: { groupJid },
        });
        const data = response.data as any;
        return {
          name: data?.subject || null,
          pushName: data?.subject || null,
          profilePicUrl: data?.profilePicUrl || null,
          about: null,
          isGroup: true,
          groupSubject: data?.subject || null,
        };
      } else {
        // Para contatos individuais
        const formattedPhone = this.formatPhone(phone);
        const response = await evolutionClient.post(`/chat/fetchProfile/${instanceName}`, {
          number: formattedPhone,
        });
        const data = response.data as any;
        return {
          name: data?.name || data?.pushName || null,
          pushName: data?.pushName || data?.name || null,
          profilePicUrl: data?.picture || data?.profilePicUrl || null,
          about: data?.status || null,
          isGroup: false,
          groupSubject: null,
        };
      }
    } catch (error: any) {
      // Retorna nulo silenciosamente se não conseguir buscar o perfil
      return { name: null, pushName: null, profilePicUrl: null, about: null, isGroup, groupSubject: null };
    }
  },

  /**
   * Busca todos os chats/conversas ativos de uma instância
   */
  async findChats(instanceName: string): Promise<any[]> {
    try {
      const response = await evolutionClient.post(`/chat/findChats/${instanceName}`, {});
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error(`Erro ao buscar conversas para ${instanceName}:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Busca as mensagens de uma conversa específica pelo remoteJid
   */
  async findMessages(instanceName: string, remoteJid: string, limit: number = 50): Promise<any[]> {
    try {
      const response = await evolutionClient.post(`/chat/findMessages/${instanceName}`, {
        where: {
          key: {
            remoteJid
          }
        },
        limit
      });
      return Array.isArray(response.data) ? response.data : (response.data?.messages?.records || response.data?.records || []);
    } catch (error: any) {
      console.error(`Erro ao buscar mensagens do chat ${remoteJid} na instância ${instanceName}:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Busca a representação em base64 de um anexo de mídia de uma mensagem recebida.
   */
  async getBase64Media(
    instanceName: string,
    key: { id: string; fromMe: boolean; remoteJid: string }
  ): Promise<any> {
    try {
      const response = await evolutionClient.post(`/chat/getBase64FromMediaMessage/${instanceName}`, {
        message: {
          key
        },
        convertToMp4: false
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao obter base64 de mídia na instância ${instanceName}:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Verifica se um número de telefone está registrado no WhatsApp.
   * Utiliza o endpoint POST /chat/whatsappNumbers/{instanceName}
   */
  async checkWhatsAppNumber(instanceName: string, phone: string): Promise<{ exists: boolean; jid: string | null; name: string | null }> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const numbersToCheck = [formattedPhone];

      // Se for número brasileiro com 13 dígitos (55 + DDD + 9 dígitos), verifica também sem o 9 (12 dígitos)
      if (formattedPhone.startsWith('55') && formattedPhone.length === 13) {
        const withoutNine = formattedPhone.slice(0, 4) + formattedPhone.slice(5);
        numbersToCheck.push(withoutNine);
      } else if (formattedPhone.startsWith('55') && formattedPhone.length === 12) {
        const withNine = formattedPhone.slice(0, 4) + '9' + formattedPhone.slice(4);
        numbersToCheck.push(withNine);
      }

      const response = await evolutionClient.post(`/chat/whatsappNumbers/${instanceName}`, {
        numbers: numbersToCheck,
      });
      const data = response.data;
      const results: any[] = Array.isArray(data) ? data : (data?.numbers || []);
      const found = results.find((r: any) => r.exists === true);
      if (found) {
        return {
          exists: true,
          jid: found.jid ?? `${formattedPhone}@s.whatsapp.net`,
          name: found.name ?? null,
        };
      }
      return { exists: false, jid: null, name: null };
    } catch (error: any) {
      console.warn(`[Pre-flight] Falha técnica ao verificar WhatsApp para ${phone} via ${instanceName} (${error?.message || error}), prosseguindo com envio normal.`);
      // NUNCA cancela o envio em caso de falha de conexão ou erro transitório do gateway!
      return { exists: true, jid: null, name: null };
    }
  },

  /**
   * Verifica em lote uma lista de telefones no WhatsApp.
   * Utiliza o endpoint POST /chat/whatsappNumbers/{instanceName}
   */
  async checkWhatsAppNumbers(instanceName: string, phones: string[]): Promise<Array<{ phone: string; formattedPhone: string; exists: boolean; jid: string | null; name: string | null }>> {
    try {
      const formattedList = phones.map(p => ({ original: p, formatted: this.formatPhone(p) }));
      const numbersToSend = formattedList.map(item => item.formatted).filter(Boolean);
      
      if (numbersToSend.length === 0) return [];

      const response = await evolutionClient.post(`/chat/whatsappNumbers/${instanceName}`, {
        numbers: numbersToSend,
      });
      const data = response.data;
      const results: any[] = Array.isArray(data) ? data : (data?.numbers || []);

      return formattedList.map(item => {
        const match = results.find((r: any) => {
          const rNum = String(r.number || r.jid || '').replace(/\D/g, '');
          const myNum = item.formatted.replace(/\D/g, '');
          return rNum.includes(myNum) || myNum.includes(rNum);
        });
        return {
          phone: item.original,
          formattedPhone: item.formatted,
          exists: match?.exists === true,
          jid: match?.jid ?? (match?.exists ? `${item.formatted}@s.whatsapp.net` : null),
          name: match?.name ?? null,
        };
      });
    } catch (error: any) {
      console.error(`Erro ao verificar lote de números no WhatsApp:`, error?.response?.data || error.message);
      return phones.map(p => ({
        phone: p,
        formattedPhone: this.formatPhone(p),
        exists: false,
        jid: null,
        name: null,
      }));
    }
  },

  /**
   * Formata o número do telefone para o padrão do WhatsApp (sem caracteres especiais)
   * Garante o DDI (55 para Brasil). Retorna intacto se contiver '@'.
   */
  formatPhone(phone: string): string {
    if (phone.includes('@')) {
      return phone;
    }
    // Remove tudo o que não for número
    let cleaned = phone.replace(/\D/g, '');

    // Se já começa com 55, não precisa adicionar novamente
    if (cleaned.startsWith('55')) {
      return cleaned;
    }

    // Se não começar com 55 e tiver 10 ou 11 dígitos, assume que é Brasil e adiciona 55
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = '55' + cleaned;
    }
    
    return cleaned;
  }
};

/**
 * Função utilitária para fazer parse da URL do proxy no formato esperado pela Evolution API v2
 */
export function parseProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    const protocol = url.protocol.replace(':', '');
    const host = url.hostname;
    const port = String(url.port || '80');
    const username = url.username ? decodeURIComponent(url.username) : undefined;
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    
    return {
      enabled: true,
      host,
      port,
      protocol,
      username,
      password,
    };
  } catch (error) {
    console.error('Erro ao fazer parse da URL do proxy:', proxyUrl, error);
    return null;
  }
}
