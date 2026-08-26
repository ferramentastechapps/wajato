-- Migration: add_chatbot_rule_advanced_fields
-- Adiciona campos profissionais ao sistema de regras do chatbot

-- Prioridade de execução das regras (menor número = executado primeiro)
ALTER TABLE "ChatbotRule" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;

-- Categoria para organizar as regras (ex: vendas, suporte, horario)
ALTER TABLE "ChatbotRule" ADD COLUMN IF NOT EXISTS "category" TEXT;

-- Ação a ser tomada quando a regra dispara:
-- REPLY = apenas responde
-- TAG_AND_REPLY = aplica tags E responde
-- OPTOUT_AND_REPLY = registra opt-out E responde
-- TAG_ONLY = apenas aplica tags sem responder
ALTER TABLE "ChatbotRule" ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'REPLY';

-- Tags automáticas aplicadas ao contato quando a regra dispara
ALTER TABLE "ChatbotRule" ADD COLUMN IF NOT EXISTS "autoTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Índice para ordenação eficiente por prioridade
CREATE INDEX IF NOT EXISTS "ChatbotRule_priority_idx" ON "ChatbotRule"("priority" ASC);
