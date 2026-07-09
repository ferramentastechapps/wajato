import net from 'net';
import { prisma } from './prisma';
import { evolutionApi, parseProxyUrl } from './evolution';
import { isWebshareConfigured, getWebshareProxies } from './webshare';
import { logger } from './logger';

/**
 * Testa se uma porta TCP está respondendo em um host específico de forma assíncrona.
 * Usado para validar a integridade física do Proxy de forma leve e rápida.
 */
export function testProxyConnection(host: string, port: number, timeout = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      resolved = true;
      socket.destroy();
      resolve(true); // Porta respondendo
    });

    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
  });
}

/**
 * Executa a rotina de verificação e rotatividade automática de proxies (Self-Healing).
 * Identifica proxies offline e os substitui por novos proxies válidos do Webshare.
 */
export async function runProxySelfHealer(): Promise<void> {
  try {
    // 1. Busca todas as instâncias cadastradas no banco local que utilizam proxy
    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        proxy: { not: null },
      },
    });

    if (instances.length === 0) return;

    logger.info(`[ProxyHealer] Iniciando verificação de proxy para ${instances.length} instâncias...`);

    let webshareProxies: string[] = [];
    let checkedWebshare = false;

    for (const inst of instances) {
      if (!inst.proxy) continue;

      const parsed = parseProxyUrl(inst.proxy);
      if (!parsed) {
        logger.warn(`[ProxyHealer] Proxy com formato inválido para instância ${inst.name}: ${inst.proxy}`);
        continue;
      }

      const { host, port } = parsed.proxy;

      // 2. Testa o status de conexão física do proxy atual
      const isAlive = await testProxyConnection(host, port);

      if (isAlive) {
        logger.info(`[ProxyHealer] Proxy OK para a instância ${inst.name}: ${host}:${port}`);
        continue;
      }

      logger.warn(`[ProxyHealer] Proxy OFFLINE detectado para a instância ${inst.name}: ${host}:${port}. Iniciando rotatividade...`);

      // 3. Se a integração com a Webshare estiver ativa, rotaciona o proxy automaticamente
      if (!isWebshareConfigured()) {
        logger.warn(`[ProxyHealer] Webshare não está configurado. Substituição manual é necessária para ${inst.name}`);
        continue;
      }

      // Carrega os proxies da Webshare apenas uma vez por execução do loop
      if (!checkedWebshare) {
        try {
          webshareProxies = await getWebshareProxies();
          checkedWebshare = true;
        } catch (err: any) {
          logger.error(`[ProxyHealer] Erro ao carregar proxies da Webshare:`, err.message);
          continue;
        }
      }

      if (webshareProxies.length === 0) {
        logger.error(`[ProxyHealer] Nenhum proxy retornado pela conta Webshare.`);
        continue;
      }

      // Busca todos os proxies atualmente em uso no banco para evitar conflito/duplicação
      const activeInstances = await prisma.whatsAppInstance.findMany({
        select: { proxy: true },
      });
      const proxiesInUse = new Set(activeInstances.map((i) => i.proxy).filter(Boolean));

      // Filtra proxies da Webshare que não estão sendo usados por outros chips ativos
      const availableProxies = webshareProxies.filter((p) => !proxiesInUse.has(p));

      let selectedProxy: string | null = null;

      // Encontra o primeiro proxy disponível que esteja online
      for (const candidate of availableProxies) {
        const parsedCandidate = parseProxyUrl(candidate);
        if (!parsedCandidate) continue;

        const candidateAlive = await testProxyConnection(parsedCandidate.proxy.host, parsedCandidate.proxy.port);
        if (candidateAlive) {
          selectedProxy = candidate;
          break;
        }
      }

      if (!selectedProxy) {
        logger.error(`[ProxyHealer] Não foi possível encontrar nenhum proxy online e disponível no Webshare para substituir.`);
        continue;
      }

      // 4. Efetua a substituição do proxy offline no banco local e na Evolution API
      try {
        // Atualiza no banco local
        await prisma.whatsAppInstance.update({
          where: { id: inst.id },
          data: { proxy: selectedProxy },
        });

        // Configura na Evolution API
        await evolutionApi.setInstanceProxy(inst.name, selectedProxy);

        // Força a reinicialização da conexão da instância para aplicar o novo proxy de rede
        try {
          await evolutionApi.logoutInstance(inst.name);
        } catch {
          // Silencia o erro se já estiver deslogado
        }
        
        // Solicita a conexão para que a Evolution API inicialize a nova sessão usando o novo proxy
        try {
          await evolutionApi.getQRCode(inst.name);
        } catch {
          // Silencia falhas ao resgatar QR Code imediato
        }

        logger.info(`[ProxyHealer] ✅ Proxy da instância ${inst.name} substituído automaticamente com sucesso pelo novo IP: ${selectedProxy}`);
      } catch (err: any) {
        logger.error(`[ProxyHealer] Falha crítica ao rotacionar proxy da instância ${inst.name}:`, err.message);
      }
    }
  } catch (error: any) {
    logger.error(`[ProxyHealer] Erro no loop de Auto-Heal:`, error.message);
  }
}
