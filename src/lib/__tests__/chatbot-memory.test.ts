import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  splitMessageIntoNaturalParts,
  formatMemoryForPrompt,
  getContactMemory,
  saveContactMemory,
  ContactMemory,
} from '../chatbot-memory';
import { redisConnection } from '../redis';

vi.mock('../redis', () => {
  return {
    redisConnection: {
      get: vi.fn(),
      set: vi.fn(),
    },
  };
});

describe('Chatbot Memory Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('splitMessageIntoNaturalParts', () => {
    it('não divide mensagens curtas (<120 caracteres)', () => {
      const shortMsg = 'Olá! Tudo bem com você? Como posso te ajudar hoje?';
      const parts = splitMessageIntoNaturalParts(shortMsg);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toBe(shortMsg);
    });

    it('divide mensagens longas com quebra de parágrafo dupla', () => {
      const longMsg =
        'Olá Maria! Temos excelentes planos disponíveis para a sua empresa neste mês com descontos especiais.\n\nVocê gostaria que eu te enviasse a tabela completa de valores em PDF?';
      const parts = splitMessageIntoNaturalParts(longMsg);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toContain('Olá Maria!');
      expect(parts[1]).toContain('Você gostaria');
    });

    it('divide mensagens longas com pontuação natural no meio', () => {
      const longMsg =
        'Perfeito, nosso plano profissional inclui disparos ilimitados e aquecimento automático de chips. Posso gerar o seu link de teste gratuito de 3 dias agora mesmo se desejar.';
      const parts = splitMessageIntoNaturalParts(longMsg);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe(
        'Perfeito, nosso plano profissional inclui disparos ilimitados e aquecimento automático de chips.'
      );
      expect(parts[1]).toBe(
        'Posso gerar o seu link de teste gratuito de 3 dias agora mesmo se desejar.'
      );
    });
  });

  describe('formatMemoryForPrompt', () => {
    it('retorna string vazia quando a memória é nula ou vazia', () => {
      expect(formatMemoryForPrompt(null)).toBe('');
      expect(formatMemoryForPrompt({})).toBe('');
    });

    it('formata adequadamente todos os campos da memória de contato', () => {
      const memory: ContactMemory = {
        name: 'Carlos Oliveira',
        interests: ['Plano VIP', 'Aquecimento de chips'],
        keyFacts: ['Empresa de logística', 'Prefere pagar via PIX'],
        lastTopic: 'Preços de renovação',
        summaryHistory: 'Cliente perguntou sobre valores no início da semana.',
      };

      const formatted = formatMemoryForPrompt(memory);
      expect(formatted).toContain('Carlos Oliveira');
      expect(formatted).toContain('Plano VIP');
      expect(formatted).toContain('Empresa de logística');
      expect(formatted).toContain('Preços de renovação');
      expect(formatted).toContain('Cliente perguntou sobre valores');
    });
  });

  describe('Redis persistence', () => {
    it('busca e faz parse da memória salva no Redis', async () => {
      const mockMemory: ContactMemory = {
        name: 'Ana',
        interests: ['Suporte'],
      };
      vi.mocked(redisConnection.get).mockResolvedValueOnce(JSON.stringify(mockMemory));

      const res = await getContactMemory('+55 (11) 98888-7777');
      expect(redisConnection.get).toHaveBeenCalledWith('chatbot:memory:5511988887777');
      expect(res).toEqual(mockMemory);
    });

    it('salva memória com TTL de 30 dias no Redis', async () => {
      const mockMemory: ContactMemory = {
        name: 'Lucas',
        interests: ['Vendas'],
      };
      await saveContactMemory('5511977776666', mockMemory);

      expect(redisConnection.set).toHaveBeenCalledWith(
        'chatbot:memory:5511977776666',
        JSON.stringify(mockMemory),
        'EX',
        2592000
      );
    });
  });
});
