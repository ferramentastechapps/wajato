-- Add chatbotPausedUntil to Contact table
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "chatbotPausedUntil" TIMESTAMP(3);
