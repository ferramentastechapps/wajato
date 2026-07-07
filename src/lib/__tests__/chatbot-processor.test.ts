import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatbotIncoming } from '../chatbot-processor';
import { prisma } from '../prisma';
import { evolutionApi } from '../evolution';
import { isWithinBusinessHours } from '../warmup-schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock do prisma
vi.mock('../prisma', () => {
  return {
    prisma: {
      chatbotConfig: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      chatbotRule: {
        findMany: vi.fn(),
      },
      chatbotLog: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

// Mock da Evolution API
vi.mock('../evolution', () => {
  return {
    evolutionApi: {
      sendTextMessage: vi.fn(),
      sendMediaMessage: vi.fn(),
    },
  };
});

// Mock do schedule de horário comercial
vi.mock('../warmup-schedule', () => {
  return {
    isWithinBusinessHours: vi.fn(),
  };
});

// Mock do Google Generative AI (Gemini)
vi.mock('@google/generative-ai', () => {
  const generateContentMock = vi.fn().mockResolvedValue({
    response: {
      text: () => 'Olá, sou a IA!',
    },
  });
  const getGenerativeModelMock = vi.fn().mockReturnValue({
    generateContent: generateContentMock,
  });

  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
      return {
        getGenerativeModel: getGenerativeModelMock,
      };
    }),
  };
});

describe('Chatbot Processor Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve ignorar mensagem se estiver fora do horário comercial', async () => {
    // Configura horário comercial habilitado e simula estar fora dele (retorna false)
    vi.mocked(prisma.chatbotConfig.findUnique).mockResolvedValueOnce({
      id: 'global',
      aiEnabled: false,
      aiContext: '',
      businessHoursOnly: true,
      startHour: 8,
      endHour: 18,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(isWithinBusinessHours).mockReturnValueOnce(false);

    await handleChatbotIncoming('5511999999999', 'Olá', 'instancia-teste');

    expect(isWithinBusinessHours).toHaveBeenCalledWith(8, 18);
    expect(prisma.chatbotRule.findMany).not.toHaveBeenCalled();
    expect(evolutionApi.sendTextMessage).not.toHaveBeenCalled();
  });

  it('deve responder e logar baseado em uma regra EXACT de palavra-chave', async () => {
    vi.mocked(prisma.chatbotConfig.findUnique).mockResolvedValueOnce({
      id: 'global',
      aiEnabled: false,
      aiContext: '',
      businessHoursOnly: false,
      startHour: 8,
      endHour: 18,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Regra cadastrada para "ajuda"
    vi.mocked(prisma.chatbotRule.findMany).mockResolvedValueOnce([
      {
        id: 'rule-1',
        trigger: 'ajuda',
        matchType: 'EXACT',
        response: 'Como posso te ajudar?',
        imageUrl: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await handleChatbotIncoming('5511999999999', 'ajuda', 'instancia-teste');

    expect(evolutionApi.sendTextMessage).toHaveBeenCalledWith('instancia-teste', '5511999999999', 'Como posso te ajudar?');
    expect(prisma.chatbotLog.create).toHaveBeenCalledWith({
      data: {
        phone: '5511999999999',
        messageIn: 'ajuda',
        messageOut: 'Como posso te ajudar?',
        source: 'RULE',
      },
    });
  });

  it('deve responder e logar baseado em uma regra CONTAINS de palavra-chave', async () => {
    vi.mocked(prisma.chatbotConfig.findUnique).mockResolvedValueOnce({
      id: 'global',
      aiEnabled: false,
      aiContext: '',
      businessHoursOnly: false,
      startHour: 8,
      endHour: 18,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.chatbotRule.findMany).mockResolvedValueOnce([
      {
        id: 'rule-2',
        trigger: 'preço',
        matchType: 'CONTAINS',
        response: 'Nossos planos começam em R$99.',
        imageUrl: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await handleChatbotIncoming('5511999999999', 'Qual o preço dos planos?', 'instancia-teste');

    expect(evolutionApi.sendTextMessage).toHaveBeenCalledWith('instancia-teste', '5511999999999', 'Nossos planos começam em R$99.');
  });

  it('deve acionar IA Gemini se nenhuma regra bater e IA estiver ativada', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    vi.mocked(prisma.chatbotConfig.findUnique).mockResolvedValueOnce({
      id: 'global',
      aiEnabled: true,
      aiContext: 'Você é um vendedor.',
      businessHoursOnly: false,
      startHour: 8,
      endHour: 18,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Nenhuma regra cadastrada
    vi.mocked(prisma.chatbotRule.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.chatbotLog.findMany).mockResolvedValueOnce([]); // sem histórico anterior

    await handleChatbotIncoming('5511999999999', 'Olá, tudo bem?', 'instancia-teste');

    expect(GoogleGenerativeAI).toHaveBeenCalled();
    expect(evolutionApi.sendTextMessage).toHaveBeenCalledWith('instancia-teste', '5511999999999', 'Olá, sou a IA!');
    expect(prisma.chatbotLog.create).toHaveBeenCalledWith({
      data: {
        phone: '5511999999999',
        messageIn: 'Olá, tudo bem?',
        messageOut: 'Olá, sou a IA!',
        source: 'AI',
      },
    });
  });

  it('deve priorizar a chave de API individual do banco de dados (geminiApiKey) em relação à do servidor', async () => {
    // Configura chave do servidor e chave individual
    process.env.GEMINI_API_KEY = 'global-server-key';

    vi.mocked(prisma.chatbotConfig.findUnique).mockResolvedValueOnce({
      id: 'global',
      aiEnabled: true,
      aiContext: 'Você é um assistente.',
      geminiApiKey: 'individual-client-key',
      businessHoursOnly: false,
      startHour: 8,
      endHour: 18,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.chatbotRule.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.chatbotLog.findMany).mockResolvedValueOnce([]);

    await handleChatbotIncoming('5511999999999', 'Olá', 'instancia-teste');

    // Verifica se instanciou o GoogleGenerativeAI com a chave individual do banco
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('individual-client-key');
    expect(evolutionApi.sendTextMessage).toHaveBeenCalledWith('instancia-teste', '5511999999999', 'Olá, sou a IA!');
  });
});
