-- Add messageVariants, batchSize and batchCooldown to Campaign table
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "messageVariants" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "batchSize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "batchCooldown" INTEGER NOT NULL DEFAULT 600;
