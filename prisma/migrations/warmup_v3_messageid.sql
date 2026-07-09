-- warmup_v3_messageid.sql
-- Adiciona campo messageId (ID real do WhatsApp) nos logs de aquecimento.
-- Isso permite que reações usem o ID correto da mensagem ao invés de um fictício.

ALTER TABLE "WarmupLog"     ADD COLUMN IF NOT EXISTS "messageId" TEXT;
ALTER TABLE "WarmupPoolLog" ADD COLUMN IF NOT EXISTS "messageId" TEXT;
