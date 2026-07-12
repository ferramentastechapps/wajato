-- warmup_status_config.sql
-- Adiciona campos de configuração de Status/Stories e suporte a imagem na campanha de aquecimento

ALTER TABLE "WarmupCampaign"
  ADD COLUMN IF NOT EXISTS "enableStatus" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "statusFrequency" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "statusType" TEXT NOT NULL DEFAULT 'text';
