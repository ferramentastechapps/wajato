-- Migration: add_template_hook_message
-- Adiciona campos de mensagem prévia anti-bloqueio (2 etapas) no Template e MessageLog

ALTER TABLE "Template"
  ADD COLUMN IF NOT EXISTS "enableHook"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hookMessage"  TEXT,
  ADD COLUMN IF NOT EXISTS "hookVariants" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "hookMode"     TEXT NOT NULL DEFAULT 'ON_REPLY',
  ADD COLUMN IF NOT EXISTS "hookDelay"    INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "MessageLog"
  ADD COLUMN IF NOT EXISTS "hookStatus"    TEXT,
  ADD COLUMN IF NOT EXISTS "hookSentAt"    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "hookRepliedAt" TIMESTAMP;
