-- ============================================================
-- Migração: warmup_instances_upgrade
-- Adiciona suporte a metadados de perfil nas instâncias
-- ============================================================

-- Adiciona coluna profileName
ALTER TABLE "WhatsAppInstance" 
ADD COLUMN IF NOT EXISTS "profileName" TEXT;

-- Adiciona coluna profilePicUrl
ALTER TABLE "WhatsAppInstance" 
ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;
