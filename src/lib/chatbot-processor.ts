import { prisma } from './prisma';
import { evolutionApi } from './evolution';
import { isWithinBusinessHours } from './warmup-schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';
import { lidResolver } from './lid-resolver';

/**
 * Processa mensagens recebidas do webhook e executa a lógica do chatbot auto-responder.
 */
export async function handleChatbotIncoming(phone: string, text: string, instanceName: string): Promise<void> {
  try {
    const cleanText = text.trim().toLowerCase();
    if (!cleanText) return;

    // Verificar se o chatbot está temporariamente pausado para o contato devido a resposta manual
    // Wrapped in try/catch to tolerate stale Prisma client builds where the column may not yet be known
    try {
      const contact = await prisma.contact.findUnique({
        where: { phone }
      });
      if (contact?.chatbotPausedUntil && contact.chatbotPausedUntil > new Date()) {
        logger.info('Chatbot ignorado para contato porque está pausado temporariamente', { phone, pausedUntil: contact.chatbotPausedUntil });
        return;
      }
    } catch (pauseCheckErr: any) {
      // Se a coluna chatbotPausedUntil não existir no schema compilado, continua normalmente
      // Isso pode ocorrer quando o Prisma client não foi regenerado após uma migração
      logger.warn?.('[Chatbot] Aviso: falha ao verificar chatbotPausedUntil, continuando sem pausa', { phone, error: pauseCheckErr?.message });
    }

    // 1. Obter ou criar configuração global do chatbot
    let config = await prisma.chatbotConfig.findUnique({
      where: { id: 'global' },
    });

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

    // 2. Verificar horário de atendimento (caso habilitado na configuração)
    if (config.businessHoursOnly) {
      const withinHours = isWithinBusinessHours(config.startHour, config.endHour);
      if (!withinHours) {
        logger.info('Mensagem de chatbot ignorada fora do horário de atendimento', { phone, startHour: config.startHour, endHour: config.endHour });
        return;
      }
    }

    // 3. Buscar e comparar com regras/palavras-chave ativas
    const rules = await prisma.chatbotRule.findMany({
      where: { isActive: true },
    });

    let matchedRule = null;
    for (const rule of rules) {
      const triggerClean = rule.trigger.trim().toLowerCase();
      if (rule.matchType === 'EXACT') {
        if (cleanText === triggerClean) {
          matchedRule = rule;
          break;
        }
      } else if (rule.matchType === 'CONTAINS') {
        if (cleanText.includes(triggerClean)) {
          matchedRule = rule;
          break;
        }
      }
    }

    // 4. Responder se houver regra correspondente
    if (matchedRule) {
      logger.info('Regra de chatbot correspondente encontrada', { trigger: matchedRule.trigger, phone });
      
      if (matchedRule.imageUrl) {
        await evolutionApi.sendMediaMessage(
          instanceName,
          phone,
          matchedRule.imageUrl,
          'image',
          matchedRule.response
        );
      } else {
        await evolutionApi.sendTextMessage(instanceName, phone, matchedRule.response);
      }

      // Logar interação
      await prisma.chatbotLog.create({
        data: {
          phone,
          messageIn: text,
          messageOut: matchedRule.response,
          source: 'RULE',
        },
      });
      return;
    }

    // 5. Se nenhuma regra bateu e IA estiver ativada, usar o Gemini
    if (config.aiEnabled) {
      logger.info('Nenhuma regra encontrada. Gerando resposta com IA (Gemini)', { phone });
      
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('Chave de API do Gemini não configurada (nem individualmente nem globalmente no servidor)');
        return;
      }

      // Buscar histórico recente de chat real diretamente da Evolution API (unificando JID e LID se houver)
      let historyPrompt = '';
      try {
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        
        // Buscar mensagens do JID primário
        const messages = await evolutionApi.findMessages(instanceName, jid, 10);
        let finalMessages = Array.isArray(messages) ? messages : [];
        
        // Tentar obter JID secundário (LID) se aplicável
        let otherJid = null;
        if (jid.endsWith('@s.whatsapp.net')) {
          const phoneNum = jid.split('@')[0];
          const lid = lidResolver.getLid(phoneNum);
          if (lid) otherJid = lid;
        }
        
        if (otherJid) {
          try {
            const otherMessages = await evolutionApi.findMessages(instanceName, otherJid, 10);
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
          } catch (err) {
            console.error('[Chatbot Processor] Erro ao buscar JID secundário para histórico:', err);
          }
        }
        
        // Ordena as mensagens por timestamp crescente para o prompt da IA (do mais antigo para o mais recente)
        const sortedMessages = finalMessages.sort((a: any, b: any) => {
          const tsA = Number(a.messageTimestamp || 0);
          const tsB = Number(b.messageTimestamp || 0);
          return tsA - tsB;
        });
        
        historyPrompt = sortedMessages
          .map((m: any) => {
            const fromMe = m.key?.fromMe;
            const msgText = m.message?.conversation || m.message?.extendedTextMessage?.text || m.text || '';
            if (!msgText.trim()) return null;
            return fromMe ? `Você: ${msgText}` : `Cliente: ${msgText}`;
          })
          .filter(Boolean)
          .join('\n');
      } catch (err) {
        console.error('[Chatbot Processor] Erro ao buscar histórico da Evolution API, usando backup do ChatbotLog:', err);
        // Fallback para o comportamento antigo caso falhe
        const recentLogs = await prisma.chatbotLog.findMany({
          where: { phone },
          orderBy: { createdAt: 'desc' },
          take: 6,
        });
        historyPrompt = recentLogs
          .reverse()
          .map((l) => `Cliente: ${l.messageIn}\nVocê: ${l.messageOut}`)
          .join('\n');
      }

      const systemContext = config.aiContext;
      
      const humanEmulationRules = `
[REGRAS CRÍTICAS DE COMPORTAMENTO - SIGA RIGOROSAMENTE]:
1. Você DEVE se comportar como uma pessoa real (atendente humano da nossa equipe).
2. NUNCA diga ou dê a entender que você é um robô, inteligência artificial, assistente virtual, chatbot, assistente automático, LLM ou algoritmo.
3. Se o cliente perguntar se você é um robô ou chatbot, negue de forma descontraída e natural: diga que é humano e faz parte da equipe de atendimento (Ex: "Não, sou de carne e osso mesmo haha! Como posso te ajudar?", ou "Não, sou um atendente aqui da loja! Pode falar, no que posso ajudar?").
4. Escreva de forma natural, curta, direta e amigável:
   - Use parágrafos pequenos.
   - Use emojis de forma moderada e natural (ex: 👍, 😊, 😉).
   - Não use listas numeradas formais ou bullet points, a menos que o cliente peça uma lista. Fale como uma pessoa conversando no WhatsApp.
   - Evite respostas longas ou formais demais. Seja objetivo e prestativo.
`;

      const prompt = `${systemContext}
${humanEmulationRules}

Histórico da conversa recente com o cliente:
${historyPrompt}

Cliente diz: "${text}"
Gere uma resposta curta, educada, prestativa e muito natural para o WhatsApp do cliente. Responda como "Você". Não adicione prefixos como "Você:" na resposta final.`;

      let aiResponse = '';
      const isGroq = apiKey.startsWith('gsk_');
      const isOpenRouter = apiKey.startsWith('sk-or-');

      if (isGroq || isOpenRouter) {
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
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: isOpenRouter ? 1000 : 150,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || `Erro na chamada da API (${response.status})`);
        }
        aiResponse = data.choices[0].message.content.trim();
      } else {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150,
          },
        });

        const result = await model.generateContent(prompt);
        aiResponse = result.response.text().trim();
      }

      if (aiResponse) {
        // Limpar qualquer prefixo indesejado gerado pela IA
        const cleanResponse = aiResponse
          .replace(/^(Você|Atendente|Suporte|Equipe|AI|IA|Bot):\s*/i, '')
          .trim();

        // Calcular tempo de digitação (ex: 35ms por caractere, mínimo 1.5s, máximo 5s)
        const typingDelay = Math.min(Math.max(cleanResponse.length * 35, 1500), 5000);

        await evolutionApi.sendTextMessage(instanceName, phone, cleanResponse, typingDelay);

        // Logar interação
        await prisma.chatbotLog.create({
          data: {
            phone,
            messageIn: text,
            messageOut: cleanResponse,
            source: 'AI',
          },
        });
      }
    }
  } catch (error: any) {
    logger.error('Erro ao processar chatbot incoming', error);
  }
}
