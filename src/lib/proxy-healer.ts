import http from 'http';
import net from 'net';
import { prisma } from './prisma';
import { evolutionApi, parseProxyUrl } from './evolution';
import { isWebshareConfigured, getWebshareProxies } from './webshare';
import { logger } from './logger';

/**
 * Testa se um proxy HTTP está respondendo e permitindo estabelecer túnel HTTPS autenticado (CONNECT).
 * Isso detecta proxies offline, timeouts e erros 407 (Proxy Authentication Required) da rotação periódica do Webshare.
 */
export function testProxyConnection(proxyUrlOrHost: string, port?: number, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      let host = proxyUrlOrHost;
      let targetPort = port || 80;
      let authHeader = '';

      if (proxyUrlOrHost.startsWith('http://') || proxyUrlOrHost.startsWith('https://')) {
        const parsed = new URL(proxyUrlOrHost);
        host = parsed.hostname;
        targetPort = Number(parsed.port);
        if (parsed.username && parsed.password) {
          authHeader = 'Basic ' + Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64');
        }
      }

      // Se não tiver porta válida, faz fallback para teste de socket simples
      if (!targetPort || isNaN(targetPort)) {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.connect(targetPort, host, () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        return;
      }

      const req = http.request({
        host,
        port: targetPort,
        method: 'CONNECT',
        path: 'web.whatsapp.com:443',
        headers: authHeader ? { 'Proxy-Authorization': authHeader } : {},
        timeout,
      });

      let resolved = false;

      req.on('connect', (res, socket) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          req.destroy();
          resolve(res.statusCode === 200);
        }
      });

      req.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          req.destroy();
          resolve(false);
        }
      });

      req.on('error', () => {
        if (!resolved) {
          resolved = true;
          req.destroy();
          resolve(false);
        }
      });

      req.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Normaliza uma URL de proxy para comparação de host e porta
 */
function getProxyKey(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.hostname}:${parsed.port}`;
  } catch {
    return proxyUrl;
  }
}

/**
 * Executa a rotina de verificação e rotatividade automática de proxies (Self-Healing).
 * Identifica proxies offline ou expirados na rotação semanal do Webshare e os substitui
 * de forma 100% transparente sem deslogar o chip.
 */
export async function runProxySelfHealer(): Promise<void> {
  try {
    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        proxy: { not: null },
      },
    });

    if (instances.length === 0) return;

    logger.info(`[ProxyHealer] Iniciando verificação de proxy para ${instances.length} instâncias...`);

    let webshareProxies: string[] = [];
    if (isWebshareConfigured()) {
      try {
        webshareProxies = await getWebshareProxies();
      } catch (err: any) {
        logger.error(`[ProxyHealer] Erro ao carregar proxies da Webshare:`, err.message);
      }
    }

    const webshareKeys = new Set(webshareProxies.map(getProxyKey));

    for (const inst of instances) {
      if (!inst.proxy) continue;

      const currentKey = getProxyKey(inst.proxy);
      // Se Webshare está configurado, verifica se o proxy atual ainda pertence à conta
      const isPresentInWebshare = webshareProxies.length === 0 || webshareKeys.has(currentKey);

      // Testa se o proxy atual consegue autenticar e tunelar para o WhatsApp
      const isAlive = isPresentInWebshare && (await testProxyConnection(inst.proxy));

      if (isAlive) {
        logger.info(`[ProxyHealer] Proxy OK para a instância ${inst.name}: ${currentKey}`);
        continue;
      }

      if (!isPresentInWebshare) {
        logger.warn(`[ProxyHealer] 🔄 Proxy rotacionado na Webshare (IP antigo ${currentKey} não existe mais na conta). Rotacionando instância ${inst.name}...`);
      } else {
        logger.warn(`[ProxyHealer] ⚠️ Proxy OFFLINE/407 detectado para a instância ${inst.name} (${currentKey}). Iniciando rotatividade...`);
      }

      if (!isWebshareConfigured() || webshareProxies.length === 0) {
        logger.warn(`[ProxyHealer] Webshare não possui novos proxies disponíveis. Substituição manual é necessária para ${inst.name}`);
        continue;
      }

      // Busca todos os proxies atualmente atribuídos para evitar conflito/duplicidade entre chips
      const allInstances = await prisma.whatsAppInstance.findMany({
        where: { id: { not: inst.id } },
        select: { proxy: true },
      });
      const inUseKeys = new Set(allInstances.map((i) => i.proxy ? getProxyKey(i.proxy) : '').filter(Boolean));

      // Filtra candidatos disponíveis que não estejam em uso
      const availableProxies = webshareProxies.filter((p) => !inUseKeys.has(getProxyKey(p)));

      let selectedProxy: string | null = null;

      // Encontra o primeiro proxy da Webshare que esteja disponível e autenticando com status 200
      for (const candidate of availableProxies) {
        const candidateAlive = await testProxyConnection(candidate);
        if (candidateAlive) {
          selectedProxy = candidate;
          break;
        }
      }

      if (!selectedProxy) {
        logger.error(`[ProxyHealer] Não foi possível encontrar nenhum proxy online e disponível no Webshare para substituir na instância ${inst.name}.`);
        continue;
      }

      // Efetua a substituição do proxy no banco local e na Evolution API de forma limpa (sem logout)
      try {
        await prisma.whatsAppInstance.update({
          where: { id: inst.id },
          data: {
            proxy: selectedProxy,
            status: 'CONNECTED',
            healthScore: Math.max(inst.healthScore, 80),
          },
        });

        // Configura o novo proxy na Evolution API
        await evolutionApi.setInstanceProxy(inst.name, selectedProxy);

        // Reinicia a conexão da instância para conectar com o novo proxy sem perder a sessão
        await evolutionApi.restartInstance(inst.name);

        logger.info(`[ProxyHealer] ✅ Proxy da instância ${inst.name} atualizado automaticamente para o novo IP: ${getProxyKey(selectedProxy)}`);
      } catch (err: any) {
        logger.error(`[ProxyHealer] Falha ao rotacionar proxy da instância ${inst.name}:`, err?.message);
      }
    }
  } catch (error: any) {
    logger.error(`[ProxyHealer] Erro no loop de Auto-Heal:`, error.message);
  }
}
