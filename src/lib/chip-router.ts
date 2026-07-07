import { prisma } from './prisma';

const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'wajato-session';
const MAX_DAILY_MESSAGES_PER_CHIP = 200;

export async function getNextWhatsAppInstance(): Promise<string> {
  try {
    // 1. Buscar todas as instâncias conectadas que estão saudáveis e abaixo do limite diário
    const healthyInstances = await prisma.whatsAppInstance.findMany({
      where: {
        status: 'CONNECTED',
        healthScore: { gt: 20 },
        dailyMsgCount: { lt: MAX_DAILY_MESSAGES_PER_CHIP },
      },
      orderBy: [
        { dailyMsgCount: 'asc' }, // Prioriza as que enviaram menos mensagens hoje
        { healthScore: 'desc' },  // Depois as com melhor pontuação de saúde
      ],
    });

    if (healthyInstances.length === 0) {
      console.warn(`[ChipRouter] Nenhuma instância saudável/conectada encontrada no banco. Usando fallback padrão: ${DEFAULT_INSTANCE}`);
      return DEFAULT_INSTANCE;
    }

    // Seleciona a melhor instância (primeira da fila após a ordenação)
    const selectedInstance = healthyInstances[0];
    console.log(`[ChipRouter] Instância selecionada para envio: ${selectedInstance.name} (Envios hoje: ${selectedInstance.dailyMsgCount}, Saúde: ${selectedInstance.healthScore}%)`);
    return selectedInstance.name;
  } catch (error) {
    console.error('[ChipRouter] Erro ao selecionar instância:', error);
    return DEFAULT_INSTANCE;
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
      // Reduz o score de saúde substancialmente na falha
      const newScore = Math.max(0, instance.healthScore - 20);
      
      await prisma.whatsAppInstance.update({
        where: { name: instanceName },
        data: {
          healthScore: newScore,
          // Se a saúde cair demais ou o erro indicar desconexão, atualiza status
          status: newScore <= 20 || errorMsg.toLowerCase().includes('disconnected') || errorMsg.toLowerCase().includes('401')
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
