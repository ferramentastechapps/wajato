/**
 * warmup-rate-limiter.test.ts
 * Testes unitários para o rate limiter de instâncias com janela deslizante Redis.
 *
 * Testa a lógica crítica: a janela deslizante REAL (Sorted Set) vs. contador fixo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// O vi.mock é hoistado ao topo — o objeto de mock deve estar dentro do factory
// para evitar "Cannot access before initialization"
vi.mock('../redis', () => ({
  redisConnection: {
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    zadd: vi.fn(),
    zremrangebyscore: vi.fn(),
    zcard: vi.fn(),
  },
}));

import {
  acquireInstanceSlot,
  releaseInstanceSlot,
  recordInstanceMessage,
  getInstanceDailyCount,
  isInstanceWithinHourlyLimit,
  recordInstanceHourlyMessage,
  getInstanceHourlyCount,
} from '../warmup-rate-limiter';
import { redisConnection } from '../redis';

// Alias tipado para facilitar o uso dos mocks
const redisMock = (redisConnection as unknown) as Record<string, ReturnType<typeof vi.fn>>;

describe('warmup-rate-limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── acquireInstanceSlot ───────────────────────────────────────────────────
  describe('acquireInstanceSlot', () => {
    it('deve retornar true quando o slot é adquirido com sucesso (SET NX retorna OK)', async () => {
      redisMock.set.mockResolvedValueOnce('OK');
      const result = await acquireInstanceSlot('chip-test');
      expect(result).toBe(true);
      expect(redisMock.set).toHaveBeenCalledWith(
        'warmup:instance:lock:chip-test',
        '1', 'EX', 120, 'NX'
      );
    });

    it('deve retornar false quando a instância já está bloqueada (SET NX retorna null)', async () => {
      redisMock.set.mockResolvedValueOnce(null);
      const result = await acquireInstanceSlot('chip-test');
      expect(result).toBe(false);
    });
  });

  // ─── releaseInstanceSlot ──────────────────────────────────────────────────
  describe('releaseInstanceSlot', () => {
    it('deve deletar a chave de lock da instância', async () => {
      redisMock.del.mockResolvedValueOnce(1);
      await releaseInstanceSlot('chip-test');
      expect(redisMock.del).toHaveBeenCalledWith('warmup:instance:lock:chip-test');
    });
  });

  // ─── recordInstanceMessage (contador diário) ──────────────────────────────
  describe('recordInstanceMessage', () => {
    it('deve incrementar o contador diário e configurar TTL no primeiro registro', async () => {
      redisMock.incr.mockResolvedValueOnce(1); // Primeira mensagem
      redisMock.expire.mockResolvedValueOnce(1);

      const count = await recordInstanceMessage('chip-test');

      expect(count).toBe(1);
      expect(redisMock.incr).toHaveBeenCalled();
      // TTL de 25 horas para limpeza automática
      expect(redisMock.expire).toHaveBeenCalledWith(expect.stringContaining('daily:chip-test'), 90000);
    });

    it('NÃO deve configurar TTL em registros subsequentes (só no primeiro)', async () => {
      redisMock.incr.mockResolvedValueOnce(5); // 5ª mensagem
      redisMock.expire.mockResolvedValueOnce(1);

      await recordInstanceMessage('chip-test');

      expect(redisMock.expire).not.toHaveBeenCalled();
    });
  });

  // ─── getInstanceDailyCount ────────────────────────────────────────────────
  describe('getInstanceDailyCount', () => {
    it('deve retornar o count atual do Redis', async () => {
      redisMock.get.mockResolvedValueOnce('42');
      const count = await getInstanceDailyCount('chip-test');
      expect(count).toBe(42);
    });

    it('deve retornar 0 se a chave não existir', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      const count = await getInstanceDailyCount('chip-test');
      expect(count).toBe(0);
    });
  });

  // ─── isInstanceWithinHourlyLimit (Sliding Window) ─────────────────────────
  describe('isInstanceWithinHourlyLimit', () => {
    it('deve retornar true se a instância estiver abaixo do limite (< 60 msgs/h)', async () => {
      redisMock.zremrangebyscore.mockResolvedValueOnce(0);
      redisMock.zcard.mockResolvedValueOnce(30); // Apenas 30 msgs na janela

      const result = await isInstanceWithinHourlyLimit('chip-test');

      expect(result).toBe(true);
      expect(redisMock.zremrangebyscore).toHaveBeenCalledWith(
        'warmup:instance:sliding:chip-test',
        '-inf',
        expect.any(Number)
      );
    });

    it('deve retornar false se a instância atingiu o limite (>= 60 msgs/h)', async () => {
      redisMock.zremrangebyscore.mockResolvedValueOnce(0);
      redisMock.zcard.mockResolvedValueOnce(60); // Limite exato atingido

      const result = await isInstanceWithinHourlyLimit('chip-test');

      expect(result).toBe(false);
    });

    it('🔴 CRITICAL: deve limpar entradas antigas antes de contar (janela deslizante)', async () => {
      redisMock.zremrangebyscore.mockResolvedValueOnce(10); // Remove 10 entradas antigas
      redisMock.zcard.mockResolvedValueOnce(25);

      const result = await isInstanceWithinHourlyLimit('chip-test');

      // Garante que ZREMRANGEBYSCORE foi chamado ANTES de ZCARD
      const calls = [
        redisMock.zremrangebyscore.mock.invocationCallOrder[0],
        redisMock.zcard.mock.invocationCallOrder[0],
      ];
      expect(calls[0]).toBeLessThan(calls[1]);
      expect(result).toBe(true);
    });
  });

  // ─── recordInstanceHourlyMessage (Sliding Window) ────────────────────────
  describe('recordInstanceHourlyMessage', () => {
    it('deve adicionar entrada no Sorted Set com score = timestamp atual', async () => {
      const before = Date.now();
      redisMock.zadd.mockResolvedValueOnce(1);
      redisMock.expire.mockResolvedValueOnce(1);

      await recordInstanceHourlyMessage('chip-test');

      expect(redisMock.zadd).toHaveBeenCalledWith(
        'warmup:instance:sliding:chip-test',
        expect.any(Number), // score = timestamp
        expect.any(String)  // member = unique id
      );

      // Verifica que o score é um timestamp atual
      const [, score] = redisMock.zadd.mock.calls[0];
      expect(score).toBeGreaterThanOrEqual(before);
      expect(score).toBeLessThanOrEqual(Date.now() + 100);
    });

    it('deve configurar TTL de 2 horas na chave do Sorted Set', async () => {
      redisMock.zadd.mockResolvedValueOnce(1);
      redisMock.expire.mockResolvedValueOnce(1);

      await recordInstanceHourlyMessage('chip-test');

      expect(redisMock.expire).toHaveBeenCalledWith(
        'warmup:instance:sliding:chip-test',
        7200 // 2 horas = 2 * 3600
      );
    });
  });

  // ─── getInstanceHourlyCount ───────────────────────────────────────────────
  describe('getInstanceHourlyCount', () => {
    it('deve retornar o número de eventos na janela deslizante atual', async () => {
      redisMock.zremrangebyscore.mockResolvedValueOnce(0);
      redisMock.zcard.mockResolvedValueOnce(15);

      const count = await getInstanceHourlyCount('chip-test');
      expect(count).toBe(15);
    });
  });
});
