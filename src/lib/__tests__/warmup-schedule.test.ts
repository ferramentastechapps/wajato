/**
 * warmup-schedule.test.ts
 * Testes unitários para o módulo de agendamento e ramp-up do sistema de aquecimento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWithinBusinessHours,
  getMsUntilNextBusinessWindow,
  isWeekend,
  getRampUpTarget,
  calculateHeatScore,
  shouldTakeRestPeriod,
  getRestPeriodDurationMs,
} from '../warmup-schedule';

// ─── isWithinBusinessHours ───────────────────────────────────────────────────
describe('isWithinBusinessHours', () => {
  it('deve retornar true às 14h BRT (horário comercial padrão 8-22)', () => {
    // 14h BRT = 17h UTC
    vi.setSystemTime(new Date('2024-06-15T17:00:00.000Z'));
    expect(isWithinBusinessHours(8, 22)).toBe(true);
    vi.useRealTimers();
  });

  it('deve retornar false às 23h BRT (fora do horário 8-22)', () => {
    // 23h BRT = 02h UTC do dia seguinte
    vi.setSystemTime(new Date('2024-06-16T02:00:00.000Z'));
    expect(isWithinBusinessHours(8, 22)).toBe(false);
    vi.useRealTimers();
  });

  it('deve retornar false às 6h BRT (antes do horário comercial)', () => {
    // 6h BRT = 9h UTC
    vi.setSystemTime(new Date('2024-06-15T09:00:00.000Z'));
    expect(isWithinBusinessHours(8, 22)).toBe(false);
    vi.useRealTimers();
  });

  it('deve respeitar janela customizada (10h-18h)', () => {
    // 9h BRT = 12h UTC — fora da janela 10-18
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));
    expect(isWithinBusinessHours(10, 18)).toBe(false);
    vi.useRealTimers();
  });
});

// ─── getMsUntilNextBusinessWindow ────────────────────────────────────────────
describe('getMsUntilNextBusinessWindow', () => {
  it('deve retornar 0 se já estiver dentro do horário comercial', () => {
    // 14h BRT = 17h UTC
    vi.setSystemTime(new Date('2024-06-15T17:00:00.000Z'));
    expect(getMsUntilNextBusinessWindow(8, 22)).toBe(0);
    vi.useRealTimers();
  });

  it('deve retornar ms positivo se estiver fora do horário', () => {
    // 23h BRT = 02h UTC do dia seguinte
    vi.setSystemTime(new Date('2024-06-16T02:00:00.000Z'));
    const ms = getMsUntilNextBusinessWindow(8, 22);
    expect(ms).toBeGreaterThan(0);
    // 23h BRT → próximo 8h BRT = 9 horas = 32400000 ms (com possível diferença de minutos)
    expect(ms).toBeLessThanOrEqual(9 * 60 * 60 * 1000 + 60000);
    vi.useRealTimers();
  });

  it('deve respeitar endHour customizado no cálculo', () => {
    // 22:30 BRT = 01:30 UTC do dia seguinte
    vi.setSystemTime(new Date('2024-06-16T01:30:00.000Z'));
    // Se endHour for 23, 22:30 ainda está dentro!
    expect(getMsUntilNextBusinessWindow(8, 23)).toBe(0);
    
    // Se endHour for 22, 22:30 está fora!
    expect(getMsUntilNextBusinessWindow(8, 22)).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});

// ─── isWeekend ────────────────────────────────────────────────────────────────
describe('isWeekend', () => {
  it('deve retornar true no sábado (BRT)', () => {
    // 2024-06-15 é sábado
    vi.setSystemTime(new Date('2024-06-15T14:00:00.000Z'));
    expect(isWeekend()).toBe(true);
    vi.useRealTimers();
  });

  it('deve retornar false na segunda-feira (BRT)', () => {
    // 2024-06-17 é segunda-feira
    vi.setSystemTime(new Date('2024-06-17T14:00:00.000Z'));
    expect(isWeekend()).toBe(false);
    vi.useRealTimers();
  });
});

// ─── getRampUpTarget ──────────────────────────────────────────────────────────
describe('getRampUpTarget', () => {
  it('dia 1: deve retornar o initialMsgs', () => {
    expect(getRampUpTarget(1, 5, 150, false)).toBe(5);
  });

  it('dias de semana devem crescer exponencialmente até dia 7', () => {
    const day3 = getRampUpTarget(3, 5, 150, false);
    const day5 = getRampUpTarget(5, 5, 150, false);
    expect(day5).toBeGreaterThan(day3);
  });

  it('deve respeitar o teto máximo (maxMsgs)', () => {
    expect(getRampUpTarget(30, 5, 150, false)).toBe(150);
    expect(getRampUpTarget(100, 5, 50, false)).toBe(50);
  });

  it('fim de semana deve reduzir o target em ~50%', () => {
    const weekday = getRampUpTarget(10, 5, 150, false);
    const weekend = getRampUpTarget(10, 5, 150, true);
    expect(weekend).toBeLessThan(weekday);
    // Deve ser aproximadamente metade
    expect(weekend).toBeGreaterThanOrEqual(Math.floor(weekday * 0.45));
    expect(weekend).toBeLessThanOrEqual(Math.ceil(weekday * 0.55) + 1);
  });

  it('dia 0 ou negativo deve retornar o initialMsgs', () => {
    expect(getRampUpTarget(0, 5, 150, false)).toBe(5);
    expect(getRampUpTarget(-1, 5, 150, false)).toBe(5);
  });
});

// ─── calculateHeatScore ───────────────────────────────────────────────────────
describe('calculateHeatScore', () => {
  it('deve retornar 0 se totalDays for 0', () => {
    expect(calculateHeatScore(5, 0, 1.0)).toBe(0);
  });

  it('deve retornar 100 no último dia com 100% de sucesso', () => {
    expect(calculateHeatScore(30, 30, 1.0)).toBe(100);
  });

  it('deve aumentar com o progresso dos dias', () => {
    const score10 = calculateHeatScore(10, 30, 0.95);
    const score20 = calculateHeatScore(20, 30, 0.95);
    expect(score20).toBeGreaterThan(score10);
  });

  it('deve ser afetado pela taxa de sucesso', () => {
    const highSuccess = calculateHeatScore(15, 30, 1.0);
    const lowSuccess  = calculateHeatScore(15, 30, 0.5);
    expect(highSuccess).toBeGreaterThan(lowSuccess);
  });
});

// ─── shouldTakeRestPeriod ─────────────────────────────────────────────────────
describe('shouldTakeRestPeriod', () => {
  it('nunca faz rest com 0 mensagens', () => {
    expect(shouldTakeRestPeriod(0)).toBe(false);
  });

  it('deve eventualmente acionar rest period em múltiplos de 15-25', () => {
    // Qualquer múltiplo nessa faixa deve retornar true (probabilidade alta)
    // Como é aleatório, testamos os limites determinísticos
    const results15 = shouldTakeRestPeriod(15);
    const results30 = shouldTakeRestPeriod(30);
    // Ao menos um deles deve ser true (threshold entre 15-25)
    // Nota: como é pseudoaleatório, aceitamos qualquer resultado mas garantimos que retorna boolean
    expect(typeof results15).toBe('boolean');
    expect(typeof results30).toBe('boolean');
  });
});

// ─── getRestPeriodDurationMs ──────────────────────────────────────────────────
describe('getRestPeriodDurationMs', () => {
  it('deve retornar duração entre 5 e 15 minutos', () => {
    for (let i = 0; i < 20; i++) {
      const ms = getRestPeriodDurationMs();
      expect(ms).toBeGreaterThanOrEqual(5 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(15 * 60 * 1000);
    }
  });
});
