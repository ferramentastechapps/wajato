import { sigma } from './sigma';
import { prisma } from './prisma';
import { logger } from './logger';

export interface SigmaActionOutcome {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// Mapeamento de termos de aplicativo/dispositivo para pacotes de teste do Sigma
// Cada entrada tem o ID do pacote e o ID do servidor correspondente
const APP_PACKAGE_MAP: Record<string, { packageId: string; serverId: string; label: string }> = {
  roku: {
    packageId: 'ayb1BOPLPR', // APP CLASSE PLAY (TV ROKU - SAMSUNG)
    serverId: 'rdqLkQWAE9',
    label: 'Classe Play (Roku TV)',
  },
  samsung: {
    packageId: 'ayb1BOPLPR',
    serverId: 'rdqLkQWAE9',
    label: 'Classe Play (Smart TV Samsung)',
  },
  lg: {
    packageId: '64vLb2RLgG', // APP LOTUS (Roku - Samsung - LG - Android)
    serverId: 'ANKWPKDPRq',
    label: 'Lótus / IBO Player (Smart TV LG)',
  },
  firestick: {
    packageId: 'rdqLkQpWAE', // XCIPTV PLAYER
    serverId: 'rdqLkQWAE9',
    label: 'XCIPTV Player (Fire Stick)',
  },
  android: {
    packageId: 'EMeWe54WnN', // TESTE 4 HORAS CELULAR ANDROID
    serverId: 'rdqLkQWAE9',
    label: 'Celular / TV Box Android',
  },
  ios: {
    packageId: 'XKjLM2xD04', // TESTE 4 HORAS IPHONE - IOS
    serverId: 'rdqLkQWAE9',
    label: 'iPhone / iPad (iOS)',
  },
  pc: {
    packageId: 'we6WnB7WK8', // TESTE 4 HORAS PC E NOTEBOOK
    serverId: 'rdqLkQWAE9',
    label: 'Computador / Notebook Windows',
  },
  unitv: {
    packageId: 'ryJDzOYWge', // UniTv TESTE COMPLETO
    serverId: 'rdqLkQWAE9',
    label: 'UniTv',
  },
  default: {
    packageId: 'ZVdWXPpW3q', // MultServe TESTE COMPLETO
    serverId: 'rdqLkQWAE9',
    label: 'Teste Completo MultServe',
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

/**
 * 1. Gerador Automático de Teste Grátis no Sigma
 */
export async function createTrialForLead(phone: string, deviceInput?: string): Promise<SigmaActionOutcome> {
  const normPhone = phone.replace(/\D/g, '');
  const deviceKey = detectDeviceType(deviceInput || '');
  const target = APP_PACKAGE_MAP[deviceKey] || APP_PACKAGE_MAP.default;

  try {
    // Evita duplicar se já gerou nas últimas 24h
    const existing = await (prisma.contact as any).findUnique({ where: { phone: normPhone } });
    if (existing?.tags?.includes('teste-gerado')) {
      return {
        success: false,
        message: 'Você já gerou um teste grátis recente em nosso sistema.',
      };
    }

    // Cria cliente de teste no Sigma
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const username = `teste${normPhone.slice(-4)}${randomSuffix}`;
    const password = `${Math.floor(100000 + Math.random() * 900000)}`;

    const newCustomer = await sigma.customers.create({
      username,
      password,
      server_id: target.serverId,
      package_id: target.packageId,
      connections: 1,
      notes: `Lead WhatsApp: ${normPhone} (App: ${target.label})`,
    });

    // Registra tag no contato local
    await (prisma.contact as any).upsert({
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

    logger.info('[Sigma Agent] Teste criado com sucesso', { phone: normPhone, username });

    return {
      success: true,
      message: `✅ *Seu Teste Grátis foi criado com sucesso!*

📱 *Aplicativo indicado:* ${target.label}
👤 *Usuário:* \`${username}\`
🔑 *Senha:* \`${password}\`
⏳ *Duração:* 4 horas

Aproveite todos os canais, filmes e séries! Se precisar de ajuda para configurar no seu aparelho, é só me chamar.`,
      data: {
        id: newCustomer.id,
        username,
        password,
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
