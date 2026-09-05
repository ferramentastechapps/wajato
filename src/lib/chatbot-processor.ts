import { prisma } from './prisma';
import { evolutionApi } from './evolution';
import { isWithinBusinessHours } from './warmup-schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
const RATE_LIMIT_MS = 30_000; // 30 segundos de cooldown entre respostas automáticas
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

async function resolveCompany(contactRecord: any, overrideCompanyId?: string | null): Promise<any> {
  try {
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

          const company = await resolveCompany(contactRecord, opts.companyId);
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

    // ── Obter configuração global do chatbot ──────────────────────────────────
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
      logger.error('Chave de API do Gemini não configurada');
      return;
    }

    // Resolver empresa
    const company = await resolveCompany(contactRecord, opts.companyId);

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

    const prompt = `${systemContext}
${humanEmulationRules}
${companyKnowledgeSection}
${memoryPromptSection}

Histórico da conversa recente com o cliente:
${historyPrompt || 'Nenhuma conversa anterior registrada.'}

Cliente diz: "${text}"
Gere uma resposta curta, educada, prestativa e muito natural para o WhatsApp do cliente. Responda como "Você". Não adicione prefixos como "Você:" na resposta final.`;

    let aiResponse = '';
    const isGroq = apiKey.startsWith('gsk_');
    const isOpenRouter = apiKey.startsWith('sk-or-');

    if (isGroq || isOpenRouter) {
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
      const cleanResponse = aiResponse.replace(/^(Você|Atendente|Suporte|Equipe|AI|IA|Bot):\s*/i, '').trim();

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
