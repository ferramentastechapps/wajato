-- Migração: Fase 2.1 - Chatbot Auto-Responder
-- Executar no banco PostgreSQL do servidor (wajato_db)

-- 1. Tabela de regras de palavras-chave do chatbot
CREATE TABLE IF NOT EXISTS "ChatbotRule" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "trigger"     TEXT        NOT NULL UNIQUE,
  "matchType"   TEXT        NOT NULL DEFAULT 'EXACT',
  "response"    TEXT        NOT NULL,
  "imageUrl"    TEXT,
  "isActive"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatbotRule_pkey" PRIMARY KEY ("id")
);

-- 2. Tabela de configuração global do chatbot (singleton)
CREATE TABLE IF NOT EXISTS "ChatbotConfig" (
  "id"                TEXT        NOT NULL DEFAULT 'global',
  "aiEnabled"         BOOLEAN     NOT NULL DEFAULT FALSE,
  "aiContext"         TEXT        NOT NULL DEFAULT 'Você é um assistente de atendimento virtual prestativo e educado.',
  "businessHoursOnly" BOOLEAN     NOT NULL DEFAULT FALSE,
  "startHour"         INTEGER     NOT NULL DEFAULT 8,
  "endHour"           INTEGER     NOT NULL DEFAULT 18,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatbotConfig_pkey" PRIMARY KEY ("id")
);

-- 3. Tabela de log de interações do chatbot
CREATE TABLE IF NOT EXISTS "ChatbotLog" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "phone"       TEXT        NOT NULL,
  "messageIn"   TEXT        NOT NULL,
  "messageOut"  TEXT        NOT NULL,
  "source"      TEXT        NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatbotLog_pkey" PRIMARY KEY ("id")
);

-- 4. Inserir configuração global padrão
INSERT INTO "ChatbotConfig" ("id", "aiEnabled", "aiContext", "businessHoursOnly", "startHour", "endHour", "updatedAt")
VALUES ('global', FALSE, 'Você é um assistente de atendimento virtual prestativo e educado.', FALSE, 8, 18, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 5. Verificar resultado
SELECT 'ChatbotRule: ' || COUNT(*) FROM "ChatbotRule";
SELECT 'ChatbotConfig: ' || COUNT(*) FROM "ChatbotConfig";
SELECT 'ChatbotLog: ' || COUNT(*) FROM "ChatbotLog";
