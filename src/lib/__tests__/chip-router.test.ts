import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextWhatsAppInstance, reportChipSuccess, reportChipFailure } from '../chip-router';
import { prisma } from '../prisma';

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
  updatedAt: new Date(),
  ...overrides,
});

describe('Chip Router Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNextWhatsAppInstance', () => {
    it('deve retornar o fallback padrão se não houver instâncias saudáveis no banco', async () => {
      vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValueOnce([]);

      const result = await getNextWhatsAppInstance();
      expect(result).toBe('wajato-session');
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
        data: { dailyMsgCount: { increment: 1 }, healthScore: { increment: 1 } },
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
    it('deve rebaixar a saúde do chip em 20 pontos', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce(
        makeInstance({ name: 'chip-1', healthScore: 80 })
      );

      await reportChipFailure('chip-1', 'Erro de Timeout');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { healthScore: 60, status: 'CONNECTED' },
      });
    });

    it('deve desconectar o chip se a saúde cair para 20 ou menos', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce(
        makeInstance({ name: 'chip-1', healthScore: 35 })
      );

      await reportChipFailure('chip-1', 'Falha no envio');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { healthScore: 15, status: 'DISCONNECTED' },
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
