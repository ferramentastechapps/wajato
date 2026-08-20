-- Migration: Adicionar suporte ao Modo Contínuo / Manutenção Perpétua Antiban
ALTER TABLE "WarmupCampaign" ADD COLUMN IF NOT EXISTS "continuousMode" BOOLEAN DEFAULT true;
ALTER TABLE "WarmupPool" ADD COLUMN IF NOT EXISTS "continuousMode" BOOLEAN DEFAULT true;
