/**
 * luna-ai.ts
 * Cliente da Luna (modelo gpt-5.6-luna) via proxy teamsoclo, compatível com OpenAI.
 *
 * A Luna NÃO é OpenRouter: a chave dela nunca pode ser enviada para openrouter.ai
 * (o ramo antigo detectava `sk-or-` por prefixo). Por isso a seleção da Luna é
 * explícita, por variável de ambiente — `AI_PROVIDER=luna` — e é verificada
 * ANTES de qualquer checagem de prefixo da chave nos 3 arquivos de IA
 * (chatbot-processor, warmup-ai, chatbot-memory).
 *
 * - Modelo: `gpt-5.6-luna`
 * - Base URL: somente de `LUNA_BASE_URL` (sem URL fixa e sem padrão embutido)
 * - Chave: a mesma resolução já existente em cada arquivo (campo
 *   `config.geminiApiKey` no banco ou env) — o campo guarda só um bearer key
 */
export const LUNA_MODEL = 'gpt-5.6-luna';

/** Verdadeiro quando o provedor de IA selecionado é a Luna. */
export function isLunaProvider(): boolean {
  return process.env.AI_PROVIDER === 'luna';
}

/**
 * URL base do proxy teamsoclo, só de `LUNA_BASE_URL`.
 * Lança erro se não estiver configurada — nunca aponta para lugar nenhum por padrão.
 */
export function getLunaBaseUrl(): string {
  const baseUrl = (process.env.LUNA_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('LUNA_BASE_URL não configurada — defina a URL do proxy teamsoclo no ambiente.');
  }
  return baseUrl;
}

export interface LunaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LunaChatOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Uma chamada OpenAI-compatível `POST {LUNA_BASE_URL}/chat/completions`
 * com `Authorization: Bearer <key>` e modelo `gpt-5.6-luna`.
 * Retorna o texto da primeira escolha (vazio se não houver).
 * Lança erro quando a resposta HTTP não é 2xx, seguindo o padrão do ramo OpenRouter.
 */
export async function callLunaChatCompletions(
  apiKey: string,
  messages: LunaChatMessage[],
  options: LunaChatOptions = {}
): Promise<string> {
  const url = `${getLunaBaseUrl()}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LUNA_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 180,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Erro na API Luna (${res.status})`);
  return String(data.choices?.[0]?.message?.content || '').trim();
}
