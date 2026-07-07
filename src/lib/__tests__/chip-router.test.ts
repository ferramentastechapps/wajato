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

describe('Chip Router Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNextWhatsAppInstance', () => {
    it('deve retornar o fallback padrão se não houver instâncias saudáveis no banco', async () => {
      vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValueOnce([]);

      const result = await getNextWhatsAppInstance();
      expect(result).toBe('wajato-session'); // process.env.EVOLUTION_INSTANCE_NAME ou fallback padrão
      expect(prisma.whatsAppInstance.findMany).toHaveBeenCalledTimes(1);
    });

    it('deve priorizar a instância com menor dailyMsgCount e maior healthScore', async () => {
      const mockInstances = [
        { name: 'chip-1', status: 'CONNECTED', dailyMsgCount: 10, healthScore: 90 },
        { name: 'chip-2', status: 'CONNECTED', dailyMsgCount: 5, healthScore: 80 },
        { name: 'chip-3', status: 'CONNECTED', dailyMsgCount: 5, healthScore: 95 },
      ];
      
      // O Prisma já ordena, então simulamos que ele retorna a primeira de acordo com a ordenação
      vi.mocked(prisma.whatsAppInstance.findMany).mockResolvedValueOnce([
        mockInstances[2], // menor msg count, maior health
        mockInstances[1], // menor msg count, menor health
        mockInstances[0], // maior msg count
      ]);

      const result = await getNextWhatsAppInstance();
      expect(result).toBe('chip-3');
    });
  });

  describe('reportChipSuccess', () => {
    it('deve incrementar o dailyMsgCount e healthScore', async () => {
      vi.mocked(prisma.whatsAppInstance.updateMany).mockResolvedValueOnce({ count: 1 } as any);
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce({
        id: '1',
        name: 'chip-1',
        status: 'CONNECTED',
        phone: '123',
        qrCode: null,
        profileName: null,
        profilePicUrl: null,
        dailyMsgCount: 1,
        healthScore: 95,
        updatedAt: new Date(),
      });

      await reportChipSuccess('chip-1');

      expect(prisma.whatsAppInstance.updateMany).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: {
          dailyMsgCount: { increment: 1 },
          healthScore: { increment: 1 },
        },
      });
    });

    it('deve limitar o healthScore a no máximo 100', async () => {
      vi.mocked(prisma.whatsAppInstance.updateMany).mockResolvedValueOnce({ count: 1 } as any);
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce({
        id: '1',
        name: 'chip-1',
        status: 'CONNECTED',
        phone: '123',
        qrCode: null,
        profileName: null,
        profilePicUrl: null,
        dailyMsgCount: 1,
        healthScore: 101, // Passou de 100
        updatedAt: new Date(),
      });

      await reportChipSuccess('chip-1');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: { healthScore: 100 },
      });
    });
  });

  describe('reportChipFailure', () => {
    it('deve rebaixar a saúde do chip em 20 pontos', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce({
        id: '1',
        name: 'chip-1',
        status: 'CONNECTED',
        phone: '123',
        qrCode: null,
        profileName: null,
        profilePicUrl: null,
        dailyMsgCount: 10,
        healthScore: 80,
        updatedAt: new Date(),
      });

      await reportChipFailure('chip-1', 'Erro de Timeout');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: {
          healthScore: 60, // 80 - 20
          status: 'CONNECTED', // Mantém conectado por estar > 20
        },
      });
    });

    it('deve desconectar o chip se a saúde cair para 20 ou menos', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce({
        id: '1',
        name: 'chip-1',
        status: 'CONNECTED',
        phone: '123',
        qrCode: null,
        profileName: null,
        profilePicUrl: null,
        dailyMsgCount: 10,
        healthScore: 35, // -20 vai dar 15 (<= 20)
        updatedAt: new Date(),
      });

      await reportChipFailure('chip-1', 'Falha no envio');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: {
          healthScore: 15,
          status: 'DISCONNECTED', // Desconecta
        },
      });
    });

    it('deve desconectar o chip imediatamente se o erro contiver termos de desconexão', async () => {
      vi.mocked(prisma.whatsAppInstance.findUnique).mockResolvedValueOnce({
        id: '1',
        name: 'chip-1',
        status: 'CONNECTED',
        phone: '123',
        qrCode: null,
        profileName: null,
        profilePicUrl: null,
        dailyMsgCount: 10,
        healthScore: 90, // Saúde ficaria 70
        updatedAt: new Date(),
      });

      await reportChipFailure('chip-1', 'Instance disconnected or token expired');

      expect(prisma.whatsAppInstance.update).toHaveBeenCalledWith({
        where: { name: 'chip-1' },
        data: {
          healthScore: 70,
          status: 'DISCONNECTED', // Força desconexão devido ao termo
        },
      });
    });
  });
});
