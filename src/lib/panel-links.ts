import { logger } from './logger';

// Geração de testes grátis via LINKS de chatbot dos painéis (Painel Plus e SmartPlay)
// Cada link é um endpoint POST que já cria o teste e devolve o login pronto,
// sem passar pela API paga do Sigma (que fica como reserva no sigma-agent).
// Conteúdo adulto: SEMPRE as variantes C/ADULTO (decisão do dono, 27/11/2026).

export interface PanelLinkTrial {
  panel: 'Painel Plus' | 'SmartPlay';
  server?: string;
  username: string;
  password: string;
  dns?: string;
  packageName?: string;
  expiresAt?: string;
  expiresAtFormatted?: string;
  payUrl?: string;
  reply: string; // mensagem CURTA montada por nós (dados do teste + link de renovação)
}

const PANEL_TIMEOUT_MS = 20000;

// Os links NÃO ficam mais no código: desde 28/11/2026 eles vivem na
// configuração de CADA empresa (ChatbotConfig.trialPanelConfig, JSON editável
// na tela do chatbot), porque cada empresa tem os seus painéis/contas.
// Formato do JSON:
// {
//   "plusUrl": "https://painelplus.site/api/chatbot/<token>/<token>",
//   "smartplayBase": "https://smartplaypainel.site/api/chatbot/<conta>",
//   "smartplayServers": [
//     { "name": "ZEROUM", "packages": { "completo": "<token>", "unitv": "<token>", ... } }
//   ]
// }
// Conteúdo adulto: SEMPRE as variantes C/ADULTO (decisão do dono, 27/11/2026).
export interface TrialPanelConfig {
  plusUrl?: string;
  smartplayBase?: string;
  smartplayServers?: Array<{ name: string; packages: Partial<Record<SmartPackageKind, string>> }>;
}

export function parseTrialPanelConfig(raw?: string | null): TrialPanelConfig | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as TrialPanelConfig;
  } catch {
    return null;
  }
}

type SmartPackageKind =
  | 'completo'
  | 'android'
  | 'ios'
  | 'pc'
  | 'tvbox'
  | 'unitv'
  | 'lotus'
  | 'classeplay'
  | 'rxpurple'
  | 'xciptv';

// Os servidores do SmartPlay vêm da configuração da empresa (trialPanelConfig),
// na ordem em que estiverem lá: se um falhar, o cliente é gerado no próximo.
// Pacotes marcados como (PAGO) nas listas dos painéis ficam de fora de propósito.

/**
 * Zuxo, aplicativos Slim (Smart/XC/Fflix/Ibo), Smarters, Media Station X (Zuxo)
 * e navegador (portal slimweb) são atendidos pelo Painel Plus
 */
function isPlusRoute(deviceInput: string): boolean {
  const clean = deviceInput.toLowerCase();
  return (
    clean.includes('zuxo') ||
    clean.includes('slim') ||
    clean.includes('smarters') ||
    clean.includes('media station') ||
    clean.includes('msx') ||
    clean.includes('navegador') ||
    clean.includes('browser') ||
    clean.includes('portal') ||
    clean.includes('slimweb')
  );
}

/**
 * Escolhe os tipos de pacote do SmartPlay para o aparelho/app do cliente,
 * em ordem de preferência dentro de cada servidor
 */
function resolveSmartKinds(deviceInput: string, deviceKey: string): SmartPackageKind[] {
  const clean = deviceInput.toLowerCase();
  if (clean.includes('xciptv')) return ['xciptv'];
  if (clean.includes('lótus') || clean.includes('lotus')) return ['lotus'];
  if (clean.includes('classe')) return ['classeplay'];
  if (clean.includes('purple')) return ['rxpurple'];

  switch (deviceKey) {
    case 'unitv':
      return ['unitv'];
    case 'ios':
      return ['ios'];
    case 'pc':
      return ['pc'];
    case 'firestick':
      return ['xciptv'];
    case 'roku':
      return ['classeplay', 'lotus', 'rxpurple'];
    case 'samsung':
      return ['classeplay', 'lotus'];
    case 'lg':
      return ['lotus'];
    case 'android':
      // "tv box" cai em android no detectDeviceType, mas tem pacote próprio de 4h
      return clean.includes('box') ? ['tvbox', 'xciptv'] : ['android'];
    default:
      return ['completo'];
  }
}

function normalizeParts(data: any): string[] {
  if (!data) return [];
  if (typeof data === 'string') return data.trim() ? [data.trim()] : [];
  if (Array.isArray(data)) {
    return data
      .map((p) => (typeof p === 'string' ? p : p?.text || p?.message || p?.reply || ''))
      .map((s) => String(s).trim())
      .filter(Boolean);
  }
  if (typeof data === 'object') {
    const t = data.text || data.message || data.reply;
    return typeof t === 'string' && t.trim() ? [t.trim()] : [];
  }
  return [];
}

/**
 * Texto que vai para o cliente: o `reply` pronto do painel (ou as partes de `data`)
 */
function extractReplyText(json: any): string {
  if (typeof json?.reply === 'string' && json.reply.trim()) return json.reply.trim();

  const parts = normalizeParts(json?.data);
  if (parts.length) return parts.join('\n\n');

  // Sem texto pronto do painel: monta a mensagem básica com os dados do teste
  const lines = [
    '✅ *Seu Teste Grátis está liberado!*',
    '',
    `👤 *Usuário:* \`${json.username}\``,
    `🔑 *Senha:* \`${json.password}\``,
  ];
  if (json.dns) lines.push(`🌐 *URL / DNS:* \`${json.dns}\``);
  if (json.expiresAtFormatted) lines.push(`⏳ *Válido até:* ${json.expiresAtFormatted}`);
  lines.push('', 'Coloque esses dados no aplicativo que você abriu. Se tiver qualquer dúvida, é só me chamar aqui!');
  return lines.join('\n');
}

/**
 * Gera um teste chamando um link de chatbot (POST com corpo vazio)
 * Sucesso = HTTP 2xx com username/password na resposta
 */
async function generateFromLink(url: string): Promise<Omit<PanelLinkTrial, 'panel' | 'server'> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PANEL_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      logger.warn('[Panel Links] Link respondeu sem sucesso', { url, status: res.status });
      return null;
    }

    const json: any = await res.json().catch(() => null);
    if (!json?.username || !json?.password) {
      logger.warn('[Panel Links] Resposta do link sem login', { url });
      return null;
    }

    return {
      username: String(json.username),
      password: String(json.password),
      dns: json.dns || undefined,
      packageName: json.package || undefined,
      expiresAt: json.expiresAt || undefined,
      expiresAtFormatted: json.expiresAtFormatted || undefined,
      payUrl: json.payUrl || undefined,
      reply: extractReplyText(json),
    };
  } catch (error: any) {
    logger.error('[Panel Links] Falha ao gerar teste pelo link', error);
    return null;
  }
}

/**
 * A mensagem que vai ao cliente NÃO é mais o texto pronto do painel: ele é
 * enorme, repete as instruções de instalação que o agente já mandou na
 * mensagem anterior (e, no SmartPlay, nem tem os marcadores de seção do
 * Plus, então ia inteiro). Decisão do dono (28/11): montar uma mensagem
 * CURTA só com os dados do teste + o link de renovação do painel.
 */
function formatExpiry(trial: { expiresAt?: string; expiresAtFormatted?: string }): string | null {
  if (trial.expiresAtFormatted) return trial.expiresAtFormatted;
  if (!trial.expiresAt) return null;
  const d = new Date(trial.expiresAt);
  if (Number.isNaN(d.getTime())) return trial.expiresAt;
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return trial.expiresAt;
  }
}

function composeTrialMessage(
  trial: {
    username: string;
    password: string;
    dns?: string;
    expiresAt?: string;
    expiresAtFormatted?: string;
    payUrl?: string;
  },
  hideDns = false,
): string {
  const lines = [
    '✅ *Seu teste grátis está liberado!*',
    '',
    `👤 *Usuário:* \`${trial.username}\``,
    `🔑 *Senha:* \`${trial.password}\``,
  ];
  // Zuxo NÃO usa DNS: a configuração é pela Playlist com o código 'slim'
  // (regra do dono, 28/11) — a linha de DNS só confunde o cliente.
  if (trial.dns && !hideDns) lines.push(`🌐 *URL / DNS:* \`${trial.dns}\``);
  const expiry = formatExpiry(trial);
  if (expiry) lines.push(`⏳ *Válido até:* ${expiry}`);
  if (trial.payUrl) lines.push('', `💳 *Pra continuar depois do teste, renove aqui:* ${trial.payUrl}`);
  return lines.join('\n');
}

/**
 * Gera o teste grátis pelos links dos painéis DA EMPRESA (panelConfig vindo do
 * ChatbotConfig dela), roteando pelo app/aparelho:
 * - Zuxo / Slim / Smarters / Media Station X / navegador → Painel Plus (6h com adultos)
 * - UniTV e demais aparelhos/apps → SmartPlay (4h), servidores em ordem até um gerar
 * Retorna null se a empresa não tiver links configurados ou nenhum link gerar
 * (quem chama cai para a API do Sigma)
 */
export async function createTrialViaPanelLinks(
  deviceInput: string,
  deviceKey: string,
  panelConfig?: TrialPanelConfig | null,
): Promise<PanelLinkTrial | null> {
  if (!panelConfig) return null;

  // Zuxo (direto ou via Media Station X) não usa DNS — ver composeTrialMessage
  const hideDns = /zuxo/i.test(deviceInput);

  if (isPlusRoute(deviceInput)) {
    if (!panelConfig.plusUrl) return null;
    const trial = await generateFromLink(panelConfig.plusUrl);
    return trial
      ? { ...trial, panel: 'Painel Plus', reply: composeTrialMessage(trial, hideDns) }
      : null;
  }

  const base = panelConfig.smartplayBase;
  const servers = panelConfig.smartplayServers || [];
  if (!base || !servers.length) return null;

  const kinds = resolveSmartKinds(deviceInput, deviceKey);
  for (const server of servers) {
    // Sem o pacote equivalente neste servidor, usa o TESTE COMPLETO C/ADULTO dele
    const token = kinds.map((k) => server.packages[k]).find(Boolean) || server.packages.completo;
    if (!token) continue;

    const trial = await generateFromLink(`${base}/${token}`);
    if (trial)
      return {
        ...trial,
        panel: 'SmartPlay',
        server: server.name,
        reply: composeTrialMessage(trial, hideDns),
      };
  }

  return null;
}
