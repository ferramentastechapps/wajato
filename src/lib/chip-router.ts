import { prisma } from './prisma';
import { redisConnection } from './redis';

const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';
const MAX_DAILY_MESSAGES_PER_CHIP = 200;

let lastWarmingCache: { names: string[]; timestamp: number } | null = null;
const WARMING_CACHE_TTL_MS = 30_000; // 30s cache para evitar sobrecarga no banco

/**
 * Seleciona a melhor instância de WhatsApp conectada e saudável para envio.
 * @param excludeInstances Lista de nomes de instâncias a serem ignoradas nesta tentativa (ex: após falha em chip anterior)
 * @param allowedInstances Se especificado, restringe a seleção APENAS a essas instâncias (para campanhas com chips fixos)
 * @param onlyMature Se true (padrão em campanhas em massa), exclui automaticamente qualquer chip que ainda esteja em aquecimento ativo!
 */
export async function getNextWhatsAppInstance(
  excludeInstances: string[] = [],
  allowedInstances?: string[] | null,
  onlyMature: boolean = true
): Promise<string> {
  try {
    // Se onlyMature = true e não há restrição manual de instâncias, identifica e bloqueia chips em aquecimento ativo
    let warmingInstancesToExclude: string[] = [];
    if (onlyMature && (!allowedInstances || allowedInstances.length === 0)) {
      const now = Date.now();
      if (lastWarmingCache && now - lastWarmingCache.timestamp < WARMING_CACHE_TTL_MS) {
        warmingInstancesToExclude = lastWarmingCache.names;
      } else {
        try {
          const [runningWarmups, runningPools] = await Promise.all([
            prisma.warmupCampaign.findMany({
              where: { status: 'RUNNING' },
              select: { sourceInstance: true, targetInstance: true, currentDay: true, totalDays: true, continuousMode: true },
            }),
            prisma.warmupPool.findMany({
              where: { status: 'RUNNING' },
              select: { instanceNames: true, currentDay: true, totalDays: true, continuousMode: true },
            }),
          ]);

          // Instâncias que atingiram maturação em qualquer campanha
          const matureSet = new Set<string>();
          for (const w of runningWarmups) {
            if (w.currentDay >= w.totalDays || w.continuousMode) {
              matureSet.add(w.sourceInstance);
              if (w.targetInstance) matureSet.add(w.targetInstance);
            }
          }
          for (const p of runningPools) {
            if (p.currentDay >= p.totalDays || p.continuousMode) {
              p.instanceNames.forEach((n) => matureSet.add(n));
            }
          }

          const fromWarmups: string[] = [];
          for (const w of runningWarmups) {
            if (w.currentDay < w.totalDays && !w.continuousMode) {
              if (!matureSet.has(w.sourceInstance)) fromWarmups.push(w.sourceInstance);
              if (w.targetInstance && !matureSet.has(w.targetInstance)) fromWarmups.push(w.targetInstance);
            }
          }

          const fromPools = runningPools
            .filter((p) => p.currentDay < p.totalDays && !p.continuousMode)
            .flatMap((p) => p.instanceNames)
            .filter((n) => !matureSet.has(n));

          warmingInstancesToExclude = Array.from(new Set([...fromWarmups, ...fromPools]));
          lastWarmingCache = { names: warmingInstancesToExclude, timestamp: now };
        } catch (err: any) {
          console.warn('[ChipRouter] Erro ao verificar campanhas de aquecimento:', err?.message);
          if (lastWarmingCache) {
            warmingInstancesToExclude = lastWarmingCache.names;
          }
        }
      }

      if (warmingInstancesToExclude.length > 0) {
        console.log(
          `🛡️ [ChipRouter] Proteção Anti-Ban: ${warmingInstancesToExclude.length} chips em aquecimento ativo foram preservados e excluídos da rotação de campanhas em massa: [${warmingInstancesToExclude.join(', ')}]`
        );
      }
    }

    const finalExcluded = Array.from(new Set([...excludeInstances, ...warmingInstancesToExclude]));

    // 1. Buscar todas as instâncias conectadas que estão saudáveis e abaixo do limite diário
    const whereClause: any = {
      status: 'CONNECTED',
      healthScore: { gt: 20 },
      dailyMsgCount: { lt: MAX_DAILY_MESSAGES_PER_CHIP },
    };

    if (allowedInstances && allowedInstances.length > 0) {
      whereClause.name = { in: allowedInstances, ...(excludeInstances.length > 0 ? { notIn: excludeInstances } : {}) };
    } else if (finalExcluded.length > 0) {
      whereClause.name = { notIn: finalExcluded };
    }

    const healthyInstances = await prisma.whatsAppInstance.findMany({
      where: whereClause,
    });

    if (healthyInstances.length === 0) {
      // Se filtramos com exclusões e não sobrou nada, tenta fallback seguro
      if (allowedInstances && allowedInstances.length > 0) {
        console.warn(`[ChipRouter] Nenhuma instância disponível dentro das permitidas: [${allowedInstances.join(', ')}]. Usando primeira permitida.`);
        return allowedInstances[0];
      }
      if (finalExcluded.length > 0) {
        console.warn(`[ChipRouter] Nenhum chip maturado disponível fora de [${finalExcluded.join(', ')}].`);
        throw new Error(`Nenhum chip maturado disponível no momento. Todos os chips conectados estão em aquecimento ativo: [${finalExcluded.join(', ')}].`);
      }
      throw new Error(`Nenhuma instância de WhatsApp conectada e saudável encontrada no banco.`);
    }

    // Filtra chips que atingiram o limite de mensagens consecutivas sem resposta (outbound puro)
    const activeInstances = healthyInstances.filter((inst) => {
      if (inst.unrepliedBlockEnabled && inst.unrepliedMsgCount >= inst.maxUnrepliedLimit) {
        console.warn(
          `[ChipRouter] Instância ${inst.name} ignorada: atingiu o limite de ${inst.unrepliedMsgCount}/${inst.maxUnrepliedLimit} mensagens sem resposta.`
        );
        return false;
      }
      return true;
    });

    if (activeInstances.length === 0) {
      console.warn(`[ChipRouter] Todos os chips conectados atingiram o limite de mensagens sem resposta. Usando fallback padrão: ${DEFAULT_INSTANCE}`);
      return DEFAULT_INSTANCE;
    }

    // 2. Obter métricas de engajamento/leitura por hora no Redis para refinamento do ranking
    const currentHourBRT = (new Date().getUTCHours() - 3 + 24) % 24;
    const scoredInstances = await Promise.all(
      activeInstances.map(async (inst) => {
        let hourBonus = 0;
        try {
          const readsInHour = await redisConnection.get(`chip:${inst.name}:reads_hour:${currentHourBRT}`);
          if (readsInHour) {
            hourBonus = Math.min(parseInt(readsInHour, 10) * 2, 20); // até 20 pontos de bônus
          }
        } catch {
          // Ignora silenciosamente se Redis oscilar
        }

        // Score ponderado: Menos msgs enviadas hoje dá pontuação alta + saúde + bônus de engajamento do horário
        const volumeScore = Math.max(0, MAX_DAILY_MESSAGES_PER_CHIP - inst.dailyMsgCount);
        const compositeScore = inst.healthScore * 1.5 + volumeScore * 1.0 + hourBonus;

        return {
          instance: inst,
          compositeScore,
        };
      })
    );

    // Ordena pelo score ponderado decrescente
    scoredInstances.sort((a, b) => b.compositeScore - a.compositeScore);

    const selectedInstance = scoredInstances[0].instance;
    console.log(
      `[ChipRouter] Instância selecionada para envio: ${selectedInstance.name} (Envios hoje: ${selectedInstance.dailyMsgCount}, Saúde: ${selectedInstance.healthScore}%, Hora BRT: ${currentHourBRT}h)`
    );
    return selectedInstance.name;
  } catch (error) {
    console.error('[ChipRouter] Erro ao selecionar instância:', error);
    return DEFAULT_INSTANCE;
  }
}

/**
 * Registra leitura de mensagem (READ) confirmada para o chip, acumulando score de engajamento por hora
 */
export async function recordChipReadEngagement(instanceName: string): Promise<void> {
  try {
    const currentHourBRT = (new Date().getUTCHours() - 3 + 24) % 24;
    const key = `chip:${instanceName}:reads_hour:${currentHourBRT}`;
    await redisConnection.incr(key);
    await redisConnection.expire(key, 7 * 24 * 60 * 60); // expira em 7 dias
  } catch (err: any) {
    console.error('[ChipRouter] Erro ao registrar engajamento de leitura do chip:', err?.message);
  }
}

/**
 * Registra o sucesso de um envio em um chip
 */
export async function reportChipSuccess(instanceName: string): Promise<void> {
  try {
    await prisma.whatsAppInstance.updateMany({
      where: { name: instanceName },
      data: {
        dailyMsgCount: { increment: 1 },
        healthScore: { increment: 1 }, // Aumenta a saúde gradualmente com o sucesso
        unrepliedMsgCount: { increment: 1 }, // Incrementa mensagens consecutivas sem resposta
      },
    });

    // Limita o healthScore a no máximo 100
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { name: instanceName },
    });
    if (instance && instance.healthScore > 100) {
      await prisma.whatsAppInstance.update({
        where: { name: instanceName },
        data: { healthScore: 100 },
      });
    }
  } catch (error) {
    console.error('[ChipRouter] Erro ao reportar sucesso do chip:', error);
  }
}

/**
 * Registra uma falha de envio em um chip
 */
export async function reportChipFailure(instanceName: string, errorMsg: string): Promise<void> {
  try {
    console.warn(`[ChipRouter] Registrando falha para a instância ${instanceName}. Erro: ${errorMsg}`);
    
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { name: instanceName },
    });

    if (instance) {
      // Diferencia falha de rede/API temporária de desconexão real do chip
      const isRealDisconnection = 
        errorMsg.toLowerCase().includes('disconnected') || 
        errorMsg.toLowerCase().includes('401') || 
        errorMsg.toLowerCase().includes('unauthorized') || 
        errorMsg.toLowerCase().includes('session closed') || 
        errorMsg.toLowerCase().includes('logout');

      const penalty = isRealDisconnection ? 20 : 4; // penalidade leve (4%) para erros genéricos, pesada (20%) para queda real
      const newScore = Math.max(0, instance.healthScore - penalty);
      
      await prisma.whatsAppInstance.update({
        where: { name: instanceName },
        data: {
          healthScore: newScore,
          // Somente desconecta se a saúde zerar totalmente ou for erro de sessão explícito
          status: (newScore <= 0 || isRealDisconnection)
            ? 'DISCONNECTED'
            : instance.status,
        },
      });
    }
  } catch (error) {
    console.error('[ChipRouter] Erro ao reportar falha do chip:', error);
  }
}

/**
 * Zera o contador diário de mensagens de todos os chips (executar em cron / início do dia)
 */
export async function resetDailyMsgCounters(): Promise<void> {
  try {
    await prisma.whatsAppInstance.updateMany({
      data: { dailyMsgCount: 0 },
    });
    console.log('[ChipRouter] Contadores diários de todos os chips foram resetados.');
  } catch (error) {
    console.error('[ChipRouter] Erro ao resetar contadores diários:', error);
  }
}

