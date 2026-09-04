-- Migration: Adiciona campo 'value' à tabela Contact para CRM Kanban
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "value" DOUBLE PRECISION DEFAULT 0;
