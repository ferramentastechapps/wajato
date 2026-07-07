-- prisma/migrations/warmup_v2_2_upgrade.sql
-- Adiciona colunas para múltiplos telefones e personas customizadas de IA na tabela WarmupCampaign
ALTER TABLE "WarmupCampaign" ADD COLUMN IF NOT EXISTS "targetPhones" TEXT;
ALTER TABLE "WarmupCampaign" ADD COLUMN IF NOT EXISTS "customContext" TEXT;
