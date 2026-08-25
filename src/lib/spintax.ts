/**
 * Utilitário de Spintax e Interpolação de Mensagens
 * Suporta tags {opcao1|opcao2|opcao3} aninhadas ou sequenciais,
 * variáveis como {{nome}} e {{link}}.
 */

export function parseSpintax(text: string): string {
  if (!text) return '';
  let result = text;
  const pattern = /\{([^{}]+)\}/;
  let match;
  let safety = 0;
  while ((match = pattern.exec(result)) !== null && safety++ < 100) {
    const options = match[1].split('|');
    const chosen = options[Math.floor(Math.random() * options.length)];
    result = result.replace(match[0], chosen);
  }
  return result;
}

export function formatMessageText(
  rawText: string,
  variables: { name?: string | null; link?: string | null } = {}
): string {
  const contactName = variables.name || 'Cliente';
  const groupLink = variables.link || '';

  let text = rawText
    .replace(/{{nome}}/g, contactName)
    .replace(/{{link}}/g, groupLink);

  return parseSpintax(text);
}
