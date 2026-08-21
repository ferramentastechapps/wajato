/**
 * warmup-schedule.ts
 * Controle de janela de horário comercial e ramp-up progressivo.
 * Garante comportamento humano: envia apenas em horários plausíveis
 * e aumenta gradativamente o volume de mensagens dia após dia.
 */

/**
 * Verifica se duas datas caem no mesmo dia de calendário no fuso horário de Brasília (America/Sao_Paulo / UTC-3).
 * Evita falsos positivos/negativos em servidores rodando em UTC onde horários entre 21h e 00h BRT
 * pertencem ao dia anterior em BRT mas ao dia seguinte em UTC.
 */
export function isSameCalendarDayInBRT(date1: Date, date2: Date): boolean {
  const d1 = date1.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const d2 = date2.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return d1 === d2;
}

/**
 * Verifica se o horário atual está dentro da janela permitida.
 * Leva em conta o fuso horário de Brasília (UTC-3).
 */
export function isWithinBusinessHours(startHour: number = 8, endHour: number = 22): boolean {
  // Fuso horário de Brasília
  const now = new Date();
  const brazilOffset = -3 * 60; // UTC-3 em minutos
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brazilMinutes = (utcMinutes + brazilOffset + 1440) % 1440;
  const brazilHour = Math.floor(brazilMinutes / 60);

  return brazilHour >= startHour && brazilHour < endHour;
}

/**
 * Calcula o delay em ms até o próximo horário permitido de início do dia.
 * Se já está dentro do horário, retorna 0.
 */
export function getMsUntilNextBusinessWindow(startHour: number = 8, endHour: number = 22): number {
  const now = new Date();
  const brazilOffset = -3 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brazilMinutes = (utcMinutes + brazilOffset + 1440) % 1440;
  const brazilHour = Math.floor(brazilMinutes / 60);
  const brazilMin = brazilMinutes % 60;

  if (brazilHour >= startHour && brazilHour < endHour) return 0;

  // Calcula quando começa o próximo dia útil
  let hoursUntilStart: number;
  if (brazilHour >= endHour) {
    // Após o expediente: espera até amanhã no startHour
    hoursUntilStart = 24 - brazilHour + startHour;
  } else {
    // Antes do expediente: espera até startHour hoje
    hoursUntilStart = startHour - brazilHour;
  }

  const minsUntilStart = hoursUntilStart * 60 - brazilMin;
  return minsUntilStart * 60 * 1000;
}

/**
 * Calcula o delay em ms até o startHour de amanhã no fuso horário de Brasília (UTC-3).
 */
export function getMsUntilTomorrowStart(startHour: number = 8): number {
  const now = new Date();

  // Obtém a data atual em Brasília (UTC-3) usando métodos UTC para evitar
  // dependência do fuso local do servidor.
  const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000; // 3h em ms
  const brazilNow = new Date(now.getTime() - BRAZIL_OFFSET_MS);

  // "Amanhã às startHour" no horário de Brasília com jitter de 5 a 45 min
  const startOffsetMin = Math.floor(Math.random() * 40 + 5); // 5 a 45 min
  const tomorrowBrazilMs = Date.UTC(
    brazilNow.getUTCFullYear(),
    brazilNow.getUTCMonth(),
    brazilNow.getUTCDate() + 1, // amanhã (em BRT)
    startHour,
    startOffsetMin,
    0,
    0
  );

  // Converte de volta para UTC real adicionando o offset de Brasília
  const tomorrowUTC = tomorrowBrazilMs + BRAZIL_OFFSET_MS;

  return Math.max(0, tomorrowUTC - now.getTime());
}

/**
 * Verifica se hoje é fim de semana (sábado/domingo).
 * Em fins de semana, o volume é reduzido em 50%.
 */
export function isWeekend(): boolean {
  const now = new Date();
  const brazilOffset = -3 * 60 * 60 * 1000;
  const brazilDate = new Date(now.getTime() + brazilOffset);
  const day = brazilDate.getUTCDay();
  return day === 0 || day === 6; // 0=Dom, 6=Sáb
}

/**
 * Calcula o target de mensagens para o dia atual baseado no ramp-up.
 * Segue uma curva progressiva que respeita os limites do WhatsApp.
 * 
 * Estratégia profissional:
 * - Dias 1-3: Fase de aquecimento lento (5→8→12)
 * - Dias 4-7: Fase de crescimento moderado (18→25→35→50)
 * - Dias 8-14: Fase de escalonamento (60→75→90→105→120→135→150)
 * - Dia 15+: Manutenção no máximo configurado
 */
export function getRampUpTarget(
  currentDay: number,
  initialMsgs: number = 5,
  maxMsgs: number = 150,
  isWeekendDay: boolean = false
): number {
  let target: number;

  if (currentDay <= 0) {
    target = initialMsgs;
  } else if (currentDay === 1) {
    target = initialMsgs;
  } else if (currentDay <= 7) {
    // Crescimento exponencial suave nos primeiros 7 dias
    const growthFactor = 1.5;
    target = Math.round(initialMsgs * Math.pow(growthFactor, currentDay - 1));
  } else if (currentDay <= 14) {
    // Fase de escalonamento: +15 por dia após dia 7
    const day7Target = Math.round(initialMsgs * Math.pow(1.5, 6));
    target = day7Target + (currentDay - 7) * 15;
  } else {
    // Manutenção no máximo
    target = maxMsgs;
  }

  // Aplica teto máximo
  target = Math.min(target, maxMsgs);

  // Fins de semana: reduz 50% para simular comportamento humano
  if (isWeekendDay) {
    target = Math.max(2, Math.floor(target * 0.5));
  }

  return target;
}

/**
 * Calcula o heat score (0-100) baseado no progresso da campanha.
 * Combina dias decorridos, taxa de sucesso e volume.
 */
export function calculateHeatScore(
  currentDay: number,
  totalDays: number,
  successRate: number // 0.0 a 1.0
): number {
  if (totalDays === 0) return 0;
  const dayProgress = Math.min(currentDay / totalDays, 1.0);
  const score = dayProgress * 70 + successRate * 30;
  return Math.round(Math.min(100, score));
}

/**
 * Verifica se a campanha está em período de descanso (rest period).
 * O rest period é aplicado a cada N mensagens enviadas para simular
 * o usuário saindo do celular por alguns minutos.
 */
export function shouldTakeRestPeriod(msgsSentToday: number): boolean {
  // Pausa a cada 15–25 mensagens enviadas
  const restThreshold = 15 + Math.floor(Math.random() * 10);
  return msgsSentToday > 0 && msgsSentToday % restThreshold === 0;
}

/**
 * Calcula a duração do rest period em ms (5 a 15 minutos).
 */
export function getRestPeriodDurationMs(): number {
  const minMinutes = 5;
  const maxMinutes = 15;
  return (minMinutes + Math.floor(Math.random() * (maxMinutes - minMinutes + 1))) * 60 * 1000;
}

// ─── Sistema de Turnos Diários ───────────────────────────────────────────────
// Divide o dia em 3 blocos: manhã, tarde e noite.
// Cada bloco recebe uma fatia aleatória da cota diária para que as mensagens
// sejam espalhadas organicamente ao longo do dia, como uma pessoa real faria.

export type DayShift = 'morning' | 'afternoon' | 'evening';

export interface ShiftWindow {
  from: number; // hora BRT (inclusive)
  to: number;   // hora BRT (exclusive)
}

export interface DailyShiftQuota {
  morning: number;
  afternoon: number;
  evening: number;
}

/**
 * Divide a janela do dia (startHour→endHour) em 3 turnos proporcionais.
 * Se a janela for muito curta para 3 blocos reais, reduz para o que couber.
 */
export function getShiftWindows(startHour: number, endHour: number): Record<DayShift, ShiftWindow> {
  const totalHours = endHour - startHour;
  // Pontos de corte: ~28% e ~60% da janela, com jitter leve para não ser exato
  const cut1 = startHour + Math.max(1, Math.round(totalHours * 0.28));
  const cut2 = startHour + Math.max(cut1 - startHour + 1, Math.round(totalHours * 0.60));

  return {
    morning:   { from: startHour, to: Math.min(cut1, endHour) },
    afternoon: { from: Math.min(cut1, endHour), to: Math.min(cut2, endHour) },
    evening:   { from: Math.min(cut2, endHour), to: endHour },
  };
}

/**
 * Retorna o turno atual com base na hora BRT.
 * Fora da janela comercial retorna null.
 */
export function getCurrentShift(startHour: number, endHour: number): DayShift | null {
  const now = new Date();
  const brazilOffset = -3 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brazilMinutes = (utcMinutes + brazilOffset + 1440) % 1440;
  const brazilHour = Math.floor(brazilMinutes / 60);

  if (brazilHour < startHour || brazilHour >= endHour) return null;

  const windows = getShiftWindows(startHour, endHour);

  if (brazilHour >= windows.morning.from && brazilHour < windows.morning.to) return 'morning';
  if (brazilHour >= windows.afternoon.from && brazilHour < windows.afternoon.to) return 'afternoon';
  return 'evening';
}

/**
 * Calcula o delay em ms até o início do próximo turno (ou da próxima janela).
 * Retorna 0 se o próximo turno já começou (ou se ainda estamos dentro do atual).
 */
export function getMsUntilNextShift(
  currentShift: DayShift,
  startHour: number,
  endHour: number
): number {
  const windows = getShiftWindows(startHour, endHour);

  const shiftOrder: DayShift[] = ['morning', 'afternoon', 'evening'];
  const currentIndex = shiftOrder.indexOf(currentShift);
  const nextShift = shiftOrder[currentIndex + 1];

  if (!nextShift) {
    // Último turno do dia: aguarda amanhã
    return getMsUntilTomorrowStart(startHour);
  }

  const nextShiftStartHour = windows[nextShift].from;

  const now = new Date();
  const brazilOffset = -3 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brazilMinutes = (utcMinutes + brazilOffset + 1440) % 1440;
  const brazilHour = Math.floor(brazilMinutes / 60);
  const brazilMin = brazilMinutes % 60;

  if (brazilHour >= nextShiftStartHour) return 0;

  const minsUntil = (nextShiftStartHour - brazilHour) * 60 - brazilMin;
  // Adiciona jitter de ±10 min para não parecer automático
  const jitterMs = (Math.floor(Math.random() * 20) - 10) * 60 * 1000;
  return Math.max(60000, minsUntil * 60 * 1000 + jitterMs);
}

/**
 * Distribui aleatoriamente `total` mensagens entre os 3 turnos do dia.
 * As proporções variam a cada dia (dentro de faixas) para simular comportamento humano variável.
 * 
 * Faixas:
 *  - Manhã:   20–40% do total
 *  - Tarde:   30–50% do total
 *  - Noite:   15–35% do total
 * 
 * Garante que a soma seja exatamente `total` e que cada turno tenha no mínimo 1 msg.
 */
export function allocateDailyQuota(total: number): DailyShiftQuota {
  if (total <= 2) {
    // Para cotas mínimas, distribui 1 por turno até acabar
    return { morning: Math.min(1, total), afternoon: Math.min(1, Math.max(0, total - 1)), evening: Math.max(0, total - 2) };
  }

  // Gera proporções aleatórias dentro das faixas
  const morningPct  = 0.20 + Math.random() * 0.20; // 20%–40%
  const afternoonPct = 0.30 + Math.random() * 0.20; // 30%–50%
  // Noite = o que sobrar, mas garantimos pelo menos 15%
  const eveningPct = Math.max(0.15, 1 - morningPct - afternoonPct);

  // Normaliza para que a soma seja exatamente 1
  const sumPct = morningPct + afternoonPct + eveningPct;
  const m = Math.max(1, Math.round((morningPct / sumPct) * total));
  const a = Math.max(1, Math.round((afternoonPct / sumPct) * total));
  let e = Math.max(1, total - m - a);

  // Ajuste fino para garantir soma == total
  const diff = total - (m + a + e);
  return { morning: m, afternoon: a, evening: e + diff };
}

