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
   * Formata o número do telefone para o padrão do WhatsApp (sem caracteres especiais)
   * Garante o DDI (55 para Brasil)
   */
  formatPhone(phone: string): string {
    // Remove tudo o que não for número
    let cleaned = phone.replace(/\D/g, '');

    // Se não começar com 55 e tiver 10 ou 11 dígitos, assume que é Brasil e adiciona 55
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = '55' + cleaned;
    }
    
    // Corrige nono dígito em números de celular brasileiros se necessário
    // WhatsApp costuma usar o formato original (com ou sem o 9 dependendo de quando foi criado)
    // O recomendável é manter o número conforme fornecido, apenas garantindo o DDI 55
    return cleaned;
  }
};
