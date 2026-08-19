-- Migration: add_company_profiles.sql
-- Adiciona suporte a múltiplas empresas e bases de conhecimento corporativas para o Chatbot IA e Campanhas

-- 1. Cria a tabela Company caso não exista
CREATE TABLE IF NOT EXISTS "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "description" TEXT NOT NULL,
    "productsServices" TEXT NOT NULL,
    "faq" TEXT,
    "policies" TEXT,
    "contactInfo" TEXT,
    "toneOfVoice" TEXT,
    "aiInstructions" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Adiciona a coluna companyId na tabela Contact se não existir
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- 3. Adiciona a coluna companyId na tabela Campaign se não existir
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- 4. Cria índices para performance de busca
CREATE INDEX IF NOT EXISTS "Company_isDefault_idx" ON "Company"("isDefault");
CREATE INDEX IF NOT EXISTS "Contact_companyId_idx" ON "Contact"("companyId");
CREATE INDEX IF NOT EXISTS "Campaign_companyId_idx" ON "Campaign"("companyId");
