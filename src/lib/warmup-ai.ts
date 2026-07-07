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

// ─── Áudios de Warmup ────────────────────────────────────────────────────────
// URLs públicas de áudio .ogg (opus) confiáveis para simular mensagens de voz reais.
export const WARMUP_AUDIO_URLS = [
  'https://github.com/espressif/esp-adf/raw/master/components/audio_hal/test/test_fatfs_stream/ff-16b-1c-44100hz.ogg',
  'https://github.com/espressif/esp-adf/raw/master/components/audio_hal/test/test_fatfs_stream/ff-16b-2c-44100hz.ogg',
  'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg',
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
 * Gera a próxima mensagem de texto para o aquecimento via Gemini AI.
 * Inclui contexto de persona rica, tópico dinâmico e instruções anti-detectabilidade.
 */
export async function generateNextWarmupMessage(
  context: string,
  history: ChatMessage[],
  topic?: string
): Promise<string> {
  try {
    const ai = await getGenAIInstance();
    const model = ai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: `Você está simulando uma conversa de WhatsApp casual e autêntica entre dois amigos brasileiros.
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

EXEMPLOS DE BOAS MENSAGENS:
- "kkk verdade"
- "oxe que isso mano"  
- "que foi"
- "ja vi esse ai"
- "tava pensando a mesma coisa"
- "pior que é verdade rsrs"
- "vai la"
- "hm deixa eu pensar..."
- "nem lembrava disso kk"

RETORNE APENAS A MENSAGEM, sem aspas, sem prefixos, sem explicações.`,
    });

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: 0.95, // Alta temperatura para máxima variedade
        maxOutputTokens: 80, // Mensagens curtas
        topP: 0.9,
        topK: 40,
      },
    });

    let prompt: string;
    if (history.length === 0) {
      prompt = topic
        ? `Inicie uma conversa casual sobre ${topic}. Uma saudação curta e informal.`
        : 'Inicie a conversa com uma saudação muito casual, como se fossem amigos.';
    } else {
      prompt = 'Responda de forma casual e curta à última mensagem, ou mude o assunto naturalmente.';
    }

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Erro ao gerar mensagem de warmup via Gemini:', error);
    // Fallback com Spintax para máxima variedade mesmo sem IA
    const fallbacks = [
      '{E aí|Oi|Salve} {mano|cara|véi}, {tudo certo?|tudo bem?|como vai?}',
      '{Tranquilo|Tá ótimo|Aqui tá bom} por aqui. {E vc?|E aí?|E tu?}',
      '{Pode crer|Com certeza|Exato}, {mano|cara}.',
      '{Show|Boa|Top} de {bola|mais}',
      '{Kkkk|Rsrs|Haha} {concordo|demais|é isso}',
      '{Depois|Logo mais} a gente {se fala|conversa} então, {abs|beijo|valeu}',
      '{Verdade|Exato|É mesmo}...',
      '{Como|Como tá|E} o {dia|trampo|fds}?',
      '{Ei|Opa|Oi}, sumido! {Tudo bem?|Tudo certo?|Como vai?}',
      'kkk que isso',
      'vai la mano',
      'ta bom',
    ];
    const template = fallbacks[Math.floor(Math.random() * fallbacks.length)];
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
