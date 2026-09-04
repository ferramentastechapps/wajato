import { prisma } from './prisma';
import { redisConnection } from './redis';

export const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';
export const MAX_DAILY_MESSAGES_PER_CHIP = 200;

/**
 * Gera um limite diário com variação natural (jitter) de ±10 mensagens (ex: 190 a 210 para base 200).
 * Impede que o WhatsApp detecte automação por limites fixos idênticos todo dia.
 */
export function generateDailyLimitWithJitter(baseLimit: number = 200): number {
  const safeBase = baseLimit > 0 ? baseLimit : 200;
  const jitter = Math.floor(Math.random() * 21) - 10; // -10 a +10
  return Math.max(10, safeBase + jitter);
}

/**
 * Seleciona a melhor instância de WhatsApp conectada e saudável para envio.
 * @param excludeInstances Lista de nomes de instâncias a serem ignoradas nesta tentativa (ex: após falha em chip anterior)
 * @param allowedInstances Se especificado, restringe a seleção APENAS a essas instâncias (para campanhas com chips fixos - modo SPECIFIC)
 * @param onlyMature Se true (padrão em campanhas em massa), exige que o chip tenha allowCampaigns=true para ser usado
 */
export async function getNextWhatsAppInstance(
  excludeInstances: string[] = [],
  allowedInstances?: string[] | null,
  onlyMature: boolean = true
): Promise<string> {
  try {
    // 1. Monta o filtro base: conectado e saudável
    const whereClause: any = {
      status: 'CONNECTED',
      healthScore: { gt: 20 },
    };

    if (allowedInstances && allowedInstances.length > 0) {
      // Modo SPECIFIC: usa apenas os chips explicitamente escolhidos pelo usuário
      const notIn = excludeInstances.length > 0 ? excludeInstances : undefined;
      whereClause.name = { in: allowedInstances, ...(notIn ? { notIn } : {}) };
    } else {
      // Modo AUTO_MATURE: só usa chips com allowCampaigns = true (maturados e habilitados pelo usuário)
      if (onlyMature) {
        whereClause.allowCampaigns = true;
      }
      if (excludeInstances.length > 0) {
        whereClause.name = { notIn: excludeInstances };
      }
    }

    const instancesFound = await prisma.whatsAppInstance.findMany({
      where: whereClause,
    });

    // Filtra chips que ainda não atingiram o limite diário dinâmico do dia
    const healthyInstances = instancesFound.filter((inst) => {
      const capToday = inst.dailyLimitToday || inst.maxDailyLimit || MAX_DAILY_MESSAGES_PER_CHIP;
      return inst.dailyMsgCount < capToday;
    });

    if (healthyInstances.length === 0) {
      if (allowedInstances && allowedInstances.length > 0) {
        // Modo SPECIFIC sem chips disponíveis — avisa mas usa o primeiro (pode estar temporariamente indisponível)
        console.warn(`[ChipRouter] Nenhuma instância disponível dentro das permitidas: [${allowedInstances.join(', ')}]. Usando primeira da lista.`);
        return allowedInstances[0];
      }
      if (onlyMature) {
        throw new Error(
          `Nenhum chip habilitado para disparos em massa. ` +
          `Ative "Pode Disparar" em pelo menos um chip maturado na tela de Conexões, ` +
          `ou aguarde a maturação automática ao atingir 100% de aquecimento.`
        );
      }
      throw new Error(`Nenhuma instância de WhatsApp conectada e saudável encontrada no banco.`);
    }

    // 2. Filtra chips que atingiram o limite de mensagens consecutivas sem resposta (proteção anti-ban)
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

    // 3. Obter métricas de engajamento/leitura por hora no Redis para refinamento do ranking
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
        const maxCap = inst.dailyLimitToday || inst.maxDailyLimit || MAX_DAILY_MESSAGES_PER_CHIP;
        const volumeScore = Math.max(0, maxCap - inst.dailyMsgCount);
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
      `[ChipRouter] Instância selecionada: ${selectedInstance.name} ` +
      `(allowCampaigns=${selectedInstance.allowCampaigns}, Envios hoje: ${selectedInstance.dailyMsgCount}, ` +
      `Saúde: ${selectedInstance.healthScore}%, Hora BRT: ${currentHourBRT}h)`
    );
    return selectedInstance.name;
  } catch (error) {
    console.error('[ChipRouter] Erro ao selecionar instância:', error);
    throw error; // Relança para que o worker trate corretamente e não use chip aleatório
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
        errorMsg.toLowerCase().includes('connection closed') || 
        errorMsg.toLowerCase().includes('precondition required') || 
        errorMsg.toLowerCase().includes('logout');

      const penalty = isRealDisconnection ? 20 : 4; // desconexão real desconecta o chip imediatamente
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
    const instances = await prisma.whatsAppInstance.findMany({
      select: { id: true, maxDailyLimit: true },
    });
    for (const inst of instances) {
      const newLimitToday = generateDailyLimitWithJitter(inst.maxDailyLimit || 200);
      await prisma.whatsAppInstance.update({
        where: { id: inst.id },
        data: {
          dailyMsgCount: 0,
          dailyLimitToday: newLimitToday,
        },
      });
    }
    console.log(`[ChipRouter] Contadores diários resetados com limites aleatórios (jitter) para ${instances.length} chips.`);
  } catch (error) {
    console.error('[ChipRouter] Erro ao resetar contadores diários:', error);
  }
}

