/**
 * Mídias do agente POR EMPRESA (ChatbotConfig.agentMedia, JSON editável no painel).
 *
 * O roteiro (flowScript) pede o envio com a tag [[SIGMA_ACTION:SEND_MEDIA:<asset>]]
 * e o processador do chatbot envia a mídia configurada aqui:
 *  - "zuxo" → zuxoLogoUrl (imagem do logo, pra pessoa identificar o app na loja)
 *  - "msx"  → msxTutorialText (texto) + msxIconUrl (ícone do app) + msxVideoUrl (vídeo)
 *
 * Empresa sem mídia configurada = o agente não envia nada (a tag é só removida).
 */
export interface AgentMedia {
  zuxoLogoUrl?: string;
  msxIconUrl?: string;
  msxVideoUrl?: string;
  msxTutorialText?: string;
}

export function parseAgentMedia(raw?: string | null): AgentMedia | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const media: AgentMedia = {};
    for (const key of ['zuxoLogoUrl', 'msxIconUrl', 'msxVideoUrl', 'msxTutorialText'] as const) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) media[key] = value;
    }
    return Object.keys(media).length > 0 ? media : null;
  } catch {
    return null;
  }
}
