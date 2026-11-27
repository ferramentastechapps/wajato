import { sigma } from './sigma';
import { prisma } from './prisma';
import { logger } from './logger';
import { createTrialViaPanelLinks } from './panel-links';
import { recordTrialSubscription } from './subscriptions';

export interface SigmaActionOutcome {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// Mapeamento de termos de aplicativo/dispositivo para pacotes de teste do Sigma
// Cada entrada tem o ID do pacote e o ID do servidor correspondente
const APP_PACKAGE_MAP: Record<string, { packageId: string; serverId: string; label: string; appName: string }> = {
  roku: {
    packageId: 'ayb1BOPLPR', // APP CLASSE PLAY (TV ROKU - SAMSUNG)
    serverId: 'rdqLkQWAE9',
    label: 'Classe Play (Roku TV)',
    appName: 'Classe Play',
  },
  samsung: {
    packageId: 'ayb1BOPLPR',
    serverId: 'rdqLkQWAE9',
    label: 'Classe Play (Smart TV Samsung)',
    appName: 'Classe Play',
  },
  lg: {
    packageId: '64vLb2RLgG', // APP LOTUS (Roku - Samsung - LG - Android)
    serverId: 'ANKWPKDPRq',
    label: 'Lótus / IBO Player (Smart TV LG)',
    appName: 'Lótus ou IBO Player',
  },
  firestick: {
    packageId: 'rdqLkQpWAE', // XCIPTV PLAYER
    serverId: 'rdqLkQWAE9',
    label: 'XCIPTV Player (Fire Stick)',
    appName: 'XCIPTV Player',
  },
  android: {
    packageId: 'rdqLkQpWAE', // XCIPTV PLAYER
    serverId: 'rdqLkQWAE9',
    label: 'XCIPTV Player (Android)',
    appName: 'XCIPTV Player ou UniTv',
  },
  ios: {
    packageId: 'XKjLM2xD04', // TESTE 4 HORAS IPHONE - IOS
    serverId: 'rdqLkQWAE9',
    label: 'iPhone / iPad (iOS)',
    appName: 'XCIPTV ou UniTv',
  },
  pc: {
    packageId: 'we6WnB7WK8', // TESTE 4 HORAS PC E NOTEBOOK
    serverId: 'rdqLkQWAE9',
    label: 'Computador / Notebook Windows',
    appName: 'IPTV Smarters ou Web Player',
  },
  unitv: {
    packageId: 'ryJDzOYWge', // UniTv TESTE COMPLETO
    serverId: 'rdqLkQWAE9',
    label: 'UniTv',
    appName: 'UniTv',
  },
  default: {
    packageId: 'ayb1BOPLPR',
    serverId: 'rdqLkQWAE9',
    label: 'Classe Play / XCIPTV',
    appName: 'Classe Play ou XCIPTV',
  },
};

/**
 * Detecta o tipo de dispositivo/app mencionado pelo lead
 */
export function detectDeviceType(text: string): string {
  const clean = text.toLowerCase();
  if (clean.includes('roku')) return 'roku';
  if (clean.includes('samsung') || clean.includes('tizen')) return 'samsung';
  if (clean.includes('lg') || clean.includes('webos')) return 'lg';
  if (clean.includes('fire') || clean.includes('stick') || clean.includes('amazon')) return 'firestick';
  if (clean.includes('iphone') || clean.includes('ipad') || clean.includes('ios') || clean.includes('apple')) return 'ios';
  if (clean.includes('pc') || clean.includes('computador') || clean.includes('notebook') || clean.includes('windows')) return 'pc';
  if (clean.includes('unitv')) return 'unitv';
  if (clean.includes('android') || clean.includes('box') || clean.includes('celular') || clean.includes('xiaomi') || clean.includes('tv box')) return 'android';
  return 'default';
}

// Números isentos do bloqueio de teste duplicado (ex.: o número do dono, para testar o agente)
// Configurável via env TRIAL_EXEMPT_PHONES (separados por vírgula); padrão: número pessoal do dono
const TRIAL_EXEMPT_PHONES = new Set(
  (process.env.TRIAL_EXEMPT_PHONES || '5516994201706')
    .split(',')
    .map((p) => p.replace(/\D/g, ''))
    .filter(Boolean),
);

/**
 * 1. Gerador Automático de Teste Grátis no Sigma
 */
export async function createTrialForLead(phone: string, deviceInput?: string): Promise<SigmaActionOutcome> {
  const normPhone = phone.replace(/\D/g, '');
  const deviceKey = detectDeviceType(deviceInput || '');
  const target = APP_PACKAGE_MAP[deviceKey] || APP_PACKAGE_MAP.default;

  try {
    // Evita duplicar se o contato já gerou um teste (números isentos nunca bloqueiam)
    const existing = await (prisma.contact as any).findUnique({ where: { phone: normPhone } });
    if (!TRIAL_EXEMPT_PHONES.has(normPhone) && existing?.tags?.includes('teste-gerado')) {
      return {
        success: false,
        message: 'Você já gerou um teste grátis recente em nosso sistema.',
      };
    }

    // Primeiro tenta gerar pelos links dos painéis (Painel Plus / SmartPlay);
    // se nenhum link gerar, cai para a API do Sigma mais abaixo (reserva)
    const linkTrial = await createTrialViaPanelLinks(deviceInput || '', deviceKey);
    if (linkTrial) {
      // Registra tag no contato local (mesmo registro do fluxo do Sigma)
      const contact = await (prisma.contact as any).upsert({
        where: { phone: normPhone },
        create: {
          phone: normPhone,
          tags: ['teste-gerado', `app-${deviceKey}`],
          notes: `Login ${linkTrial.panel}: ${linkTrial.username}`,
        },
        update: {
          tags: { push: ['teste-gerado', `app-${deviceKey}`] },
          notes: `Login ${linkTrial.panel}: ${linkTrial.username}`,
        },
      });

      // Auto-registro do teste como assinatura (status 'trial' — nunca é avisado)
      await recordTrialSubscription({
        phone: normPhone,
        contactId: contact?.id,
        panel: linkTrial.panel,
        username: linkTrial.username,
        planName: linkTrial.packageName,
        connections: 1,
        expiresAt: linkTrial.expiresAt,
        payUrl: linkTrial.payUrl,
      });

      logger.info('[Sigma Agent] Teste criado via link de painel', {
        phone: normPhone,
        username: linkTrial.username,
        panel: linkTrial.panel,
        server: linkTrial.server,
      });

      return {
        success: true,
        // Mensagem pronta do painel (não usar a montada do Sigma: a duração muda por painel)
        message: linkTrial.reply,
        data: {
          username: linkTrial.username,
          password: linkTrial.password,
          serverDns: linkTrial.dns,
          expiresAt: linkTrial.expiresAt,
          panel: linkTrial.panel,
          server: linkTrial.server,
        },
      };
    }

    // Cria cliente de teste no Sigma (senha com mínimo 8 caracteres exigido pela API)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const username = `teste${normPhone.slice(-4)}${randomSuffix}`;
    const password = `${Math.floor(10000000 + Math.random() * 90000000)}`;

    const newCustomer = await sigma.customers.create({
      username,
      password,
      server_id: target.serverId,
      package_id: target.packageId,
      connections: 1,
      notes: `Lead WhatsApp: ${normPhone} (App: ${target.label})`,
    });

    // Registra tag no contato local
    const contact = await (prisma.contact as any).upsert({
      where: { phone: normPhone },
      create: {
        phone: normPhone,
        tags: ['teste-gerado', `app-${deviceKey}`],
        notes: `Login Sigma: ${username}`,
      },
      update: {
        tags: { push: ['teste-gerado', `app-${deviceKey}`] },
        notes: `Login Sigma: ${username}`,
      },
    });

    // Auto-registro do teste como assinatura (status 'trial' — nunca é avisado)
    await recordTrialSubscription({
      phone: normPhone,
      contactId: contact?.id,
      panel: 'SmartPlay',
      username,
      planName: target.label,
      connections: 1,
      expiresAt: newCustomer.expires_at,
      payUrl: null,
    });

    logger.info('[Sigma Agent] Teste criado com sucesso', { phone: normPhone, username });

    const serverDns = (newCustomer as any).m3u_url
      ? new URL((newCustomer as any).m3u_url).origin
      : 'http://td.ntxv8s.site';

    return {
      success: true,
      message: `✅ *Seu Teste Grátis de 4 Horas está liberado!*

📱 *Aplicativo:* ${target.label}
👤 *Usuário:* \`${username}\`
🔑 *Senha:* \`${password}\`
🌐 *URL / DNS:* \`${serverDns}\`
⏳ *Duração:* 4 horas

Coloque esses dados no aplicativo que você abriu. Se tiver qualquer dúvida, é só me chamar aqui!`,
      data: {
        id: newCustomer.id,
        username,
        password,
        serverDns,
        expiresAt: newCustomer.expires_at,
      },
    };
  } catch (error: any) {
    logger.error('[Sigma Agent] Erro ao criar teste no Sigma', error);
    return {
      success: false,
      message: 'Não foi possível gerar seu teste agora no sistema. Um de nossos atendentes irá te enviar manualmente em instantes.',
    };
  }
}

/**
 * 2. Consultar Vencimento e Status de Cliente
 */
export async function checkCustomerExpiry(phone: string): Promise<SigmaActionOutcome> {
  const normPhone = phone.replace(/\D/g, '');
  try {
    // Busca cliente no Sigma com busca parcial pelo final do número
    const searchNumber = normPhone.slice(-6);
    const list = await sigma.customers.list({
      username: searchNumber,
      per_page: 5,
    });

    const customer = list.data?.find((c) => c.notes?.includes(normPhone) || c.username.includes(searchNumber));
    if (!customer) {
      return {
        success: false,
        message: 'Não encontrei uma assinatura ativa com o seu número de WhatsApp cadastrado. Me informe seu nome de usuário da assinatura para eu consultar?',
      };
    }

    const expiry = new Date(customer.expires_at);
    const formattedExpiry = expiry.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const isExpired = expiry.getTime() < Date.now();

    return {
      success: true,
      message: isExpired
        ? `⚠️ Seu acesso (*${customer.username}*) venceu no dia *${formattedExpiry}*. Deseja que eu gere o Pix de renovação para reativar seu sinal agora?`
        : `📅 O seu acesso (*${customer.username}*) está ativo e vence no dia *${formattedExpiry}*. Se precisar de algo ou quiser renovar antecipado, estou à disposição!`,
      data: {
        username: customer.username,
        expiresAt: customer.expires_at,
        status: customer.status,
      },
    };
  } catch (error: any) {
    logger.error('[Sigma Agent] Erro ao consultar cliente no Sigma', error);
    return {
      success: false,
      message: 'Não consegui consultar seu vencimento no sistema agora. Me informe seu usuário ou aguarde um momento.',
    };
  }
}

/**
 * 3. Ressincronizar Conexão / Linha (Suporte Técnico)
 */
export async function resyncCustomer(phone: string): Promise<SigmaActionOutcome> {
  const normPhone = phone.replace(/\D/g, '');
  try {
    const searchNumber = normPhone.slice(-6);
    const list = await sigma.customers.list({
      username: searchNumber,
      per_page: 5,
    });

    const customer = list.data?.find((c) => c.notes?.includes(normPhone) || c.username.includes(searchNumber));
    if (!customer) {
      return {
        success: false,
        message: 'Não localizei seu cadastro pelo número. Me passe seu usuário de login para eu reiniciar sua linha no servidor.',
      };
    }

    await sigma.customers.resync(customer.id);
    logger.info('[Sigma Agent] Linha ressincronizada', { phone: normPhone, username: customer.username });

    return {
      success: true,
      message: `🔄 *Sua conexão foi ressincronizada com sucesso!*

Reinicie o aplicativo na sua TV ou aparelho e teste novamente. A rota foi atualizada para garantir estabilidade máxima.`,
    };
  } catch (error: any) {
    logger.error('[Sigma Agent] Erro ao ressincronizar no Sigma', error);
    return {
      success: false,
      message: 'Não consegui ressincronizar automaticamente seu login agora. Por favor, reinicie seu aplicativo ou modem por 1 minuto.',
    };
  }
}
