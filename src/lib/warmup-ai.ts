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

    const systemInstruction = `Você está simulando uma conversa de WhatsApp casual e autêntica entre dois amigos brasileiros.
Seu objetivo é fazer o algoritmo do WhatsApp acreditar que isso é uma conversa REAL entre pessoas.

REGRAS ABSOLUTAS:
1. Seja EXTREMAMENTE casual. Use: "kkk", "rsrs", "haha", "mano", "cara", "véi", "pô", "oxe", "eita", "né", "tbm", "vc", "tá", "cmg".
2. NUNCA escreva mais de 2-3 frases por mensagem. Mensagens longas parecem robô.
3. Cometa ERROS ORTOGRÁFICOS propositais ocasionalmente: "tambem" sem acento, "vou" como "vou", "não" como "nao", "está" como "ta".
4. Varie MUITO o comprimento: às vezes 1 palavra, às vezes 2 frases curtas.
5. Ocasionalmente use APENAS emojis como mensagem: "👍", "😂", "🔥".
6. NÃO comece sempre com a mesma palavra. Varie muito a forma de iniciar.
7. Responda à última mensagem de forma natural ou mude o assunto sutilmente.
8. Contexto da sua persona: ${context}
${topic ? `9. O assunto atual da conversa é: ${topic}` : ''}

RETORNE APENAS A MENSAGEM, sem aspas, sem prefixos, sem explicações.`;

    const isGroq = apiKey.startsWith('gsk_');
    const isOpenRouter = apiKey.startsWith('sk-or-');

    const lastMessage = mergedHistory[mergedHistory.length - 1];
    const isModelLast = lastMessage?.role === 'model';

    if (isGroq || isOpenRouter) {
      const prompt = mergedHistory.length === 0
        ? (topic ? `Inicie uma conversa casual sobre ${topic}. Uma saudação curta e informal.` : 'Inicie a conversa com uma saudação muito casual.')
        : (isModelLast
            ? 'Continue a conversa de forma casual como você mesmo (sem simular o outro e sem responder a si mesmo). Diga algo novo ou mude o assunto naturalmente.'
            : 'Responda de forma casual e curta à última mensagem, ou mude o assunto naturalmente.');

      const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const modelName = isGroq ? 'llama-3.1-8b-instant' : 'tencent/hy3:free';

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://wajato.ftech-apps.com.br';
        headers['X-Title'] = 'WaJato';
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemInstruction },
            ...mergedHistory.map(h => ({
              role: h.role === 'model' ? 'assistant' : 'user',
              content: h.parts[0].text,
            })),
            { role: 'user', content: prompt }
          ],
          temperature: 0.95,
          max_tokens: isOpenRouter ? 1000 : 80,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `Erro na chamada da API (${response.status})`);
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(JSON.stringify(data.error || data) || 'Resposta vazia do OpenRouter/Groq.');
      }
      return content.trim();
    } else {
      // Fluxo original Gemini
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction,
      });

      const chat = model.startChat({
        history: mergedHistory,
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 80,
          topP: 0.9,
          topK: 40,
        },
      });

      const prompt = mergedHistory.length === 0
        ? (topic ? `Inicie uma conversa casual sobre ${topic}. Uma saudação curta e informal.` : 'Inicie a conversa com uma saudação muito casual, como se fossem amigos.')
        : (isModelLast
            ? 'Continue a conversa de forma casual como você mesmo (sem simular o outro e sem responder a si mesmo). Diga algo novo ou mude o assunto naturalmente.'
            : 'Responda de forma casual e curta à última mensagem, ou mude o assunto naturalmente.');

      const result = await chat.sendMessage(prompt);
      const responseObj = await result.response;
      const text = responseObj.text();
      if (!text) {
        throw new Error('Resposta vazia da API do Gemini.');
      }
      return text.trim();
    }
  } catch (error) {
    console.error('Erro ao gerar mensagem de warmup via Gemini:', error);
    // Fallback inteligente com Spintax para máxima variedade de acordo com o estado do chat
    const mergedHistory = mergeConsecutiveRoles(history);
    const isModelLast = mergedHistory[mergedHistory.length - 1]?.role === 'model';
    let templates: string[];
    if (mergedHistory.length === 0) {
      templates = [
        '{E aí|Oi|Olá|Salve} {mano|cara|véi|amigo}, {tudo bem?|tudo certo?|como você tá?}',
        '{Bom dia|Boa tarde|Boa noite}! {Tudo bem por aí?|Como estão as coisas?|Tudo tranquilo?}',
        '{Ei|Opa|Oi}, {como você está?|tudo bem?|tá por aí?}',
        '{Fala|Diz aí|E aí} {mano|cara|véi}, {tranquilo?|na paz?|beleza?}',
        '{E aí|Opa}! {Como tá o dia?|Tudo na paz?|Como vão as coisas?}',
        '{Oi|Olá}! {Faz tempo que não nos falamos.|Como você tem passado?|Tudo bem por aí?}',
        '{Fala|Opa} {mano|cara}, {tranquilo?|tá ocupado?|beleza?}',
      ];
    } else if (isModelLast) {
      templates = [
        'E por aí, como {tão as coisas?|tá o dia?|tá o tempo?}',
        'Correria por aqui hoje kkk',
        'Depois me fala se {conseguiu ver aquilo|deu certo lá|vai dar certo o esquema}.',
        'Mas enfim, {depois nos falamos|mais tarde a gente conversa|qualquer coisa me avisa}.',
        'E o {trabalho|trampo|dia|fds} por aí, como {tá?|estão as coisas?}',
        'Bora trabalhar né kkk',
        'Qualquer coisa {dá um grito|me avisa|me chama por aqui}.',
      ];
    } else {
      templates = [
        '{Tranquilo|Tá ótimo|Aqui tá bom|Tudo certo} por aqui. {E com você?|E por aí?|E tu?}',
        '{Pode crer|Com certeza|Com certeza mano|Exato}, {concordo plenamente|faz sentido|é isso mesmo}.',
        '{Show|Boa|Top|Massa} {de bola|demais|hein}! {Que bom|Excelente}.',
        '{Kkkk|Rsrs|Haha|Kkkkk} {verdade|demais|engraçado|é bem isso}.',
        '{Depois|Logo mais|Mais tarde} a gente {se fala|conversa|dá uma conversada} então, {um abraço|valeu|té mais}.',
        '{Verdade|Exato|Pois é|É mesmo}... {complicado isso|correria demais}.',
        '{Como|Como tá|E} o {trabalho|trampo|dia|fds|tempo} por aí?',
        '{Que legal|Muito bom|Interessante}! {Não sabia disso.|Bom saber.}',
        '{Kkkk|Rsrs} {complicado|acontece|fazer o que né}',
        'Ah sim, {entendi|entendi perfeitamente|faz sentido}.',
        'Pode deixar, {aviso sim|combinado|qualquer coisa te falo}.',
        '{Beleza|Combinado|Fechado}! {Abraço|Valeu|Até}.',
      ];
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
