import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

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
  hash: {
    apikey: string;
  };
  qrcode?: {
    base64?: string;
  };
}

export interface ConnectionStateResponse {
  instance: {
    instanceName: string;
    state: 'open' | 'connecting' | 'close';
  };
}

export const evolutionApi = {
  /**
   * Cria uma nova instância de conexão no Evolution API
   */
  async createInstance(instanceName: string): Promise<CreateInstanceResponse> {
    try {
      const response = await evolutionClient.post<CreateInstanceResponse>('/instance/create', {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao criar instância ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao criar instância no Evolution API');
    }
  },

  /**
   * Busca a lista de todas as instâncias no Evolution API
   */
  async fetchInstances(): Promise<any[]> {
    try {
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
    try {
      const response = await evolutionClient.get(`/instance/connect/${instanceName}`);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao buscar QR Code para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao obter QR Code');
    }
  },

  /**
   * Obtém o código de pareamento (Pairing Code) para a instância e telefone
   */
  async getPairingCode(instanceName: string, phone: string): Promise<{ code: string }> {
    try {
      const formattedPhone = this.formatPhone(phone);
      // Na Evolution API v2, o endpoint de conexão com a query ?number retorna o pairingCode no JSON
      const response = await evolutionClient.get(`/instance/connect/${instanceName}`, {
        params: { number: formattedPhone },
      });
      const pairingCode = response.data?.pairingCode;
      if (!pairingCode) {
        throw new Error('Evolution API não retornou o pairingCode no formato esperado.');
      }
      return { code: pairingCode };
    } catch (error: any) {
      console.error(`Erro ao buscar Pairing Code para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao obter código de pareamento');
    }
  },

  /**
   * Desconecta o WhatsApp da instância
   */
  async logoutInstance(instanceName: string): Promise<void> {
    try {
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
    try {
      const response = await evolutionClient.get<ConnectionStateResponse>(`/instance/connectionState/${instanceName}`);
      const state = response.data?.instance?.state;
      
      if (state === 'open') return 'CONNECTED';
      if (state === 'connecting') return 'INITIALIZING';
      return 'DISCONNECTED';
    } catch (error: any) {
      // Se der erro 404 ou similar, significa que a instância não existe
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
  async sendTextMessage(instanceName: string, phone: string, text: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const response = await evolutionClient.post(`/message/sendText/${instanceName}`, {
        number: formattedPhone,
        text: text,
        options: {
          delay: 1200,
          presence: 'composing',
        },
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar mensagem de texto para ${phone}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao enviar mensagem de texto');
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
    try {
      const formattedPhone = this.formatPhone(phone);
      
      // Determina o nome do arquivo padrão com base no tipo
      let fileName = 'file';
      if (mediaType === 'image') fileName = 'image.jpg';
      else if (mediaType === 'video') fileName = 'video.mp4';
      else if (mediaType === 'audio') fileName = 'audio.mp3';
      else if (mediaType === 'document') fileName = 'document.pdf';

      const response = await evolutionClient.post(`/message/sendMedia/${instanceName}`, {
        number: formattedPhone,
        mediaMessage: {
          mediatype: mediaType,
          media: mediaUrl,
          caption: caption || '',
          fileName: fileName
        }
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar mensagem de mídia para ${phone}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao enviar mídia');
    }
  },

  /**
   * Configura o Webhook na instância do Evolution API para escutar status
   */
  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    try {
      await evolutionClient.post(`/webhook/set/${instanceName}`, {
        enabled: true,
        url: webhookUrl,
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
      });
    } catch (error: any) {
      console.error(`Erro ao configurar webhook para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao configurar webhook');
    }
  },

  /**
   * Envia uma reação (emoji) a uma mensagem específica
   */
  async sendReaction(instanceName: string, phone: string, messageId: string, reaction: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
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
    try {
      const formattedPhone = this.formatPhone(phone);
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
   * Envia um áudio via URL (formato .ogg PTT - Push to Talk)
   * Simula nota de voz para máxima humanização
   */
  async sendAudioUrl(instanceName: string, phone: string, audioUrl: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const response = await evolutionClient.post(`/message/sendMedia/${instanceName}`, {
        number: formattedPhone,
        mediaMessage: {
          mediatype: 'audio',
          media: audioUrl,
          mimetype: 'audio/ogg; codecs=opus',
        },
        options: {
          presence: 'recording', // Simula "gravando áudio"
          delay: 2000,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar áudio para ${phone}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao enviar áudio');
    }
  },

  /**
  /**
   * Envia um sticker via URL (.webp)
   */
  async sendSticker(instanceName: string, phone: string, stickerUrl: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const response = await evolutionClient.post(`/message/sendSticker/${instanceName}`, {
        number: formattedPhone,
        stickerMessage: {
          image: stickerUrl,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar sticker para ${phone}:`, error?.response?.data || error.message);
      // Stickers não são críticos, não lança exceção
      return null;
    }
  },

  /**
   * Posta um Story/Status de texto ou imagem
   */
  async sendStatusUpdate(instanceName: string, text: string, statusType: 'text' | 'image' = 'text', mediaUrl?: string): Promise<any> {
    try {
      const response = await evolutionClient.post(`/message/sendStory/${instanceName}`, {
        storyMessage: {
          type: statusType,
          text: text,
          media: mediaUrl || '',
          backgroundColor: '#0f172a',
          font: 3
        }
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao postar status para ${instanceName}:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Envia uma localização geográfica
   */
  async sendLocationMessage(instanceName: string, phone: string, latitude: number, longitude: number, name: string, address: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhone(phone);
      const response = await evolutionClient.post(`/message/sendLocation/${instanceName}`, {
        number: formattedPhone,
        locationMessage: {
          latitude,
          longitude,
          name,
          address
        }
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar localização para ${phone}:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Define as configurações de Proxy para uma instância do Evolution API
   */
  async setInstanceProxy(instanceName: string, proxyUrl: string | null): Promise<any> {
    try {
      const response = await evolutionClient.post(`/instance/setProxy/${instanceName}`, {
        proxy: proxyUrl || ''
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao configurar proxy para ${instanceName}:`, error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Falha ao configurar proxy');
    }
  },

  /**
   * Busca todos os grupos em que a instância está participando
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
   * Formata o número do telefone para o padrão do WhatsApp (sem caracteres especiais)
   * Garante o DDI (55 para Brasil). Retorna intacto se contiver '@'.
   */
  formatPhone(phone: string): string {
    if (phone.includes('@')) {
      return phone;
    }
    // Remove tudo o que não for número
    let cleaned = phone.replace(/\D/g, '');

    // Se não começar com 55 e tiver 10 ou 11 dígitos, assume que é Brasil e adiciona 55
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = '55' + cleaned;
    }
    
    return cleaned;
  },

  /**
   * Configura o proxy de uma instância no Evolution API
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
    const port = parseInt(url.port);
    const username = url.username ? decodeURIComponent(url.username) : undefined;
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    
    return {
      enabled: true,
      proxy: {
        host,
        port,
        protocol,
        username,
        password
      }
    };
  } catch (error) {
    console.error('Erro ao fazer parse da URL do proxy:', proxyUrl, error);
    return null;
  }
}
