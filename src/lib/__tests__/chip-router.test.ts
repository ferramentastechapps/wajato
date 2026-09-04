import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextWhatsAppInstance, reportChipSuccess, reportChipFailure, generateDailyLimitWithJitter } from '../chip-router';
import { prisma } from '../prisma';

vi.mock('../redis', () => {
  return {
    redisConnection: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    },
  };
});

// Mock do prisma
vi.mock('../prisma', () => {
  return {
    prisma: {
      whatsAppInstance: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
});

// Helper para criar fixture de instância completa (com todos campos do schema atual)
const makeInstance = (overrides: Partial<any> = {}) => ({
  id: '1',
  name: 'chip-1',
  status: 'CONNECTED',
  phone: '123',
  qrCode: null,
  profileName: null,
  profilePicUrl: null,
  proxy: null,       // campo adicionado no schema (fase 1)
  dailyMsgCount: 0,
  healthScore: 100,
  unrepliedMsgCount: 0,
  maxUnrepliedLimit: 20,
  unrepliedBlockEnabled: true,
  allowCampaigns: true, // campo adicionado para controle de disparo
  updatedAt: new Date(),
  ...overrides,
});

describe('Chip Router Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNextWhatsAppInstance', () => {
    it('deve lançar erro se não houver chips habilitados para disparo', async () => {
      vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValueOnce([]);

      await expect(getNextWhatsAppInstance()).rejects.toThrow();
      expect(prisma.whatsAppInstance.findMany).toHaveBeenCalledTimes(1);
    });

    it('deve priorizar a instância com menor dailyMsgCount e maior healthScore', async () => {
      const mockInstances = [
        makeInstance({ name: 'chip-1', dailyMsgCount: 10, healthScore: 90 }),
        makeInstance({ name: 'chip-2', dailyMsgCount: 5, healthScore: 80 }),
        makeInstance({ name: 'chip-3', dailyMsgCount: 5, healthScore: 95 }),
      ];

      vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValueOnce([
        mockInstances[2], // menor msg count, maior health → selecionada
        mockInstances[1],
        mockInstances[0],
      ]);

      const result = await getNextWhatsAppInstance();
      expect(result).toBe('chip-3');
    });

    it('deve ignorar chip se ele atingir o limite de mensagens sem resposta com protecao ativada', async () => {
      const mockInstances = [
        // Chip-1 atingiu o limite (20/20) com proteção ativada -> deve ser ignorado
        makeInstance({ name: 'chip-1', dailyMsgCount: 2, healthScore: 90, unrepliedMsgCount: 20, maxUnrepliedLimit: 20, unrepliedBlockEnabled: true }),
        // Chip-2 tem envios sem resposta mas proteção está desativada -> deve ser aceito
        makeInstance({ name: 'chip-2', dailyMsgCount: 5, healthScore: 80, unrepliedMsgCount: 25, maxUnrepliedLimit: 20, unrepliedBlockEnabled: false }),
      ];

      vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValueOnce([
        mockInstances[0],
        mockInstances[1],
      ]);

      const result = await getNextWhatsAppInstance();
      // Deve pular o chip-1 e selecionar o chip-2
      expect(result).toBe('chip-2');
    });

    it('deve respeitar o limite dinâmico (dailyLimitToday) de cada chip com jitter', async () => {
      const mockInstances = [
        // Chip-1 atingiu o teto sorteado de hoje (194 msgs)
        makeInstance({ name: 'chip-1', dailyMsgCount: 195, dailyLimitToday: 194, healthScore: 95 }),
        // Chip-2 ainda tem margem (180 de 198 msgs)
        makeInstance({ name: 'chip-2', dailyMsgCount: 180, dailyLimitToday: 198, healthScore: 85 }),
      ];

      vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValueOnce([
        mockInstances[0],
        mockInstances[1],
      ]);

      const result = await getNextWhatsAppInstance();
      expect(result).toBe('chip-2');
    });
  });

  describe('generateDailyLimitWithJitter', () => {
    it('deve gerar limites com jitter na faixa de 190 a 210 para base 200', () => {
      for (let i = 0; i < 50; i++) {
        const val = generateDailyLimitWithJitter(200);
        expect(val).toBeGreaterThanOrEqual(190);
        expect(val).toBeLessThanOrEqual(210);
      }
    });

    it('deve permitir aumentar a capacidade base para 250 (faixa 240 a 260) ou 300 (faixa 290 a 310)', () => {
      for (let i = 0; i < 20; i++) {
        const val250 = generateDailyLimitWithJitter(250);
        expect(val250).toBeGreaterThanOrEqual(240);
        expect(val250).toBeLessThanOrEqual(260);

        const val300 = generateDailyLimitWithJitter(300);
        expect(val300).toBeGreaterThanOrEqual(290);
        expect(val300).toBeLessThanOrEqual(310);
      }
    });
  });

  describe('reportChipSuccess', () => {
    it('deve incrementar o dailyMsgCount e healthScore', async () => {
      vi.mocked(prisma.whatsAppInstance.updateMany).mockResolvedValueOnce({ count: 1 } as any);
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce(
        makeInstance({ name: 'chip-1', dailyMsgCount: 1, healthScore: 95 })
      );

      await reportChipSuccess('chip-1');

      expect(prisma.whatsAppInstance.updateMany).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { 
          dailyMsgCount: { increment: 1 }, 
          healthScore: { increment: 1 },
          unrepliedMsgCount: { increment: 1 },
        },
      });
    });


    it('deve limitar o healthScore a no máximo 100', async () => {
      vi.mocked(prisma.whatsAppInstance.updateMany).mockResolvedValueOnce({ count: 1 } as any);
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce(
        makeInstance({ name: 'chip-1', dailyMsgCount: 1, healthScore: 101 })
      );

      await reportChipSuccess('chip-1');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { healthScore: 100 },
      });
    });
  });

  describe('reportChipFailure', () => {
    it('deve rebaixar a saúde do chip em 4 pontos para erro genérico (timeout)', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce(
        makeInstance({ name: 'chip-1', healthScore: 80 })
      );

      await reportChipFailure('chip-1', 'Erro de Timeout');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { healthScore: 76, status: 'CONNECTED' },
      });
    });

    it('deve desconectar o chip se a saúde zerar devido a erros genéricos repetidos', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce(
        makeInstance({ name: 'chip-1', healthScore: 3 })
      );

      await reportChipFailure('chip-1', 'Falha no envio');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { healthScore: 0, status: 'DISCONNECTED' },
      });
    });

    it('deve desconectar o chip imediatamente se o erro contiver termos de desconexão', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce(
        makeInstance({ name: 'chip-1', healthScore: 90 })
      );

      await reportChipFailure('chip-1', 'Instance disconnected or token expired');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { healthScore: 70, status: 'DISCONNECTED' },
      });
    });
  });
});
