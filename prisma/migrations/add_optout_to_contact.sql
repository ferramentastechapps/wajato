-- Migration: add_optout_to_contact
-- Adiciona campos de opt-out ao modelo Contact
-- Contatos que optarem por sair não receberão mensagens de campanhas

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "optOut"   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "optOutAt" TIMESTAMP;
