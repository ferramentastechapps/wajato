-- Adiciona campo bodyVariants ao modelo Template
-- Variações do texto principal para rotação anti-ban
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "bodyVariants" TEXT[] DEFAULT ARRAY[]::TEXT[];
