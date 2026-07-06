-- ============================================================
-- Migração: warmup_professional_upgrade
-- Sistema de Aquecimento WhatsApp — WaJato
-- Aplicar no servidor: psql -U wajato -d wajato_db
-- ============================================================

-- 1. Adicionar enum WarmupMessageType
DO $$ BEGIN
  CREATE TYPE "WarmupMessageType" AS ENUM ('TEXT', 'EMOJI', 'REACTION', 'STICKER', 'AUDIO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Adicionar campos novos na tabela WarmupCampaign
ALTER TABLE "WarmupCampaign"
  ADD COLUMN IF NOT EXISTS "name"              TEXT,
  ADD COLUMN IF NOT EXISTS "initialMsgsPerDay" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "maxMsgsPerDay"     INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS "startHour"         INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "endHour"           INTEGER NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS "heatScore"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastMessageAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "restPeriodUntil"   TIMESTAMP(3);

-- 3. Ajustar valores default existentes
ALTER TABLE "WarmupCampaign"
  ALTER COLUMN "totalDays"       SET DEFAULT 30,
  ALTER COLUMN "targetMsgsToday" SET DEFAULT 5;

-- 4. Tornar targetInstance opcional (permitir NULL)
ALTER TABLE "WarmupCampaign"
  ALTER COLUMN "targetInstance" DROP NOT NULL;

-- 5. Adicionar campo messageType na tabela WarmupLog
ALTER TABLE "WarmupLog"
  ADD COLUMN IF NOT EXISTS "messageType" "WarmupMessageType" NOT NULL DEFAULT 'TEXT';

-- ============================================================
-- Verificação: listar colunas adicionadas
-- ============================================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('WarmupCampaign', 'WarmupLog')
-- ORDER BY table_name, ordinal_position;
