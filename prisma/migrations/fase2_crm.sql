-- Migração: Fase 2.3 - CRM Kanban
-- Executar no banco PostgreSQL do servidor (wajato_db)

-- 1. Criar tabela CrmStage
CREATE TABLE IF NOT EXISTS "CrmStage" (
  "id"          TEXT         NOT NULL,
  "name"        TEXT         NOT NULL UNIQUE,
  "color"       TEXT         NOT NULL DEFAULT '#3b82f6',
  "order"       INTEGER      NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmStage_pkey" PRIMARY KEY ("id")
);

-- 2. Adicionar coluna stageId na tabela Contact
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "stageId" TEXT;

-- 3. Criar chave estrangeira para stageId na tabela Contact apontando para CrmStage
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_stageId_fkey" 
  FOREIGN KEY ("stageId") REFERENCES "CrmStage"("id") ON DELETE SET NULL;

-- 4. Verificar resultado
SELECT 'CrmStage: ' || COUNT(*) FROM "CrmStage";
