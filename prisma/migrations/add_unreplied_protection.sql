-- Adiciona colunas para protecao anti-ban por falta de resposta
ALTER TABLE "WhatsAppInstance" ADD COLUMN IF NOT EXISTS "unrepliedMsgCount" INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE "WhatsAppInstance" ADD COLUMN IF NOT EXISTS "maxUnrepliedLimit" INTEGER DEFAULT 20 NOT NULL;
ALTER TABLE "WhatsAppInstance" ADD COLUMN IF NOT EXISTS "unrepliedBlockEnabled" BOOLEAN DEFAULT true NOT NULL;
