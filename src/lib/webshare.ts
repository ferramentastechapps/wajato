import axios from 'axios';

const WEBSHARE_API_KEY = process.env.WEBSHARE_API_KEY || '';

export interface WebshareProxy {
  username: string;
  password?: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  country_code: string;
}

/**
 * Verifica se a integração com a Webshare está configurada no .env
 */
export function isWebshareConfigured(): boolean {
  return WEBSHARE_API_KEY.trim().length > 0;
}

/**
 * Busca a lista de proxies cadastrados na conta da Webshare
 */
export async function getWebshareProxies(): Promise<string[]> {
  if (!isWebshareConfigured()) {
    return [];
  }

  try {
    const response = await axios.get('https://proxy.webshare.io/api/v2/proxy/list/', {
      params: {
        mode: 'direct',
        page: 1,
        page_size: 100,
      },
      headers: {
        'Authorization': `Token ${WEBSHARE_API_KEY}`,
      },
    });

    const results = response.data?.results || [];
    
    // Mapeia os proxies válidos para o formato http://user:pass@ip:port
    return results
      .filter((p: any) => p.valid === true)
      .map((p: any) => {
        const auth = p.username && p.password ? `${p.username}:${p.password}@` : '';
        return `http://${auth}${p.proxy_address}:${p.port}`;
      });
  } catch (error: any) {
    console.error('[Webshare] Erro ao buscar proxies:', error?.response?.data || error.message);
    throw new Error('Falha ao obter lista de proxies da Webshare');
  }
}

/**
 * Retorna um proxy aleatório da Webshare
 */
export async function getRandomWebshareProxy(): Promise<string | null> {
  const proxies = await getWebshareProxies();
  if (proxies.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}
