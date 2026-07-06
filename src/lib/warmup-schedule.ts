/**
 * warmup-schedule.ts
 * Controle de janela de horário comercial e ramp-up progressivo.
 * Garante comportamento humano: envia apenas em horários plausíveis
 * e aumenta gradativamente o volume de mensagens dia após dia.
 */

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
export function getMsUntilNextBusinessWindow(startHour: number = 8): number {
  const now = new Date();
  const brazilOffset = -3 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brazilMinutes = (utcMinutes + brazilOffset + 1440) % 1440;
  const brazilHour = Math.floor(brazilMinutes / 60);
  const brazilMin = brazilMinutes % 60;

  if (brazilHour >= startHour && brazilHour < 22) return 0;

  // Calcula quando começa o próximo dia útil
  let hoursUntilStart: number;
  if (brazilHour >= 22) {
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
