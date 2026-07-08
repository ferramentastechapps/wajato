-- prisma/migrations/warmup_v2_4_upgrade.sql
-- Adiciona coluna de proxy na tabela WhatsAppInstance
ALTER TABLE "WhatsAppInstance" ADD COLUMN IF NOT EXISTS "proxy" TEXT;

-- Adiciona coluna de identificação de grupo na tabela WarmupCampaign
ALTER TABLE "WarmupCampaign" ADD COLUMN IF NOT EXISTS "isGroup" BOOLEAN DEFAULT false;
