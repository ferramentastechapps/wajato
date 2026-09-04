-- warmup_stages_and_dynamic_limit.sql
-- Adiciona suporte a limites dinâmicos com jitter (190-210) e estágios de aquecimento de rede

ALTER TABLE "WhatsAppInstance"
  ADD COLUMN IF NOT EXISTS "maxDailyLimit" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS "dailyLimitToday" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS "warmupStage" VARCHAR(50) NOT NULL DEFAULT 'FOUNDATION';

ALTER TABLE "WarmupCampaign"
  ADD COLUMN IF NOT EXISTS "isPrimaryContact" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "stage" VARCHAR(50) NOT NULL DEFAULT 'FOUNDATION';

-- Atualiza limites diários iniciais com jitter natural entre 190 e 210
UPDATE "WhatsAppInstance"
SET "dailyLimitToday" = "maxDailyLimit" + floor(random() * 21 - 10)
WHERE "dailyLimitToday" IS NULL OR "dailyLimitToday" = 200;
