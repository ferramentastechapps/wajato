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
  payUrl?: string;
  reply: string; // mensagem pronta do painel para enviar ao cliente
}

const PANEL_TIMEOUT_MS = 20000;

// Painel Plus (Zuxo e navegador/portal slimweb): teste de 6 horas COM ADULTOS
const PLUS_TRIAL_6H_ADULT_URL = 'https://painelplus.site/api/chatbot/0VDVYBzLK3/VpKDaJWRAa';

// SmartPlay (UniTV e demais apps): tokens dos pacotes por servidor (conta MeWeEqaWnN)
// Os servidores são intercambiáveis: se um falhar, o cliente é gerado no próximo.
const SMARTPLAY_BASE = 'https://smartplaypainel.site/api/chatbot/MeWeEqaWnN';

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

// Ordem padrão de tentativa: ZEROUM → Fênix → RocketPlay → Zeus
// Pacotes marcados como (PAGO) nas listas dos painéis ficam de fora de propósito.
const SMARTPLAY_SERVERS: Array<{ name: string; packages: Partial<Record<SmartPackageKind, string>> }> = [
  {
    name: 'ZEROUM',
    packages: {
      completo: 'bOxLA7yWZ7', // TESTE COMPLETO C/ADULTO
      android: 'PkaL4MzDgr', // TESTE 4 HORAS CELULAR ANDROID
      ios: 'lze1584W5K', // TESTE 4 HORAS IPHONE / IOS
      pc: 'Yxl1jMmWMj', // TESTE 4 HORAS PC E NOTEBOOK
      lotus: 'kg516PZDjl', // APP LÓTUS (Roku/Samsung/LG/Android TV)
      rxpurple: 'lze15veL5K', // APP RX PURPLE (Roku/LG)
      xciptv: 'B0VDVVODK3', // XCIPTV PLAYER (Firestick/TV Box/Android)
      unitv: '8241KAvDmx', // UniTv TESTE COMPLETO
    },
  },
  {
    name: 'Fênix',
    packages: {
      completo: 'x2YD0Jv1QP', // TESTE COMPLETO C/ADULTO
      android: 'ZVdWXlaW3q', // TESTE 4 HORAS CELULAR ANDROID
      ios: 'bOxLApy1Z7', // TESTE 4 HORAS IPHONE / IOS
      pc: 'b8K1xaJLvG', // TESTE 4 HORAS PC E NOTEBOOK
      tvbox: '8241KzOWmx', // TESTE 4 HORAS TV ANDROID / TV BOX
      classeplay: '7V01py3LdO', // APP CLASSE PLAY (Roku/Samsung)
      rxpurple: 'bQELoMKWgr', // APP RX PURPLE (Roku/LG)
      xciptv: 'kRXDgKODex', // APP XCIPTV PLAYER
      unitv: 'kRXDgQo1ex', // UniTv TESTE COMPLETO
    },
  },
  {
    name: 'RocketPlay',
    packages: {
      completo: 'b8K1xJKDvG', // TESTE COMPLETO C/ADULTO
      android: 'RYAWRkg1jl', // TESTE 4 HORAS CELULAR ANDROID
      ios: 'aYB1w0nLvm', // TESTE 4 HORAS IPHONE / IOS
      pc: 'nVrW8PrWKa', // TESTE 4 HORAS PC E NOTEBOOK
      tvbox: 'ANKWPnxLPR', // TESTE 4 HORAS TV ANDROID / TV BOX
      lotus: '64vLb2RLgG', // APP LÓTUS (Roku/Samsung/LG/Android TV)
      rxpurple: 'XKjLM4B104', // APP RX PURPLE (Roku/LG)
      unitv: 'BKADdQeWlr', // UniTv TESTE COMPLETO
    },
  },
  {
    name: 'Zeus',
    packages: {
      completo: 'Ar0WZg1a7z', // TESTE COMPLETO C/ADULTO
      android: 'EMeWe54WnN', // TESTE 4 HORAS CELULAR ANDROID
      pc: 'we6WnB7WK8', // TESTE 4 HORAS PC E NOTEBOOK
      tvbox: 'VpKDarkWRA', // TESTE 4 HORAS TV ANDROID / TV BOX
      classeplay: 'ayb1BOPLPR', // APP CLASSE PLAY (Roku/Samsung)
      rxpurple: 'Ar0WZp2La7', // APP RX PURPLE (Roku/LG)
      xciptv: 'rdqLkQpWAE', // APP XCIPTV PLAYER
      unitv: 'ryJDzOYWge', // UniTv TESTE COMPLETO
    },
  },
];

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
      payUrl: json.payUrl || undefined,
      reply: extractReplyText(json),
    };
  } catch (error: any) {
    logger.error('[Panel Links] Falha ao gerar teste pelo link', error);
    return null;
  }
}

/**
 * A mensagem pronta do painel traz as instruções de TODOS os aplicativos
 * (trechos "Preencha o <app> conforme abaixo:"), mas o cliente escolheu UM:
 * fica só o cabeçalho (credenciais e vencimento) + o trecho do aplicativo
 * dele. Portal/navegador não tem trecho: vai só o cabeçalho. Sem trecho
 * correspondente, devolve a mensagem inteira (comportamento anterior).
 */
const APP_SECTION_RULES: Array<{ match: RegExp; section: RegExp | null }> = [
  { match: /zuxo|media station|msx/i, section: /zuxo/i },
  { match: /smarters/i, section: /smarters/i },
  { match: /xciptv|slim|\bxc\b/i, section: /xciptv/i },
  { match: /unitv/i, section: /unitv/i },
  { match: /portal|navegador|browser|webplayer/i, section: null },
];

function filterReplyForApp(reply: string, deviceInput: string): string {
  const starts: number[] = [];
  const re = /^.*Preencha o .+conforme abaixo:.*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply)) !== null) starts.push(m.index);
  if (!starts.length) return reply;

  const rule = APP_SECTION_RULES.find((r) => r.match.test(deviceInput));
  if (!rule) return reply;

  const header = reply.slice(0, starts[0]).trim();
  if (rule.section === null) return header || reply;

  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : reply.length;
    const section = reply.slice(starts[i], end).trim();
    if (rule.section.test(section.split('\n')[0])) {
      return header ? `${header}\n\n${section}` : section;
    }
  }
  return reply;
}

/**
 * Gera o teste grátis pelos links dos painéis, roteando pelo app/aparelho:
 * - Zuxo / Slim / Smarters / Media Station X / navegador → Painel Plus (6h com adultos)
 * - UniTV e demais aparelhos/apps → SmartPlay (4h), servidores em ordem até um gerar
 * Retorna null se nenhum link gerar (quem chama cai para a API do Sigma)
 */
export async function createTrialViaPanelLinks(
  deviceInput: string,
  deviceKey: string,
): Promise<PanelLinkTrial | null> {
  if (isPlusRoute(deviceInput)) {
    const trial = await generateFromLink(PLUS_TRIAL_6H_ADULT_URL);
    return trial
      ? { ...trial, panel: 'Painel Plus', reply: filterReplyForApp(trial.reply, deviceInput) }
      : null;
  }

  const kinds = resolveSmartKinds(deviceInput, deviceKey);
  for (const server of SMARTPLAY_SERVERS) {
    // Sem o pacote equivalente neste servidor, usa o TESTE COMPLETO C/ADULTO dele
    const token = kinds.map((k) => server.packages[k]).find(Boolean) || server.packages.completo;
    if (!token) continue;

    const trial = await generateFromLink(`${SMARTPLAY_BASE}/${token}`);
    if (trial)
      return {
        ...trial,
        panel: 'SmartPlay',
        server: server.name,
        reply: filterReplyForApp(trial.reply, deviceInput),
      };
  }

  return null;
}
