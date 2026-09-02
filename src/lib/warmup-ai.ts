/**
 * warmup-ai.ts
 * Geração de mensagens humanas para aquecimento via Gemini AI.
 * Inclui: Spintax engine, banco de tópicos dinâmicos, personas ricas.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from './prisma';

let cachedGenAI: GoogleGenerativeAI | null = null;
let cachedApiKey: string | null = null;

export async function getGenAIInstance(): Promise<GoogleGenerativeAI> {
  let apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    try {
      const config = await prisma.chatbotConfig.findUnique({
        where: { id: 'global' },
      });
      if (config?.geminiApiKey) {
        apiKey = config.geminiApiKey;
      }
    } catch (err) {
      console.error('[Warmup AI] Erro ao buscar API Key no banco de dados:', err);
    }
  }

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente nem no banco de dados.');
  }

  if (!cachedGenAI || cachedApiKey !== apiKey) {
    cachedGenAI = new GoogleGenerativeAI(apiKey);
    cachedApiKey = apiKey;
  }

  return cachedGenAI;
}

// ─── Áudios de Warmup (OGG/OPUS — compatível com WhatsApp PTT) ───────────────
// URLs confiáveis de arquivos .ogg com codec OPUS para simular notas de voz.
// Testadas e validadas para funcionar como PTT no WhatsApp via Evolution API.
export const WARMUP_AUDIO_URLS = [
  // Archive.org — CDN permanente, sem rate-limit
  'https://archive.org/download/testmp3testfile/testmp3testfile_64kb.ogg',
  'https://archive.org/download/acousticguitar_201507/ag_b01.ogg',
  'https://archive.org/download/testmp3testfile/testmp3testfile_128kb.ogg',
  // Filesamples.com — amostras reais de voz
  'https://filesamples.com/samples/audio/ogg/sample1.ogg',
  'https://filesamples.com/samples/audio/ogg/sample2.ogg',
  'https://filesamples.com/samples/audio/ogg/sample3.ogg',
  // Mzstatic/CDN público
  'https://cdn.freesound.org/previews/28/28693_236757-lq.ogg',
  'https://cdn.freesound.org/previews/66/66717_931655-lq.ogg',
  // OpenGameArt — OGG nativos
  'https://opengameart.org/sites/default/files/audio_preview/level-up-47pass.ogg',
  // Vorbis.com — samples oficiais do codec
  'https://www.vorbis.com/music/Hydrate-Kenny_Beltrey.ogg',
];

// ─── Enquetes de Warmup ──────────────────────────────────────────────────────
// Enquetes naturais para interação bidirecional altíssima humanização.
export const WARMUP_POLLS = [
  {
    name: 'O que você vai almoçar hoje?',
    options: ['Marmita de casa 🍱', 'Restaurante por quilo 🍽️', 'Delivery 🛵', 'Salgado rápido 🥪'],
  },
  {
    name: 'Que horas você acorda normalmente?',
    options: ['Antes das 6h 🌅', 'Entre 6h e 7h', 'Entre 7h e 8h ☕', 'Depois das 8h 😴'],
  },
  {
    name: 'Qual é sua bebida favorita pela manhã?',
    options: ['Café ☕', 'Suco natural 🍊', 'Chá 🍵', 'Água mesmo 💧'],
  },
  {
    name: 'Como tá o tempo aí?',
    options: ['Calor absurdo 🔥', 'Frio 🧥', 'Nublado ☁️', 'Chuva 🌧️'],
  },
  {
    name: 'O que você prefere no fim de semana?',
    options: ['Sair com amigos 🥳', 'Ficar em casa 🛋️', 'Viajar 🚗', 'Malhar 💪'],
  },
  {
    name: 'Seu time tá bem esse ano?',
    options: ['Muito bem! ⚽🏆', 'Mais ou menos 😬', 'Horrível 😭', 'Não ligo pra futebol 🤷'],
  },
  {
    name: 'Qual streaming você mais usa?',
    options: ['Netflix 🎬', 'Disney+ 🏰', 'Prime Video 📦', 'YouTube mesmo 📺'],
  },
  {
    name: 'Você prefere comunicar como?',
    options: ['Áudio 🎙️', 'Texto ✍️', 'Ligação 📞', 'Tanto faz 😄'],
  },
];

// ─── vCards (Contatos Fictícios) ─────────────────────────────────────────────
// Contatos fictícios em formato vCard para compartilhamento humanizado.
export const WARMUP_VCARDS = [
  {
    displayName: 'Ana Paula Santos',
    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Ana Paula Santos\nTEL;type=CELL;type=VOICE;waid=5511987654321:+55 11 98765-4321\nEND:VCARD',
  },
  {
    displayName: 'Carlos Eduardo Lima',
    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Carlos Eduardo Lima\nTEL;type=CELL;type=VOICE;waid=5521976543210:+55 21 97654-3210\nEND:VCARD',
  },
  {
    displayName: 'Fernanda Costa',
    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Fernanda Costa\nTEL;type=CELL;type=VOICE;waid=5531965432109:+55 31 96543-2109\nEND:VCARD',
  },
  {
    displayName: 'Ricardo Mendes',
    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Ricardo Mendes\nTEL;type=CELL;type=VOICE;waid=5541954321098:+55 41 95432-1098\nEND:VCARD',
  },
  {
    displayName: 'Juliana Oliveira',
    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Juliana Oliveira\nTEL;type=CELL;type=VOICE;waid=5551943210987:+55 51 94321-0987\nEND:VCARD',
  },
];

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// ─── Banco de Tópicos de Conversa ───────────────────────────────────────────
// 25+ tópicos reais para rotação contextual. Evita repetição e detectabilidade.
const CONVERSATION_TOPICS = [
  'futebol e campeonato brasileiro',
  'uma série ou filme no streaming que assistiu recentemente',
  'planos para o fim de semana',
  'o calor absurdo que está fazendo',
  'comida — o que almoçou ou o que quer comer',
  'trabalho e a semana pesada',
  'um lugar que quer visitar nas próximas férias',
  'a última música que ficou na cabeça',
  'academia ou exercício físico',
  'uma compra que fez recentemente (roupa, eletrônico, etc.)',
  'trânsito e o caos do dia a dia',
  'aplicativo ou jogo no celular',
  'uma receita ou restaurante que recomendou',
  'notícia engraçada ou absurda que viu nas redes',
  'planos para o feriado',
  'aniversário de alguém próximo',
  'um meme ou vídeo engraçado',
  'como o time favorito foi no fim de semana',
  'uma série de crime real (true crime) que está vendo',
  'mudanças no bairro ou cidade',
  'dificuldade com tecnologia (celular novo, atualização, etc.)',
  'pet — cachorro ou gato fazendo algo engraçado',
  'chuva inesperada no meio do dia',
  'uma promoção boa que achou',
  'viagem de carro ou de ônibus desconfortável',
];

// ─── Emojis de Resposta Rápida ───────────────────────────────────────────────
// Usados para mensagens do tipo EMOJI (curtas, humanas)
export const QUICK_EMOJI_RESPONSES = [
  '😂',
  '👍',
  '❤️',
  '😅',
  '🙌',
  '🤣',
  '😍',
  '🔥',
  '💯',
  '😎',
  '👏',
  '😮',
  '🫡',
  '🤙',
  '😂😂',
  '👍👍',
  '❤️🔥',
];

// ─── Reações disponíveis ─────────────────────────────────────────────────────
export const WARMUP_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

// ─── Spintax Engine ──────────────────────────────────────────────────────────
/**
 * Processa texto com variações no formato {opção1|opção2|opção3}.
 * Exemplo: "{Oi|Olá|E aí} {mano|cara|véi}" → "Oi mano" ou "Olá cara" etc.
 */
export function processSpintax(template: string): string {
  return template.replace(/\{([^}]+)\}/g, (_, options) => {
    const choices = options.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

/**
 * Seleciona um tópico de conversa aleatório, evitando repetição recente.
 */
export function selectConversationTopic(recentTopics: string[] = []): string {
  const available = CONVERSATION_TOPICS.filter(t => !recentTopics.includes(t));
  const pool = available.length > 0 ? available : CONVERSATION_TOPICS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Mescla mensagens consecutivas com o mesmo papel (user/model) e
 * garante que o histórico comece com um 'user' para evitar rejeições das APIs de LLM.
 */
export function mergeConsecutiveRoles(history: ChatMessage[]): ChatMessage[] {
  if (history.length === 0) return [];
  
  const merged: ChatMessage[] = [];
  let current = { ...history[0] };
  
  for (let i = 1; i < history.length; i++) {
    const item = history[i];
    if (item.role === current.role) {
      const currentText = current.parts.map(p => p.text).join('\n');
      const itemText = item.parts.map(p => p.text).join('\n');
      current.parts = [{ text: `${currentText}\n${itemText}` }];
    } else {
      merged.push(current);
      current = { ...item };
    }
  }
  merged.push(current);
  
  // Garante que o histórico sempre comece com 'user'
  if (merged.length > 0 && merged[0].role === 'model') {
    merged.unshift({ role: 'user', parts: [{ text: 'Oi' }] });
  }
  
  return merged;
}

/**
 * Gera um emoji contextual baseado na última mensagem recebida.
 * Usa a IA para escolher um emoji que faça sentido como reação rápida,
 * em vez de sortear aleatoriamente da lista estática.
 */
export async function generateContextualEmoji(
  lastMessage: string,
  isNamoroContext: boolean
): Promise<string> {
  try {
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const config = await prisma.chatbotConfig.findUnique({ where: { id: 'global' } });
      apiKey = config?.geminiApiKey || '';
    }
    if (!apiKey) throw new Error('Sem chave de API');

    const prompt = isNamoroContext
      ? `Você recebeu esta mensagem do seu namorado(a) no WhatsApp: "${lastMessage}"\nResponda com APENAS UM EMOJI que faz sentido como reação carinhosa a essa mensagem. Sem texto, sem explicação — apenas o emoji.`
      : `Você recebeu esta mensagem de um amigo no WhatsApp: "${lastMessage}"\nResponda com APENAS UM EMOJI que faz sentido como reação rápida a essa mensagem. Sem texto, sem explicação — apenas o emoji.`;

    const isGroq = apiKey.startsWith('gsk_');
    const isOpenRouter = apiKey.startsWith('sk-or-');

    if (isGroq || isOpenRouter) {
      const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      // Aquecimento: modelo primário gratuito + fallback gratuito
      const WARMUP_PRIMARY_MODEL = 'cohere/north-mini-code:free';
      const WARMUP_FALLBACK_MODEL = 'poolside/laguna-xs-2.1:free';
      const model = isGroq ? 'llama-3.1-8b-instant' : WARMUP_PRIMARY_MODEL;
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://wajato.ftech-apps.com.br';
        headers['X-Title'] = 'WaJato';
      }
      let res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 10 }),
      });
      // Se o modelo primário falhar, tenta o fallback gratuito
      if (!res.ok && isOpenRouter) {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: WARMUP_FALLBACK_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 10 }),
        });
      }
      const data = await res.json();
      const raw = String(data.choices?.[0]?.message?.content || '').trim();
      // Valida que retornou só emoji(s) — se vier texto, cai no fallback
      if (raw && raw.length <= 8 && !/[a-zA-Z0-9]/.test(raw)) return raw;
    } else {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const raw = String(result.response.text() || '').trim();
      if (raw && raw.length <= 8 && !/[a-zA-Z0-9]/.test(raw)) return raw;
    }
  } catch (_) {
    // fallback silencioso
  }
  // Fallback: emoji contextual simples aleatório, mas separado por namoro/amigo
  const namoroEmojis = ['❤️', '😍', '🥰', '😘', '😂', '💕', '😊', '🔥'];
  const friendEmojis = ['😂', '👍', '🔥', '💯', '😮', '🤣', '😅', '👏'];
  const pool = isNamoroContext ? namoroEmojis : friendEmojis;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Remove TODOS os artefatos HTML, Markdown e formatação estrutural da resposta da IA.
 * Garante que a mensagem chegue ao WhatsApp como texto puro.
 */
function sanitizeAIMessage(text: string, historyHasFeriado: boolean): string {
  let clean = text;

  // 1. Remove tags HTML (ex: </blockquote>, <b>, <i>, <p>, etc.)
  clean = clean.replace(/<[^>]*>/g, '');

  // 2. Remove marcadores de citação Markdown (> linha de blockquote)
  clean = clean.replace(/^>\s?.*/gm, '');

  // 3. Remove formatação Markdown: **negrito**, _itálico_, `código`, ~~tachado~~
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
  clean = clean.replace(/__([^_]+)__/g, '$1');
  clean = clean.replace(/`([^`]+)`/g, '$1');
  clean = clean.replace(/~~([^~]+)~~/g, '$1');

  // 4. Remove citações do tipo [cite_start]...[cite_end] ou [1] [2] etc.
  clean = clean.replace(/\[cite[^\]]*\]/g, '');
  clean = clean.replace(/\[\d+\]/g, '');
  clean = clean.replace(/\[[^\]]+\]/g, '');

  // 5. Bloqueia "feriado" se o histórico não menciona feriado
  //    Substitui por "final de semana" para manter contexto natural
  if (!historyHasFeriado) {
    clean = clean.replace(/\bferiado\b/gi, 'final de semana');
  }

  // 6. Remove linhas em branco múltiplas e normaliza espaços
  clean = clean.replace(/\n{2,}/g, '\n');
  clean = clean.replace(/\s{2,}/g, ' ');

  return clean.trim();
}

/**
 * Gera a próxima mensagem de texto para o aquecimento via Gemini AI.
 * Inclui contexto de persona rica, tópico dinâmico e instruções anti-detectabilidade.
 */
export async function generateNextWarmupMessage(
  context: string,
  history: ChatMessage[],
  topic?: string
): Promise<string> {
  try {
    const mergedHistory = mergeConsecutiveRoles(history);
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const config = await prisma.chatbotConfig.findUnique({
        where: { id: 'global' },
      });
      apiKey = config?.geminiApiKey || '';
    }

    if (!apiKey) {
      throw new Error('Nenhuma chave de API configurada.');
    }

    const isNamoro = context.toLowerCase().includes('namoro') || context.toLowerCase().includes('namorado') || context.toLowerCase().includes('relacionamento') || context.toLowerCase().includes('casal');

    // Verifica se o histórico já contém "feriado" (para não censurar se foi o humano que mencionou)
    const historyText = mergedHistory.map(h => h.parts[0]?.text || '').join(' ').toLowerCase();
    const historyHasFeriado = historyText.includes('feriado');

    // Sanitiza o histórico antes de passar para a IA (remove HTML/markdown que possa ter vazado)
    const sanitizedHistory = mergedHistory.map(h => ({
      ...h,
      parts: [{ text: sanitizeAIMessage(h.parts[0]?.text || '', true) }],
    }));

    // Determina horário real no Brasil (BRT = UTC-3)
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hourBRT = nowBRT.getUTCHours();
    const weekDayPT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][nowBRT.getUTCDay()];
    const isWeekend = nowBRT.getUTCDay() === 0 || nowBRT.getUTCDay() === 6;
    const periodoBRT = hourBRT >= 5 && hourBRT < 12 ? 'manhã' : hourBRT >= 12 && hourBRT < 18 ? 'tarde' : 'noite';
    const saudacaoBRT = hourBRT >= 5 && hourBRT < 12 ? 'Bom dia' : hourBRT >= 12 && hourBRT < 18 ? 'Boa tarde' : 'Boa noite';

    // Tópicos adequados para cada período do dia
    const topicsByPeriod = periodoBRT === 'manhã'
      ? 'café, trabalho, academia, planos do dia, trânsito, notícias'
      : periodoBRT === 'tarde'
      ? 'almoço, trabalho, reunião, cansaço, tempo, esporte'
      : 'série, filme, jantar, sono, saudade, planos de amanhã, relaxar';

    const systemInstruction = `FORMATO OBRIGATÓRIO: Texto puro apenas. ZERO tags HTML (proibido: <blockquote>, <b>, <p>, qualquer tag). ZERO Markdown (proibido: **, __, \`código\`, > citação). ZERO colchetes de citação ([1], [cite]). Se você usar qualquer desses formatos, a mensagem será bloqueada.

Você está simulando uma conversa de WhatsApp casual e autêntica entre ${isNamoro ? 'um casal de namorados brasileiros em um relacionamento carinhoso' : 'dois amigos brasileiros'}.
Seu objetivo é fazer o algoritmo do WhatsApp acreditar que isso é uma conversa REAL entre pessoas.

CONTEXTO TEMPORAL REAL — OBRIGATÓRIO:
- Hoje é ${weekDayPT}${isWeekend ? ' (fim de semana)' : ' (dia útil)'}.
- Agora são ${hourBRT}h (${periodoBRT}) no Brasil.
- Saudação correta agora: "${saudacaoBRT}". JAMAIS use "Bom dia" à noite ou "Boa noite" de manhã.
- PROIBIDO mencionar "feriado"${historyHasFeriado ? '' : ' — não existe feriado hoje'}.
- Assuntos naturais para este horário: ${topicsByPeriod}.

REGRAS DE ESTILO:
1. ${isNamoro ? 'Seja carinhoso(a) como namorado(a). Use: "amor", "vida", "morem", "amorzão". NUNCA: "mano", "véi", "cara".' : 'Seja casual como amigo. Use: "kkk", "mano", "cara", "né", "tbm", "vc", "tá", "pô".'}
2. Máximo 2 frases curtas por mensagem. Nunca escreva parágrafos.
3. Às vezes erre propositalmente: "tambem", "nao", "ta", "vc" sem acento.
4. Emojis: apenas em ~30% das mensagens, SEMPRE junto de uma frase. Exemplos: "saudade ❤️", "kkk 😂". NUNCA emoji sozinho.
5. Varie o início da mensagem. Não comece sempre com "Oi" ou "Amor".
6. Responda de forma coerente com o que foi dito antes. Não mude de assunto abruptamente.
7. Persona: ${context}
${topic ? `8. Assunto da conversa: ${topic}` : ''}

RETORNE APENAS A MENSAGEM. Sem aspas, sem prefixo, sem explicação, sem HTML.`;

    const isGroq = apiKey.startsWith('gsk_');
    const isOpenRouter = apiKey.startsWith('sk-or-');

    const lastMessage = sanitizedHistory[sanitizedHistory.length - 1];
    const isModelLast = lastMessage?.role === 'model';

    if (isGroq || isOpenRouter) {
      const prompt = sanitizedHistory.length === 0
        ? (topic ? `Inicie uma conversa casual sobre ${topic}. Saudação curta e informal, máximo 1 frase.` : `Inicie a conversa com uma saudação muito casual para a ${periodoBRT}. Máximo 1 frase.`)
        : (isModelLast
            ? `Continue a conversa. Diga algo novo relacionado ao horário atual (${periodoBRT}). Máximo 2 frases.`
            : `Responda à última mensagem de forma casual e curta. Máximo 2 frases.`);

      const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      // Aquecimento: modelo primário gratuito + fallback gratuito
      const WARMUP_PRIMARY_MODEL = 'cohere/north-mini-code:free';
      const WARMUP_FALLBACK_MODEL = 'poolside/laguna-xs-2.1:free';
      const modelName = isGroq ? 'llama-3.1-8b-instant' : WARMUP_PRIMARY_MODEL;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://wajato.ftech-apps.com.br';
        headers['X-Title'] = 'WaJato';
      }

      const requestBody = (model: string) => JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          ...sanitizedHistory.map(h => ({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.parts[0].text,
          })),
          { role: 'user', content: prompt }
        ],
        temperature: 0.9,
        max_tokens: 80, // Fixado em 80 para evitar respostas longas com HTML/markdown
      });

      let response = await fetch(url, { method: 'POST', headers, body: requestBody(modelName) });

      // Fallback automático para modelo secundário gratuito se o primário falhar
      if (!response.ok && isOpenRouter) {
        console.warn(`[Warmup AI] Modelo primário ${modelName} falhou (${response.status}), tentando fallback: ${WARMUP_FALLBACK_MODEL}`);
        response = await fetch(url, { method: 'POST', headers, body: requestBody(WARMUP_FALLBACK_MODEL) });
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `Erro na chamada da API (${response.status})`);
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(JSON.stringify(data.error || data) || 'Resposta vazia do OpenRouter/Groq.');
      }
      const cleanedContent = sanitizeAIMessage(String(content), historyHasFeriado);
      if (!cleanedContent) {
        throw new Error('Mensagem vazia após sanitização.');
      }
      return cleanedContent;
    } else {
      // Fluxo original Gemini
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction,
      });

      const chat = model.startChat({
        history: sanitizedHistory,
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 80,
          topP: 0.9,
          topK: 40,
        },
      });

      const isNamoroContext = isNamoro;

      const prompt = sanitizedHistory.length === 0
        ? (topic ? `Inicie uma conversa casual sobre ${topic}. Saudação curta, máximo 1 frase.` : (isNamoroContext ? `Inicie com uma saudação carinhosa de ${periodoBRT}. Máximo 1 frase.` : `Inicie com uma saudação casual para a ${periodoBRT}. Máximo 1 frase.`))
        : (isModelLast
            ? `Continue a conversa. Diga algo relacionado ao horário atual (${periodoBRT}). Máximo 2 frases.`
            : 'Responda de forma casual e curta à última mensagem. Máximo 2 frases.');

      const result = await chat.sendMessage(prompt);
      const responseObj = await result.response;
      let text = '';
      try {
        text = responseObj ? responseObj.text() : '';
      } catch (e) {
        text = '';
      }
      if (!text) {
        throw new Error('Resposta vazia da API do Gemini.');
      }
      const cleanedText = sanitizeAIMessage(String(text), historyHasFeriado);
      if (!cleanedText) {
        throw new Error('Mensagem vazia após sanitização.');
      }
      return cleanedText;
    }
  } catch (error) {
    console.error('Erro ao gerar mensagem de warmup via Gemini:', error);
    // Fallback inteligente com Spintax — usa horário real
    const mergedHistory = mergeConsecutiveRoles(history);
    const isModelLast = mergedHistory[mergedHistory.length - 1]?.role === 'model';
    const isNamoroFallback = context.toLowerCase().includes('namoro') ||
                             context.toLowerCase().includes('namorado') ||
                             context.toLowerCase().includes('relacionamento') ||
                             context.toLowerCase().includes('casal');

    // Saudação correta para o fallback também usa horário real
    const nowFallback = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hFallback = nowFallback.getUTCHours();
    const saudacaoFallback = hFallback >= 5 && hFallback < 12 ? '{Bom dia|Bom diaaa}' : hFallback >= 12 && hFallback < 18 ? '{Boa tarde|Boa tardee}' : '{Boa noite|Boa noitee}';
    const periodoFallback = hFallback >= 5 && hFallback < 12 ? 'manhã' : hFallback >= 12 && hFallback < 18 ? 'tarde' : 'noite';

    let templates: string[];
    if (isNamoroFallback) {
      if (mergedHistory.length === 0) {
        templates = [
          `{Oii|Oi|Opa} {amor|vida|morem}, {tudo bem?|como vc tá?|como foi o dia?}`,
          `${saudacaoFallback} {amor|vida|morem}! {Tudo certo por aí?|Saudade de vc!}`,
          `{Oi|Oii} {amor|lindo(a)}, {tá ocupado(a)?|tudo tranquilo?}`,
        ];
      } else if (isModelLast) {
        templates = [
          `E por aí {amor|vida}, como {tão as coisas?|tá a ${periodoFallback}?}`,
          'Correria por aqui kkk',
          'Te amo {amor|vida|morem}! Qualquer coisa me avisa.',
          'Um beijo {amor|lindo(a)}! Se cuida ❤️',
        ];
      } else {
        templates = [
          '{Tudo ótimo|Tudo certo|Aqui tá bom} {amor|vida}. {E com você?|E por aí?}',
          '{Kkkk|Rsrs} {verdade amor|é isso mesmo vida}.',
          '{Que bom|Que massa} {amor|vida}! Te amo ❤️',
        ];
      }
    } else {
      if (mergedHistory.length === 0) {
        templates = [
          `{E aí|Oi|Salve} {mano|cara|véi}, {tudo bem?|tudo certo?|como vc tá?}`,
          `${saudacaoFallback}! {Tudo bem por aí?|Tudo tranquilo?}`,
          `{Fala|Diz aí|E aí} {mano|cara}, {tranquilo?|na paz?|beleza?}`,
        ];
      } else if (isModelLast) {
        templates = [
          `E por aí, como {tá a ${periodoFallback}?|tão as coisas?}`,
          'Correria por aqui hoje kkk',
          'Qualquer coisa {dá um grito|me avisa|me chama}.',
        ];
      } else {
        templates = [
          '{Tranquilo|Tá ótimo|Aqui tá bom} por aqui. {E com você?|E por aí?}',
          '{Kkkk|Rsrs} {verdade|demais|engraçado}.',
          '{Show|Boa|Top|Massa}! {Que bom|Excelente}.',
          '{Verdade|Exato|Pois é}... {complicado isso|correria demais}.',
        ];
      }
    }
    const template = templates[Math.floor(Math.random() * templates.length)];
    return processSpintax(template);
  }
}

/**
 * Calcula o delay de digitação baseado no tamanho e "humor" do texto.
 * Mais humano que o delay linear anterior.
 */
export function calculateTypingDelay(text: string): number {
  const baseCharsPerSecond = 5 + Math.random() * 4; // 5-9 chars/segundo (humano)
  const baseDelay = (text.length / baseCharsPerSecond) * 1000;
  
  // Adiciona "pausa de pensamento" aleatória (0-3 segundos extras)
  const thinkingPause = Math.random() * 3000;
  
  // Às vezes simula uma "correção de erro" (delay extra de 500ms-2s)
  const typoCorrection = Math.random() < 0.2 ? Math.random() * 1500 + 500 : 0;

  const total = baseDelay + thinkingPause + typoCorrection;
  return Math.min(Math.max(total, 1500), 18000); // Entre 1.5s e 18s
}
