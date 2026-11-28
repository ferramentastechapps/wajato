import { prisma } from './prisma';
import { evolutionApi } from './evolution';
import { isWithinBusinessHours } from './warmup-schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isLunaProvider, callLunaChatCompletions } from './luna-ai';
import { logger } from './logger';
import { lidResolver } from './lid-resolver';
import {
  getContactMemory,
  formatMemoryForPrompt,
  summarizeOlderHistory,
  extractAndUpdateMemoryAsync,
  splitMessageIntoNaturalParts,
} from './chatbot-memory';

import { redisConnection } from './redis';
import { getLocalMessages } from './chat-store';
import {
  createTrialForLead,
  checkCustomerExpiry,
  resyncCustomer,
} from './sigma-agent';

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface ProcessorOptions {
  /** companyId prioritário vindo da campanha associada ao contato (via message-worker) */
  companyId?: string | null;
}

// ── Rate limiting e Cooldown pós-campanha ─────────────────────────────────────
// Evita que o chatbot responda múltiplas vezes em sequência rápida ao mesmo contato
// ou interfira com mensagens subsequentes quando o cliente responde ao gancho de uma campanha.

const lastResponseMap = new Map<string, number>();
const inFlightPhones = new Set<string>();
const RATE_LIMIT_MS = 4_000; // 4 segundos de cooldown contra cliques duplos imediatos
const HOOK_COOLDOWN_SECONDS = 90; // 90 segundos de resguardo após resposta ao gancho de campanha
const REDIS_COOLDOWN_PREFIX = 'wajato:hook_cooldown:';

/**
 * Ativa o cooldown do chatbot para um telefone (usado após envio de template pós-gancho)
 */
export async function setChatbotCooldown(phone: string, durationSeconds: number = HOOK_COOLDOWN_SECONDS): Promise<void> {
  const normPhone = phone.replace(/\D/g, '');
  lastResponseMap.set(normPhone, Date.now() + (durationSeconds * 1000) - RATE_LIMIT_MS);
  try {
    await redisConnection.set(`${REDIS_COOLDOWN_PREFIX}${normPhone}`, '1', 'EX', durationSeconds);
  } catch (err: any) {
    logger.warn?.('[Chatbot] Erro ao registrar cooldown no Redis', { phone: normPhone, error: err?.message });
  }
}

/**
 * Verifica se um telefone está no período de resguardo pós-gancho/disparo de campanha
 */
export async function isPhoneInCampaignCooldown(phone: string): Promise<boolean> {
  const normPhone = phone.replace(/\D/g, '');

  // 1. Memória local
  const last = lastResponseMap.get(normPhone);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    return true;
  }

  // 2. Redis
  try {
    const exists = await redisConnection.exists(`${REDIS_COOLDOWN_PREFIX}${normPhone}`);
    if (exists === 1) return true;
  } catch {}

  // 3. Banco de dados (se o contato respondeu ao gancho de campanha recentemente)
  try {
    const cutoff = new Date(Date.now() - HOOK_COOLDOWN_SECONDS * 1000);
    const recentRepliedLog = await prisma.messageLog.findFirst({
      where: {
        contact: { phone: normPhone },
        hookStatus: 'REPLIED',
        hookRepliedAt: { gte: cutoff },
      },
      select: { id: true },
    });
    if (recentRepliedLog) {
      try {
        await redisConnection.set(`${REDIS_COOLDOWN_PREFIX}${normPhone}`, '1', 'EX', 30);
      } catch {}
      return true;
    }
  } catch {}

  return false;
}

function isRateLimited(phone: string): boolean {
  const normPhone = phone.replace(/\D/g, '');
  const last = lastResponseMap.get(normPhone);
  if (!last) return false;
  return Date.now() - last < RATE_LIMIT_MS;
}

function markResponded(phone: string): void {
  const normPhone = phone.replace(/\D/g, '');
  lastResponseMap.set(normPhone, Date.now());
  // Limpeza periódica para não acumular memória indefinidamente
  if (lastResponseMap.size > 5000) {
    const cutoff = Date.now() - RATE_LIMIT_MS * 10;
    for (const [k, v] of lastResponseMap.entries()) {
      if (v < cutoff) lastResponseMap.delete(k);
    }
  }
}

export function _resetRateLimits(): void {
  lastResponseMap.clear();
  inFlightPhones.clear();
}

// ── Helpers de matching de regras ─────────────────────────────────────────────

function matchesRule(cleanText: string, rule: any): boolean {
  const triggerClean = rule.trigger.trim().toLowerCase();

  switch (rule.matchType) {
    case 'EXACT':
      return cleanText === triggerClean;
    case 'CONTAINS':
      return cleanText.includes(triggerClean);
    case 'STARTS_WITH':
      return cleanText.startsWith(triggerClean);
    case 'REGEX':
      try {
        return new RegExp(rule.trigger, 'i').test(cleanText);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

// ── Opt-out detection expandido ────────────────────────────────────────────────

const OPT_OUT_PATTERNS = [
  /^(sair|parar|cancelar|stop|remover|chega|basta)$/i,
  /\b(descadastrar|desinscrever|me\s+remove|me\s+tira|n[aã]o\s+quero|n[aã]o\s+me\s+mande|para\s+de\s+mandar|n[aã]o\s+receber|me\s+retira)\b/i,
];

function detectOptOut(text: string): boolean {
  const norm = text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return OPT_OUT_PATTERNS.some((p) => p.test(norm));
}

// ── Opt-in detection (re-engajamento) ─────────────────────────────────────────

const OPT_IN_PATTERNS = [
  /\b(quero\s+receber|me\s+cadastra|cadastrar\s+de\s+volta|pode\s+mandar|aceito\s+mensagens|ativa\s+de\s+novo|reativar|sim\s+quero\s+receber)\b/i,
];

function detectOptIn(text: string): boolean {
  const norm = text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return OPT_IN_PATTERNS.some((p) => p.test(norm));
}

// ── Aplicar tags ao contato ────────────────────────────────────────────────────

async function applyTagsToContact(phone: string, tagsToAdd: string[]): Promise<void> {
  if (!tagsToAdd.length) return;
  try {
    const contact = await (prisma.contact as any).findUnique({ where: { phone }, select: { id: true, tags: true } });
    if (!contact) return;
    const existing: string[] = contact.tags || [];
    const merged = Array.from(new Set([...existing, ...tagsToAdd]));
    await (prisma.contact as any).update({ where: { phone }, data: { tags: merged } });
  } catch (err: any) {
    logger.warn?.('[Chatbot] Erro ao aplicar tags ao contato', { phone, tags: tagsToAdd, error: err?.message });
  }
}

// ── Remover tag do contato ─────────────────────────────────────────────────────

async function removeTagFromContact(phone: string, tagToRemove: string): Promise<void> {
  try {
    const contact = await (prisma.contact as any).findUnique({ where: { phone }, select: { id: true, tags: true } });
    if (!contact) return;
    const filtered = (contact.tags || []).filter((t: string) => t !== tagToRemove);
    await (prisma.contact as any).update({ where: { phone }, data: { tags: filtered } });
  } catch (err: any) {
    logger.warn?.('[Chatbot] Erro ao remover tag do contato', { phone, tag: tagToRemove, error: err?.message });
  }
}

// ── Resolver empresa para o contato ───────────────────────────────────────────

async function resolveCompany(
  contactRecord: any,
  overrideCompanyId?: string | null,
  instanceName?: string
): Promise<any> {
  try {
    // 0. Instância WhatsApp conectada a uma empresa específica
    if (instanceName) {
      const inst = await prisma.whatsAppInstance.findUnique({
        where: { name: instanceName },
        include: { company: true },
      });
      if (inst?.company) return inst.company;
    }

    // 1. Prioridade: companyId passado como override (ex: vindo da campanha mais recente)
    if (overrideCompanyId) {
      const c = await prisma.company.findUnique({ where: { id: overrideCompanyId } });
      if (c) return c;
    }

    // 2. companyId do contato (populado pelo message-worker após envio de campanha)
    if (contactRecord?.companyId) {
      const c = await prisma.company.findUnique({ where: { id: contactRecord.companyId } });
      if (c) return c;
    }

    // 3. Última campanha com empresa associada
    if (contactRecord?.id) {
      const lastLog = await prisma.messageLog.findFirst({
        where: { contactId: contactRecord.id, campaign: { companyId: { not: null } } },
        orderBy: { updatedAt: 'desc' },
        include: { campaign: { include: { company: true } } },
      });
      if (lastLog?.campaign?.company) return lastLog.campaign.company;
    }

    // 4. Empresa padrão / primeira empresa
    const def = await prisma.company.findFirst({ where: { isDefault: true } });
    if (def) return def;
    return await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  } catch (err: any) {
    logger.warn?.('[Chatbot] Erro ao resolver empresa', { error: err?.message });
    return null;
  }
}

// ── Resolver configuração efetiva do chatbot ──────────────────────────────────
// Prioridade: config própria da empresa vinculada à instância que recebeu a
// mensagem. Se a instância não tiver empresa, ou a empresa ainda não tiver
// config própria, usa a config GLOBAL (linha id 'global', companyId nulo).

async function resolveChatbotConfig(instanceName?: string): Promise<any> {
  try {
    if (instanceName) {
      const inst = await prisma.whatsAppInstance.findUnique({
        where: { name: instanceName },
        select: { companyId: true },
      });
      if (inst?.companyId) {
        const companyConfig = await prisma.chatbotConfig.findUnique({
          where: { companyId: inst.companyId },
        });
        if (companyConfig) return companyConfig;
      }
    }
  } catch (err: any) {
    logger.warn?.('[Chatbot] Erro ao resolver config da empresa da instância', { instanceName, error: err?.message });
  }

  let config = await prisma.chatbotConfig.findUnique({ where: { id: 'global' } });

  if (!config) {
    config = await prisma.chatbotConfig.create({
      data: {
        id: 'global',
        aiEnabled: false,
        aiContext: 'Você é um atendente humano da nossa equipe de suporte. Seu objetivo é ajudar o cliente de forma prestativa, educada e natural.',
        businessHoursOnly: false,
        startHour: 8,
        endHour: 18,
      },
    });
  }

  return config;
}

// ── Processor principal ───────────────────────────────────────────────────────

/**
 * Processa mensagens recebidas do webhook e executa a lógica do chatbot auto-responder.
 * @param phone        Telefone normalizado do remetente
 * @param text         Texto da mensagem recebida
 * @param instanceName Nome da instância WhatsApp que recebeu a mensagem
 * @param opts         Opções adicionais (companyId preferencial)
 */
export async function handleChatbotIncoming(
  phone: string,
  text: string,
  instanceName: string,
  opts: ProcessorOptions = {}
): Promise<void> {
  const normPhone = phone.replace(/\D/g, '');
  const cleanText = text.trim().toLowerCase();
  if (!cleanText) return;

  // ── Prevenir requisições simultâneas para o mesmo telefone ────────────────
  if (inFlightPhones.has(normPhone)) {
    logger.info('[Chatbot] Mensagem ignorada — processamento já em andamento para este telefone', { phone: normPhone });
    return;
  }

  // ── Verificar se o contato está na janela de cooldown pós-gancho/disparo ──
  if (await isPhoneInCampaignCooldown(normPhone)) {
    logger.info('[Chatbot] Mensagem ignorada — contato em janela de cooldown pós-disparo de gancho', { phone: normPhone, text });
    return;
  }

  inFlightPhones.add(normPhone);

  try {
    // ── Verificar pausa por interação manual ──────────────────────────────────
    let contactName: string | null = null;
    let contactRecord: any = null;

    try {
      const contact = await (prisma.contact as any).findUnique({ where: { phone } });
      contactRecord = contact;
      if (contact?.name) contactName = contact.name;

      if (contact?.chatbotPausedUntil && contact.chatbotPausedUntil > new Date()) {
        logger.info('Chatbot ignorado — pausado por resposta manual', { phone, pausedUntil: contact.chatbotPausedUntil });
        return;
      }
    } catch (pauseCheckErr: any) {
      logger.warn?.('[Chatbot] Aviso: falha ao verificar pausa do chatbot', { phone, error: pauseCheckErr?.message });
    }

    // ── Verificar opt-out (não responder a contatos que optaram por sair) ─────
    if (contactRecord?.optOut) {
      // Detecta se é uma mensagem de opt-in (re-engajamento)
      if (detectOptIn(text)) {
        try {
          await (prisma.contact as any).update({
            where: { phone },
            data: { optOut: false, optOutAt: null },
          });
          await removeTagFromContact(phone, 'opt-out');

          const company = await resolveCompany(contactRecord, opts.companyId, instanceName);
          const companyName = company?.name || 'nossa equipe';
          await evolutionApi.sendTextMessage(
            instanceName,
            phone,
            `✅ Oi! Que bom que voltou 😊 Você foi reativado em nossa lista da *${companyName}* e poderá receber novidades novamente. Se precisar de algo, é só falar!`
          );
          logger.info('[Chatbot] Opt-in detectado — contato reativado', { phone });
        } catch (optInErr: any) {
          logger.error('[Chatbot] Erro ao processar opt-in', { phone, error: optInErr?.message });
        }
      }
      return;
    }

    // ── Rate limiting ─────────────────────────────────────────────────────────
    if (isRateLimited(phone)) {
      logger.info('[Chatbot] Rate limit ativo — mensagem ignorada', { phone });
      return;
    }

    // ── Obter configuração efetiva do chatbot (empresa da instância → global) ──
    const config = await resolveChatbotConfig(instanceName);

    // ── Verificar horário de atendimento ──────────────────────────────────────
    if (config.businessHoursOnly) {
      const withinHours = isWithinBusinessHours(config.startHour, config.endHour);
      if (!withinHours) {
        logger.info('Mensagem ignorada fora do horário de atendimento', { phone });
        return;
      }
    }

    // ── Buscar regras ativas, ordenadas por prioridade ────────────────────────
    const rules = await (prisma.chatbotRule as any).findMany({
      where: { isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    // ── Encontrar primeira regra correspondente ───────────────────────────────
    let matchedRule: any = null;
    for (const rule of rules) {
      if (matchesRule(cleanText, rule)) {
        matchedRule = rule;
        break;
      }
    }

    // ── Executar ação da regra ────────────────────────────────────────────────
    if (matchedRule) {
      logger.info('Regra de chatbot correspondente encontrada', {
        trigger: matchedRule.trigger,
        action: matchedRule.action,
        phone,
      });

      const action = matchedRule.action || 'REPLY';

      // Aplicar auto-tags se configuradas
      if (matchedRule.autoTags?.length > 0) {
        await applyTagsToContact(phone, matchedRule.autoTags);
      }

      // Ação: TAG_ONLY — só aplica tags, sem resposta
      if (action === 'TAG_ONLY') {
        await prisma.chatbotLog.create({
          data: { phone, messageIn: text, messageOut: '[TAG_ONLY]', source: 'RULE' },
        });
        markResponded(phone);
        return;
      }

      // Ação: OPTOUT_AND_REPLY — registra opt-out e responde
      if (action === 'OPTOUT_AND_REPLY') {
        try {
          await (prisma.contact as any).upsert({
            where: { phone },
            update: { optOut: true, optOutAt: new Date() },
            create: { phone, name: contactName || null, optOut: true, optOutAt: new Date() },
          });
          await applyTagsToContact(phone, ['opt-out']);
          logger.info('[Chatbot] Opt-out via regra registrado', { phone, trigger: matchedRule.trigger });
        } catch (optErr: any) {
          logger.error('[Chatbot] Erro ao registrar opt-out via regra', { phone, error: optErr?.message });
        }
      }

      // Envia resposta (REPLY, TAG_AND_REPLY, OPTOUT_AND_REPLY)
      if (matchedRule.response?.trim()) {
        if (matchedRule.imageUrl) {
          await evolutionApi.sendMediaMessage(instanceName, phone, matchedRule.imageUrl, 'image', matchedRule.response);
        } else {
          await evolutionApi.sendTextMessage(instanceName, phone, matchedRule.response);
        }
      }

      await prisma.chatbotLog.create({
        data: { phone, messageIn: text, messageOut: matchedRule.response || '', source: 'RULE' },
      });
      markResponded(phone);
      return;
    }

    // ── Verificar opt-in inline (sem regra explícita) ─────────────────────────
    if (detectOptIn(text) && !contactRecord?.optOut) {
      // Contato não estava em opt-out, mas mandou uma mensagem de re-engajamento
      // Apenas aplica tag de engajamento
      await applyTagsToContact(phone, ['interessado']);
    }

    // ── IA: resposta quando nenhuma regra bateu ───────────────────────────────
    if (!config.aiEnabled) return;

    logger.info('Nenhuma regra encontrada. Gerando resposta com IA', { phone });

    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error('Chave de API da IA não configurada');
      return;
    }

    // Resolver empresa
    const company = await resolveCompany(contactRecord, opts.companyId, instanceName);

    // Formatar base de conhecimento da empresa
    let companyKnowledgeSection = '';
    if (company) {
      const sections: string[] = [];
      sections.push(`EMPRESA: ${company.name}${company.segment ? ` (Segmento: ${company.segment})` : ''}`);
      if (company.description) sections.push(`- Sobre a Empresa: ${company.description}`);
      if (company.productsServices) sections.push(`- Catálogo de Produtos, Serviços e Preços:\n${company.productsServices}`);
      if (company.policies) sections.push(`- Formas de Pagamento, Prazos e Políticas:\n${company.policies}`);
      if (company.faq) sections.push(`- Perguntas e Respostas Frequentes (FAQ):\n${company.faq}`);
      if (company.contactInfo) sections.push(`- Canais de Contato e Atendente Humano:\n${company.contactInfo}`);
      if (company.toneOfVoice) sections.push(`- Tom de Voz Desejado: ${company.toneOfVoice}`);
      if (company.aiInstructions) sections.push(`- Orientações Especiais para a IA:\n${company.aiInstructions}`);

      companyKnowledgeSection = `
[BASE DE CONHECIMENTO OFICIAL DA EMPRESA - USE ESTAS INFORMAÇÕES EXATAS PARA RESPONDER O CLIENTE COM PRECISÃO]:
${sections.join('\n\n')}
`;
    }

    // Memória persistente do contato (Redis)
    const contactMemory = await getContactMemory(phone);
    const memoryPromptSection = formatMemoryForPrompt(contactMemory);

    // Histórico recente de chat
    let historyPrompt = '';
    try {
      const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
      const messages = await evolutionApi.findMessages(instanceName, jid, 12);
      let finalMessages = Array.isArray(messages) ? messages : [];

      let otherJid = null;
      if (jid.endsWith('@s.whatsapp.net')) {
        const phoneNum = jid.split('@')[0];
        const lid = lidResolver.getLid(phoneNum);
        if (lid) otherJid = lid;
      }

      if (otherJid) {
        try {
          const otherMessages = await evolutionApi.findMessages(instanceName, otherJid, 12);
          if (Array.isArray(otherMessages) && otherMessages.length > 0) {
            const merged = [...finalMessages, ...otherMessages];
            const unique = new Map<string, any>();
            for (const msg of merged) {
              const id = msg.key?.id;
              if (id) {
                if (!unique.has(id) || (msg.messageTimestamp && !unique.get(id).messageTimestamp)) {
                  unique.set(id, msg);
                }
              }
            }
            finalMessages = Array.from(unique.values());
          }
        } catch {}
      }

      // Evolution Go não devolve as mensagens do chat (findMessages volta vazio):
      // sem isso o robô respondia cada mensagem "do zero", sem lembrar da conversa.
      // O histórico local (ChatMessage, o mesmo da tela de Conversas) cobre esse caso.
      if (finalMessages.length === 0) {
        try {
          const localMain = await getLocalMessages(instanceName, jid, 12);
          let localMerged: any[] = Array.isArray(localMain) ? localMain : [];
          if (otherJid) {
            const localOther = await getLocalMessages(instanceName, otherJid, 12);
            if (Array.isArray(localOther) && localOther.length > 0) {
              localMerged = [...localMerged, ...localOther];
            }
          }
          if (localMerged.length > 0) finalMessages = localMerged;
        } catch {}
      }

      const sortedMessages = finalMessages.sort((a: any, b: any) =>
        Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0)
      );

      const normalizedList = sortedMessages
        .map((m: any) => {
          const fromMe = Boolean(m.key?.fromMe);
          const msgText = m.message?.conversation || m.message?.extendedTextMessage?.text || m.text || '';
          if (!msgText.trim()) return null;
          return { role: (fromMe ? 'model' : 'user') as 'model' | 'user', text: msgText.trim() };
        })
        .filter(Boolean) as Array<{ role: 'model' | 'user'; text: string }>;

      if (normalizedList.length > 5) {
        const olderPart = normalizedList.slice(0, normalizedList.length - 4);
        const recentPart = normalizedList.slice(normalizedList.length - 4);
        const summary = await summarizeOlderHistory(olderPart, apiKey);
        const recentText = recentPart.map((m) => (m.role === 'model' ? `Você: ${m.text}` : `Cliente: ${m.text}`)).join('\n');
        historyPrompt = summary ? `[Resumo do início do diálogo]: ${summary}\n\n[Mensagens mais recentes]:\n${recentText}` : recentText;
      } else {
        historyPrompt = normalizedList.map((m) => (m.role === 'model' ? `Você: ${m.text}` : `Cliente: ${m.text}`)).join('\n');
      }
    } catch (err) {
      // Fallback para ChatbotLog
      const recentLogs = await prisma.chatbotLog.findMany({
        where: { phone },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });
      historyPrompt = recentLogs.reverse().map((l) => `Cliente: ${l.messageIn}\nVocê: ${l.messageOut}`).join('\n');
    }

    const systemContext = config.aiContext;

    const humanEmulationRules = `
[REGRAS CRÍTICAS DE COMPORTAMENTO - SIGA RIGOROSAMENTE]:
1. Você DEVE se comportar como uma pessoa real (atendente humano da nossa equipe).
2. NUNCA diga ou dê a entender que você é um robô, inteligência artificial, assistente virtual, chatbot, assistente automático, LLM ou algoritmo.
3. Se o cliente perguntar se você é um robô ou chatbot, negue de forma descontraída e natural (Ex: "Não, sou de carne e osso mesmo haha! Como posso te ajudar?").
4. Escreva de forma natural, curta, direta e amigável:
   - Use parágrafos pequenos.
   - Use emojis de forma moderada e natural (ex: 👍, 😊, 😉).
   - Não use listas numeradas formais ou bullet points a menos que o cliente peça. Fale como uma pessoa conversando no WhatsApp.
   - Evite respostas longas ou formais demais. Seja objetivo e prestativo.
`;

    const sigmaToolsInstructions = `
[FLUXO DE ATENDIMENTO E TESTE GRÁTIS - SIGA RIGOROSAMENTE]:
Você é o atendente de vendas e suporte de streaming da nossa equipe no WhatsApp.
ESTILO: mensagens CURTAS, o mínimo de texto possível, UMA pergunta ou passo por vez. Nunca despeje todas as instruções de uma vez: só ensine a configurar o aplicativo que o cliente escolheu, e só depois que ele baixar.
NUNCA fale a duração do teste (nada de "4 horas", "6 horas", "12 horas"). Diga apenas que é um TESTE GRÁTIS.

PASSO 1: ABERTURA
Quando o cliente chamar ou demonstrar interesse, responda EXATAMENTE assim (uma mensagem só, com as quebras de linha):
"Olá, tudo bem? 😊

Pra liberar seu teste grátis, me conta: onde você pretende assistir? Na TV, celular ou outro dispositivo?

E você já utiliza algum aplicativo para assistir ou seria sua primeira experiência?"
Com a resposta dele:
- Se ele disser que já usa um aplicativo, trabalhe com a escolha dele: se ele não falar QUAL aplicativo usa, pergunte qual é. Se o aplicativo já estiver instalado naquele aparelho, pule o PASSO 2 e gere o teste direto (PASSO 3); se não estiver instalado, siga o PASSO 2 só com o caminho daquele aplicativo naquele aparelho.
- Se for a primeira experiência dele ou ele não tiver aplicativo, siga a indicação do aparelho no PASSO 2 (o Zuxo é sempre a primeira opção).
- Se faltar uma das duas informações (aplicativo ou aparelho), pergunte SÓ a que faltou.
- NUNCA gere o teste no PASSO 1!

PASSO 2: MANDAR BAIXAR O APLICATIVO
SEMPRE mande baixar o aplicativo ANTES de gerar o teste (é o download que confirma se tem o aplicativo pra plataforma dele). Exceção: se o cliente já usa e já tem o aplicativo instalado naquele aparelho (resposta da abertura), gere direto pelo PASSO 3.
O Zuxo é SEMPRE a primeira opção em qualquer aparelho. Só ofereça os outros se o Zuxo não der certo ou o cliente não quiser usar o Zuxo.
- Celular: pergunte se é Apple ou Android.
  - iPhone (Apple): responda EXATAMENTE assim: "No iPhone, o Zuxo é nossa primeira opção 😊 Se preferir, também dá pra usar o *Smarters Player Lite* ou assistir pelo navegador" (SEM link nenhum nessa mensagem). Conforme o que ele responder, mande SÓ como baixar o aplicativo que ele escolheu (Zuxo ou Smarters Player Lite: pela App Store; navegador: pelo portal http://slim.webplayer.top/) e feche com a frase do download (no fim deste PASSO 2).
  - Android: mande baixar o *Zuxo*. Se não der certo: os aplicativos *Slim Smart, Slim XC, Slim Fflix ou Slim Ibo*, instalados pelo aplicativo *Downloader* (os códigos estão no PASSO 4).
- BTV/HTV, TV Box, TV Android, Google TV e TCL Android: mande baixar o *Zuxo* ou o *UniTV*. ATENÇÃO: o UniTV NÃO está na loja da TV — ele baixa pelo aplicativo *Downloader*, código *6296729* (ou pelo link aftv.news/6296729). Se não tiver Zuxo nem UniTV pra baixar: os aplicativos Slim pelo Downloader.
- TV Smart: pergunte a marca (LG, LG antiga, Samsung nova, Samsung antiga, TV Android, Roku TV, Google TV, TCL Android ou outras marcas).
  - LG: *Zuxo* normal; se ele quiser, pode ver se tem UniTV também.
  - LG antiga, Samsung (nova ou antiga), Hisense e Philips Titan: NÃO pergunte só se ele tem um aplicativo instalado. Diga que ele pode baixar o *Zuxo* direto; se não achar o Zuxo na loja da TV, é pra baixar o *Media Station X* e avisar que baixou, que você manda o tutorial de como abrir o Zuxo por ele; e que, se preferir outro aplicativo (UniTV ou outro que ele goste), é só falar qual que você vê se tem pra baixar. Quando ele avisar que baixou o Media Station X, mande o tutorial (bloco do Media Station X no PASSO 4) junto com a geração do teste do Zuxo. (Na LG antiga o Media Station X já vem na lista de aplicativos.)
  - Roku TV: o *Zuxo* abre direto.
  - Outras marcas que não sejam Hisense/Philips Titan: responda exatamente "👇🏼Envie abaixo o modelo da sua TV e aguarde que uma atendente irá lhe enviar o aplicativo exato! ⚡️Tempo de espera de: 5 minutos" e NÃO tente gerar o teste.
- Amazon Fire: mande baixar o *Zuxo Player* (a configuração é a mesma da TV Box, no PASSO 4).
- Chromecast: os aplicativos *Slim pelo Downloader*, igual ao Android (PASSO 4).
- Video Game: pergunte se é PS3/PS4/PS5 ou Xbox. Nos dois é pelo NAVEGADOR do console (não tem aplicativo pra baixar): o WebPlayer http://01.webplayer.top/login.php, que é mais leve; como opção, o Slim (http://slim.webplayer.top/), que é bem mais bonito. Gere o teste com o aplicativo "portal".
- Computador: pergunte se é Windows, MacBook ou Linux.
  - Windows: mande baixar o *Smarters Players* pelo link https://appslim.cc/pc (configuração no PASSO 4). Segunda opção: assistir pelo navegador no WebPlayer (http://slim.webplayer.top/).
  - MacBook e Linux: só pelo navegador — o WebPlayer http://01.webplayer.top/login.php, que é mais leve; como opção, o Slim (http://slim.webplayer.top/), que é bem mais bonito. Gere o teste com o aplicativo "portal".
Diga o nome do aplicativo e peça pra ele baixar e avisar QUAL aplicativo baixou. Ao mandar baixar, feche a mensagem SEMPRE com a frase: "Me avise quando terminar de baixar pra eu gerar seu teste grátis" (nunca diga "quando conseguir instalar"). Se baixou e deu certo, NÃO fale de outros aplicativos.

PASSO 3: GERAÇÃO DO TESTE
Quando o cliente disser QUAL aplicativo baixou (ex: "baixei o zuxo", "instalei o unitv", "pronto", "tô no app", "manda o login") ou que já usa e já tem o aplicativo instalado (ex: "eu uso o unitv na tv box"):
- Responda curto, avise que está liberando o acesso e JÁ inclua as instruções de configuração do aplicativo dele (PASSO 4), terminando a mensagem com a tag do aplicativo que ele baixou:
  [[SIGMA_ACTION:CREATE_TRIAL:<aplicativo>]]
  <aplicativo> é um destes: zuxo, unitv, slim (Slim Smart/XC/Fflix/Ibo), smarters (Smarters Player Lite), portal (WebPlayer no navegador).
  Exemplo: [[SIGMA_ACTION:CREATE_TRIAL:zuxo]]
  O sistema gera o usuário e a senha e os entrega logo abaixo da sua mensagem.

PASSO 4: COMO CONFIGURAR (inclua SOMENTE o bloco do aplicativo que o cliente baixou; onde estiver "logo abaixo", é o usuário e a senha que o sistema entrega junto, logo depois da sua mensagem)
- ZUXO (celular, TV Box, Amazon Fire, TVs Android): "Abra o Zuxo Player, vá em *Playlist* e preencha: Campo 1: *slim* / Campo 2: o usuário que está logo abaixo / Campo 3: a senha que está logo abaixo." Se o cliente perguntar "qual o código?", responda: o código é *slim* (é o Campo 1).
- ZUXO PELO MEDIA STATION X (Samsung, LG antiga, Hisense, Philips Titan e qualquer TV por ele): "1) Na loja da TV, procure por *MEDIA STATION X* (não por Zuxo Player), instale e abra. 2) Vá em *Settings* → *Start Parameter* → *Setup*. 3) Clique em *Continue* e digite *msx-view.com* (sem www e sem https). 4) Confirme e clique em *Yes*. 5) Se aparecer *Link Validation*, clique em *Continue*. 6) O Zuxo vai abrir: escolha *Português* e vá em *Playlist*. 7) Código: *slim* / Usuário: o que está logo abaixo / Senha: a que está logo abaixo. 8) Clique em *Entrar*. Nas próximas vezes, abra só o Media Station X."
- SMARTERS PLAYER LITE (iPhone): "Abra o app e escolha *XTREAM CODES*. Preencha: Name: *SlimTV* / Username: o que está logo abaixo / Password: o que está logo abaixo / URL: *http://fragata.lat*. Se aparecer uma tela pedindo PIN, toque em *SKIP*."
- SMARTERS NO WINDOWS: "Baixe o app pelo link *https://appslim.cc/pc* e preencha: Campo 1: *SlimTV* / Campo 2: o usuário que está logo abaixo / Campo 3: a senha que está logo abaixo / Campo 4: *http://fragata.lat*. Se preferir, dá pra assistir pelo navegador no WebPlayer: *http://slim.webplayer.top/* (com http, não https)."
- APLICATIVOS SLIM PELO DOWNLOADER (Android e Chromecast): "Baixe o *Downloader by AFTVnews* na Play Store, abra e digite SOMENTE o número do aplicativo (só números, sem texto): *Slim Smart: 8659974* / *Slim XC: 5897858* / *Slim Fflix: 4788756* / *Slim Ibo: 3718531* — teste um por vez, nessa ordem. Depois abra o aplicativo e coloque o usuário e a senha que estão logo abaixo."
- UNITV: "Baixe o *Downloader by AFTVnews*, abra e digite o código *6296729* (ou baixe pelo link aftv.news/6296729). Depois abra o UniTV e coloque o usuário e a senha que estão logo abaixo."
- WEBPLAYER (navegador): "Acesse *http://slim.webplayer.top/* (com http, não https) e entre com o usuário e a senha que estão logo abaixo."
- WEBPLAYER NO CONSOLE (PS/Xbox), MACBOOK E LINUX: "No navegador, acesse o WebPlayer *http://01.webplayer.top/login.php* (ele é mais leve) e preencha o usuário e a senha que estão logo abaixo. Se preferir, também dá pelo Slim: *http://slim.webplayer.top/* — ele é bem mais bonito."

OUTRAS AÇÕES:
2. CONSULTA DE VENCIMENTO / DIAS: Se o cliente perguntar quando vence a assinatura dele, quantos dias faltam ou status da conta dele:
   - Inclua no final a tag: [[SIGMA_ACTION:CHECK_EXPIRY]]
3. SUPORTE / REINICIAR LINHA / TRAVAMENTO: Se o cliente relatar que os canais estão travando, fora do ar ou pedir para atualizar/reiniciar a linha:
   - Inclua no final a tag: [[SIGMA_ACTION:RESYNC]]

As tags [[SIGMA_ACTION:...]] são comandos automáticos executados pelo sistema. O sistema substituirá a tag pela resposta da ação.
`;

    const prompt = `${systemContext}
${humanEmulationRules}
${sigmaToolsInstructions}
${companyKnowledgeSection}
${memoryPromptSection}

Histórico da conversa recente com o cliente:
${historyPrompt || 'Nenhuma conversa anterior registrada.'}

Cliente diz: "${text}"
Gere uma resposta curta, educada, prestativa e muito natural para o WhatsApp do cliente. Responda como "Você". Não adicione prefixos como "Você:" na resposta final.`;

    let aiResponse = '';
    const isGroq = apiKey.startsWith('gsk_');
    const isOpenRouter = apiKey.startsWith('sk-or-');

    // Luna (teamsoclo) primeiro: seleção explícita por AI_PROVIDER=luna, antes de
    // qualquer checagem de prefixo, para a chave nunca ir para openrouter.ai.
    if (isLunaProvider()) {
      aiResponse = await callLunaChatCompletions(
        apiKey,
        [{ role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 1000 }
      );
    } else if (isGroq || isOpenRouter) {
      const url = isGroq
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';
      const modelName = isGroq ? 'llama-3.1-8b-instant' : 'google/gemini-2.5-flash';

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://wajato.ftech-apps.com.br';
        headers['X-Title'] = 'WaJato';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: isOpenRouter ? 1000 : 180,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Erro na API (${res.status})`);
      aiResponse = data.choices[0].message.content.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { temperature: 0.7, maxOutputTokens: 180 },
      });
      const result = await model.generateContent(prompt);
      aiResponse = result.response.text().trim();
    }

    if (aiResponse) {
      let cleanResponse = aiResponse.replace(/^(Você|Atendente|Suporte|Equipe|AI|IA|Bot):\s*/i, '').trim();

      // Interceptar e executar ações automáticas do Sigma
      const actionMatch = cleanResponse.match(/\[\[SIGMA_ACTION:([A-Z_]+)(?::([^\]]+))?\]\]/i);
      if (actionMatch) {
        const actionType = actionMatch[1].toUpperCase();
        const actionParam = actionMatch[2]?.trim() || '';

        // Remove a tag do texto da IA
        cleanResponse = cleanResponse.replace(actionMatch[0], '').trim();

        let actionResult = '';
        if (actionType === 'CREATE_TRIAL') {
          const outcome = await createTrialForLead(phone, actionParam);
          actionResult = outcome.message;
        } else if (actionType === 'CHECK_EXPIRY') {
          const outcome = await checkCustomerExpiry(phone);
          actionResult = outcome.message;
        } else if (actionType === 'RESYNC') {
          const outcome = await resyncCustomer(phone);
          actionResult = outcome.message;
        }

        if (actionResult) {
          cleanResponse = cleanResponse ? `${cleanResponse}\n\n${actionResult}` : actionResult;
        }
      }

      const parts = splitMessageIntoNaturalParts(cleanResponse);

      if (parts.length === 1) {
        const typingDelay = Math.min(Math.max(parts[0].length * 35, 1500), 5000);
        await evolutionApi.sendTextMessage(instanceName, phone, parts[0], typingDelay);
      } else {
        const delay1 = Math.min(Math.max(parts[0].length * 35, 1200), 3500);
        await evolutionApi.sendTextMessage(instanceName, phone, parts[0], delay1);
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
        const delay2 = Math.min(Math.max(parts[1].length * 30, 1000), 3000);
        await evolutionApi.sendTextMessage(instanceName, phone, parts[1], delay2);
      }

      await prisma.chatbotLog.create({
        data: { phone, messageIn: text, messageOut: cleanResponse, source: 'AI' },
      });

      markResponded(phone);

      // Atualiza memória de fatos do cliente em background (Redis)
      extractAndUpdateMemoryAsync(phone, text, cleanResponse, apiKey, contactName);
    }
  } catch (error: any) {
    logger.error('Erro ao processar chatbot incoming', error);
  } finally {
    inFlightPhones.delete(normPhone);
  }
}
