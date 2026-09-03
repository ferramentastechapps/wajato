import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatbotIncoming } from '../chatbot-processor';
import { prisma } from '../prisma';
import { evolutionApi } from '../evolution';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock do redis
vi.mock('../redis', () => {
  return {
    redisConnection: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    },
  };
});

// Mock do prisma
vi.mock('../prisma', () => {
  return {
    prisma: {
      contact: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      company: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      messageLog: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
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
      sendTextMessage: vi.fn().mockResolvedValue({}),
      sendMediaMessage: vi.fn().mockResolvedValue({}),
      findMessages: vi.fn().mockResolvedValue([]),
    },
  };
});

// Mock do schedule de horário comercial
vi.mock('../warmup-schedule', () => {
  return {
    isWithinBusinessHours: vi.fn().mockReturnValue(true),
  };
});

// Mock do Google Generative AI (Gemini)
const mockGenerateContent = vi.fn().mockResolvedValue({
  response: {
    text: () => 'Olá! Nosso plano Pro custa R$ 199/mês e aceitamos PIX com 5% de desconto.',
  },
});

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
      return {
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      };
    }),
  };
});

describe('Company Knowledge Base & Chatbot Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  it('deve injetar informações completas da empresa associada ao contato no prompt da IA', async () => {
    // 1. Config do chatbot com IA ativada
    vi.mocked(prisma.chatbotConfig.findUnique).mockResolvedValueOnce({
      id: 'global',
      aiEnabled: true,
      aiContext: 'Você é um vendedor humano da nossa equipe.',
      geminiApiKey: null,
      businessHoursOnly: false,
      startHour: 8,
      endHour: 18,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Contato vinculado a uma empresa específica
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({
      id: 'contact-1',
      name: 'Maria Souza',
      phone: '5511988887777',
      tags: [],
      groupId: null,
      stageId: null,
      companyId: 'company-acme',
      chatbotPausedUntil: null,
      optOut: false,
      optOutAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Base de conhecimento da empresa
    const mockCompany = {
      id: 'company-acme',
      name: 'Acme Calçados e Esportes',
      segment: 'Moda Esportiva',
      description: 'Lojas de calçados premium há mais de 15 anos no mercado.',
      productsServices: '- Tênis Velocity Pro: R$ 299,00\n- Meia DryFit: R$ 29,90',
      faq: 'P: Entrega no mesmo dia?\nR: Sim, para a capital.',
      policies: 'PIX com 5% OFF. Cartão em 10x sem juros.',
      contactInfo: 'WhatsApp de Suporte Humano: (11) 97777-6666\nSite: https://acme.com.br',
      toneOfVoice: 'Descontraído, esportivo e muito ágil',
      aiInstructions: 'Sempre destaque que o Tênis Velocity Pro tem amortecimento em gel.',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.company.findUnique).mockResolvedValueOnce(mockCompany);
    vi.mocked(prisma.chatbotRule.findMany).mockResolvedValueOnce([]); // Sem regras manuais para ir para IA

    await handleChatbotIncoming('5511988887777', 'Qual o preço do Tênis Velocity e formas de pagamento?', 'instance-1');

    expect(prisma.company.findUnique).toHaveBeenCalledWith({
      where: { id: 'company-acme' },
    });

    expect(mockGenerateContent).toHaveBeenCalled();
    const promptSent = mockGenerateContent.mock.calls[0][0] as string;

    // Verifica se a base de conhecimento oficial foi injetada no prompt
    expect(promptSent).toContain('Acme Calçados e Esportes');
    expect(promptSent).toContain('Tênis Velocity Pro: R$ 299,00');
    expect(promptSent).toContain('PIX com 5% OFF');
    expect(promptSent).toContain('P: Entrega no mesmo dia?');
    expect(promptSent).toContain('https://acme.com.br');
    expect(promptSent).toContain('Descontraído, esportivo e muito ágil');
  });

  it('deve usar a empresa padrão como fallback quando o contato não tiver companyId definido', async () => {
    vi.mocked(prisma.chatbotConfig.findUnique).mockResolvedValueOnce({
      id: 'global',
      aiEnabled: true,
      aiContext: 'Você é um assistente virtual prestativo.',
      geminiApiKey: null,
      businessHoursOnly: false,
      startHour: 8,
      endHour: 18,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Contato sem companyId
    vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({
      id: 'contact-2',
      name: 'Carlos',
      phone: '5511977776666',
      tags: [],
      groupId: null,
      stageId: null,
      companyId: null,
      chatbotPausedUntil: null,
      optOut: false,
      optOutAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Nenhuma campanha anterior com empresa
    vi.mocked(prisma.messageLog.findFirst).mockResolvedValueOnce(null);

    // Empresa padrão de fallback
    const defaultCompany = {
      id: 'company-default',
      name: 'WaJato Matriz',
      segment: 'Tecnologia',
      description: 'Plataforma líder em automação de WhatsApp.',
      productsServices: 'Plano Anual: R$ 997,00',
      faq: null,
      policies: 'Aceitamos PIX e Cartão.',
      contactInfo: 'contato@wajato.com.br',
      toneOfVoice: 'Profissional e acolhedor',
      aiInstructions: null,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.company.findFirst).mockResolvedValueOnce(defaultCompany);
    vi.mocked(prisma.chatbotRule.findMany).mockResolvedValueOnce([]);

    await handleChatbotIncoming('5511977776666', 'Olá, quais planos vocês têm?', 'instance-1');

    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: { isDefault: true },
    });

    const promptSent = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptSent).toContain('WaJato Matriz');
    expect(promptSent).toContain('Plano Anual: R$ 997,00');
  });
});
