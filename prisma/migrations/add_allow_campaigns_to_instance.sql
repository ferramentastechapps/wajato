-- Migration: add_allow_campaigns_to_instance
ALTER TABLE "WhatsAppInstance" ADD COLUMN IF NOT EXISTS "allowCampaigns" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WhatsAppInstance"
SET "allowCampaigns" = true
WHERE "id" IN (
    SELECT DISTINCT wi.id
    FROM "WhatsAppInstance" wi
    INNER JOIN "WarmupCampaign" wc
      ON (wc."sourceInstance" = wi.name OR wc."targetInstance" = wi.name)
    WHERE wc."currentDay" >= wc."totalDays"
       OR wc."continuousMode" = true
);

UPDATE "WhatsAppInstance"
SET "allowCampaigns" = true
WHERE "id" IN (
    SELECT DISTINCT wi.id
    FROM "WhatsAppInstance" wi
    INNER JOIN "WarmupPool" wp
      ON wi.name = ANY(wp."instanceNames")
    WHERE wp."currentDay" >= wp."totalDays"
       OR wp."continuousMode" = true
);
