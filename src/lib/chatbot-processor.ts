import { prisma } from './prisma';
import { evolutionApi } from './evolution';
import { isWithinBusinessHours } from './warmup-schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';

/**
 * Processa mensagens recebidas do webhook e executa a lógica do chatbot auto-responder.
 */
export async function handleChatbotIncoming(phone: string, text: string, instanceName: string): Promise<void> {
  try {
    const cleanText = text.trim().toLowerCase();
    if (!cleanText) return;

    // 1. Obter ou criar configuração global do chatbot
    let config = await prisma.chatbotConfig.findUnique({
      where: { id: 'global' },
    });

    if (!config) {
      config = await prisma.chatbotConfig.create({
        data: {
          id: 'global',
          aiEnabled: false,
          aiContext: 'Você é um assistente de atendimento virtual prestativo e educado.',
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

      // Buscar histórico recente de chat para dar contexto à IA
      const recentLogs = await prisma.chatbotLog.findMany({
        where: { phone },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });

      // Formatar o histórico (do mais antigo para o mais recente)
      const historyPrompt = recentLogs
        .reverse()
        .map((l) => `Cliente: ${l.messageIn}\nVocê: ${l.messageOut}`)
        .join('\n');

      const systemContext = config.aiContext;
      const prompt = `${systemContext}

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
        await evolutionApi.sendTextMessage(instanceName, phone, aiResponse);

        // Logar interação
        await prisma.chatbotLog.create({
          data: {
            phone,
            messageIn: text,
            messageOut: aiResponse,
            source: 'AI',
          },
        });
      }
    }
  } catch (error: any) {
    logger.error('Erro ao processar chatbot incoming', error);
  }
}
