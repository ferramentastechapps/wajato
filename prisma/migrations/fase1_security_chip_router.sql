-- Migração: Fase 1 - Melhorias de Segurança e Rotação de Chips
-- Executar no banco PostgreSQL do servidor (wajato_db)

-- 1. Adicionar enum de roles de usuário
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Adicionar coluna 'role' na tabela User (com default VIEWER)
ALTER TABLE "User" 
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'VIEWER';

-- 3. Promover o usuário admin existente para ADMIN
UPDATE "User" SET "role" = 'ADMIN' WHERE "username" = 'admin';

-- 4. Adicionar colunas de saúde/reputação e cota diária para instâncias WhatsApp
ALTER TABLE "WhatsAppInstance"
  ADD COLUMN IF NOT EXISTS "dailyMsgCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "healthScore"   INTEGER NOT NULL DEFAULT 100;

-- 5. Verificar resultado
SELECT "username", "role" FROM "User";
SELECT "name", "status", "dailyMsgCount", "healthScore" FROM "WhatsAppInstance";
