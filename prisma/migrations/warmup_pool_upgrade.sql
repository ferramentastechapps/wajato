-- ============================================================
-- Migração: warmup_pool_upgrade
-- Sistema de Aquecimento de Números em Grupo (P2P Pool)
-- Aplicar no servidor: psql -U wajato -d wajato_db
-- ============================================================

-- 1. Criar a tabela WarmupPool
CREATE TABLE IF NOT EXISTS "WarmupPool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WarmupStatus" NOT NULL DEFAULT 'RUNNING',
    "instanceNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "totalDays" INTEGER NOT NULL DEFAULT 30,
    "msgsSentToday" INTEGER NOT NULL DEFAULT 0,
    "targetMsgsToday" INTEGER NOT NULL DEFAULT 5,
    "initialMsgsPerDay" INTEGER NOT NULL DEFAULT 5,
    "maxMsgsPerDay" INTEGER NOT NULL DEFAULT 150,
    "startHour" INTEGER NOT NULL DEFAULT 8,
    "endHour" INTEGER NOT NULL DEFAULT 22,
    "heatScore" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "restPeriodUntil" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarmupPool_pkey" PRIMARY KEY ("id")
);

-- 2. Criar a tabela WarmupPoolLog
CREATE TABLE IF NOT EXISTS "WarmupPoolLog" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "fromInstance" TEXT NOT NULL,
    "toInstance" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "messageType" "WarmupMessageType" NOT NULL DEFAULT 'TEXT',
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "delayUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarmupPoolLog_pkey" PRIMARY KEY ("id")
);

-- 3. Adicionar chave estrangeira
ALTER TABLE "WarmupPoolLog" 
    ADD CONSTRAINT "WarmupPoolLog_poolId_fkey" 
    FOREIGN KEY ("poolId") REFERENCES "WarmupPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
