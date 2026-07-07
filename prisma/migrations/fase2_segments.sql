-- Migração: Fase 2.2 - Segmentação Avançada
-- Executar no banco PostgreSQL do servidor (wajato_db)

-- 1. Criar tabela ContactSegment
CREATE TABLE IF NOT EXISTS "ContactSegment" (
  "id"          TEXT         NOT NULL,
  "name"        TEXT         NOT NULL UNIQUE,
  "description" TEXT,
  "filters"     JSONB        NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactSegment_pkey" PRIMARY KEY ("id")
);

-- 2. Alterar coluna groupId na tabela Campaign para ser opcional
ALTER TABLE "Campaign" ALTER COLUMN "groupId" DROP NOT NULL;

-- 3. Adicionar coluna segmentId na tabela Campaign
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "segmentId" TEXT;

-- 4. Criar chave estrangeira para segmentId na tabela Campaign apontando para ContactSegment
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" 
  FOREIGN KEY ("segmentId") REFERENCES "ContactSegment"("id") ON DELETE SET NULL;

-- 5. Verificar resultado
SELECT 'ContactSegment: ' || COUNT(*) FROM "ContactSegment";
SELECT COUNT(*) FROM "Campaign" WHERE "segmentId" IS NULL;
