-- CreateTable
CREATE TABLE IF NOT EXISTS "WhatsAppStatus" (
    "id" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "senderJid" TEXT NOT NULL,
    "senderName" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT,
    "mediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppStatus_pkey" PRIMARY KEY ("id")
);
