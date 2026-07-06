import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

const getGenAI = () => {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
};

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/**
 * Gera a próxima mensagem da conversa para o aquecimento.
 * @param context Um pequeno contexto, ex: "Você é um jovem de 25 anos conversando com um amigo sobre esportes."
 * @param history O histórico de mensagens recentes entre as duas instâncias.
 */
export async function generateNextWarmupMessage(
  context: string,
  history: ChatMessage[]
): Promise<string> {
  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `Você está simulando uma conversa de WhatsApp casual entre amigos para aquecer um número.
Regras:
1. Seja MUITO casual, use gírias brasileiras comuns (pô, mano, véi, rsrs, haha).
2. Não escreva textos longos. Mantenha entre 1 e 3 linhas curtas.
3. Pode cometer pequenos erros de digitação propositais de vez em quando (ex: "tbm", "vc", "nao").
4. Apenas retorne a mensagem que você enviaria, nada de "Mensagem:" ou aspas.
5. O histórico do chat já foi fornecido. Responda à última mensagem ou inicie um assunto.
6. Contexto atual da sua persona: ${context}`,
    });

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 100,
      },
    });

    const prompt = history.length === 0 
      ? 'Inicie a conversa agora com uma saudação casual ou uma pergunta sobre o dia.'
      : 'Responda a última mensagem de forma casual e dê continuidade ao assunto.';

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Erro ao gerar mensagem de warmup via Gemini:', error);
    // Fallback estático caso a IA falhe
    const fallbacks = [
      "E aí, tudo certo?",
      "Tranquilo por aqui. E vc?",
      "Pode crer, mano.",
      "Show de bola",
      "Kkkkkk concordo",
      "Depois a gente se fala então, abs",
      "Verdade...",
      "Como tá o dia hoje?"
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}
