import { redisConnection } from './redis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';

export interface ContactMemory {
  name?: string | null;
  interests?: string[];
  keyFacts?: string[];
  lastTopic?: string | null;
  lastInteractionAt?: string;
  summaryHistory?: string | null;
}

const MEMORY_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias

/**
 * Obtém a memória persistente do contato do Redis
 */
export async function getContactMemory(phone: string): Promise<ContactMemory | null> {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const key = `chatbot:memory:${cleanPhone}`;
    const raw = await redisConnection.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as ContactMemory;
  } catch (err: any) {
    logger.warn?.('[Chatbot Memory] Falha ao recuperar memória do Redis:', { phone, error: err?.message });
    return null;
  }
}

/**
 * Salva a memória atualizada do contato no Redis com TTL de 30 dias
 */
export async function saveContactMemory(phone: string, memory: ContactMemory): Promise<void> {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const key = `chatbot:memory:${cleanPhone}`;
    await redisConnection.set(key, JSON.stringify(memory), 'EX', MEMORY_TTL_SECONDS);
  } catch (err: any) {
    logger.warn?.('[Chatbot Memory] Falha ao salvar memória no Redis:', { phone, error: err?.message });
  }
}

/**
 * Formata os dados de memória para enriquecer o prompt da IA
 */
export function formatMemoryForPrompt(memory: ContactMemory | null): string {
  if (!memory) return '';

  const items: string[] = [];

  if (memory.name) {
    items.push(`- Nome do cliente: ${memory.name}`);
  }
  if (memory.interests && memory.interests.length > 0) {
    items.push(`- Interesses / Serviços de interesse: ${memory.interests.slice(0, 5).join(', ')}`);
  }
  if (memory.keyFacts && memory.keyFacts.length > 0) {
    items.push(`- Informações e preferências anteriores: ${memory.keyFacts.slice(0, 5).join('; ')}`);
  }
  if (memory.lastTopic) {
    items.push(`- Tópico anterior: ${memory.lastTopic}`);
  }
  if (memory.summaryHistory) {
    items.push(`- Contexto consolidado anterior: ${memory.summaryHistory}`);
  }

  if (items.length === 0) return '';

  return `
[MEMÓRIA E PERFIL DO CLIENTE (Use com naturalidade para um atendimento personalizado)]:
${items.join('\n')}
`;
}

/**
 * Resume progressivamente mensagens mais antigas do chat para economizar tokens
 * e manter o foco nas mensagens recentes.
 */
export async function summarizeOlderHistory(
  olderMessages: Array<{ role: 'user' | 'model'; text: string }>,
  apiKey: string
): Promise<string> {
  if (olderMessages.length === 0) return '';

  try {
    const conversationText = olderMessages
      .map((m) => `${m.role === 'user' ? 'Cliente' : 'Atendente'}: ${m.text}`)
      .join('\n');

    const prompt = `Resuma em no máximo 2 frases curtas os pontos principais e intenção do cliente nesta conversa anterior:
${conversationText}

Resumo objetivo:`;

    const isGroq = apiKey.startsWith('gsk_');
    const isOpenRouter = apiKey.startsWith('sk-or-');

    if (isGroq || isOpenRouter) {
      const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const modelName = isGroq ? 'llama-3.1-8b-instant' : 'google/gemini-2.5-flash';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(isOpenRouter ? { 'HTTP-Referer': 'https://wajato.ftech-apps.com.br', 'X-Title': 'WaJato' } : {}),
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 60,
        }),
      });

      const data = await res.json();
      return String(data.choices?.[0]?.message?.content || '').trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 60 },
      });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    }
  } catch (err: any) {
    logger.warn?.('[Chatbot Memory] Erro ao sumarizar histórico antigo:', { error: err?.message });
    return '';
  }
}

/**
 * Atualiza a memória de fatos em background de forma assíncrona (sem travar a resposta do WhatsApp)
 */
export async function extractAndUpdateMemoryAsync(
  phone: string,
  userMessage: string,
  aiResponse: string,
  apiKey: string,
  existingName?: string | null
): Promise<void> {
  // Executa em setImmediate / background para não atrasar a resposta
  setImmediate(async () => {
    try {
      const currentMemory = (await getContactMemory(phone)) || {
        interests: [],
        keyFacts: [],
      };

      if (existingName && (!currentMemory.name || currentMemory.name.startsWith('+'))) {
        currentMemory.name = existingName;
      }

      // Prompt leve de extração de fatos
      const prompt = `Analise a interação recente de WhatsApp e extraia dados do cliente no formato JSON rígido.
Cliente: "${userMessage}"
Atendente: "${aiResponse}"

Retorne SOMENTE um objeto JSON com esta estrutura (sem markdown, sem explicações):
{
  "extractedName": null ou string com o nome do cliente se revelado,
  "interests": ["lista de produtos/assuntos de interesse se mencionados, máx 2"],
  "newFacts": ["fatos duráveis sobre o cliente se mencionados, máx 2, ex: tem 2 lojas, prefere pagamento pix"],
  "topic": "assunto principal em 3 a 5 palavras"
}`;

      let extractedJsonText = '';
      const isGroq = apiKey.startsWith('gsk_');
      const isOpenRouter = apiKey.startsWith('sk-or-');

      if (isGroq || isOpenRouter) {
        const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        const modelName = isGroq ? 'llama-3.1-8b-instant' : 'google/gemini-2.5-flash';

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(isOpenRouter ? { 'HTTP-Referer': 'https://wajato.ftech-apps.com.br', 'X-Title': 'WaJato' } : {}),
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 150,
          }),
        });

        const data = await res.json();
        extractedJsonText = String(data.choices?.[0]?.message?.content || '').trim();
      } else {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
        });
        const result = await model.generateContent(prompt);
        extractedJsonText = result.response.text().trim();
      }

      // Sanitiza JSON (remove markdown fences se houver)
      const cleanJson = extractedJsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (parsed.extractedName && (!currentMemory.name || currentMemory.name.startsWith('+'))) {
        currentMemory.name = parsed.extractedName;
      }

      if (Array.isArray(parsed.interests) && parsed.interests.length > 0) {
        const combined = Array.from(new Set([...(currentMemory.interests || []), ...parsed.interests]));
        currentMemory.interests = combined.slice(-5);
      }

      if (Array.isArray(parsed.newFacts) && parsed.newFacts.length > 0) {
        const combined = Array.from(new Set([...(currentMemory.keyFacts || []), ...parsed.newFacts]));
        currentMemory.keyFacts = combined.slice(-5);
      }

      if (parsed.topic) {
        currentMemory.lastTopic = parsed.topic;
      }

      currentMemory.lastInteractionAt = new Date().toISOString();

      await saveContactMemory(phone, currentMemory);
      logger.info?.('[Chatbot Memory] Memória atualizada para contato com sucesso', { phone, memory: currentMemory });
    } catch (err: any) {
      // Falha silenciosa para não quebrar fluxo principal
      logger.warn?.('[Chatbot Memory] Erro ao extrair memória em background:', { phone, error: err?.message });
    }
  });
}

/**
 * Quebra uma resposta longa em 2 partes naturais de mensagem de WhatsApp se apropriado
 */
export function splitMessageIntoNaturalParts(text: string): string[] {
  const trimmed = text.trim();
  // Se for curta, não divide
  if (trimmed.length < 120) {
    return [trimmed];
  }

  // Procura quebras naturais de parágrafo primeiro
  if (trimmed.includes('\n\n')) {
    const parts = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0].length >= 30 && parts[1].length >= 20) {
      return [parts[0], parts.slice(1).join('\n\n')];
    }
  }

  // Procura pontuação final (. ? !) seguida de espaço entre 35% e 75% da mensagem
  const minSplit = Math.floor(trimmed.length * 0.35);
  const maxSplit = Math.floor(trimmed.length * 0.75);

  let bestSplitIndex = -1;
  const sentenceDelimiters = ['. ', '? ', '! ', '.\n', '?\n', '!\n'];

  for (const delim of sentenceDelimiters) {
    let index = trimmed.indexOf(delim, minSplit);
    while (index !== -1 && index <= maxSplit) {
      bestSplitIndex = index + delim.length;
      break;
    }
    if (bestSplitIndex !== -1) break;
  }

  if (bestSplitIndex !== -1) {
    const part1 = trimmed.slice(0, bestSplitIndex).trim();
    const part2 = trimmed.slice(bestSplitIndex).trim();
    if (part1.length >= 30 && part2.length >= 20) {
      return [part1, part2];
    }
  }

  return [trimmed];
}
