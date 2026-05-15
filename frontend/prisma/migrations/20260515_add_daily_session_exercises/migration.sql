ALTER TABLE "DailySession"
  ADD COLUMN IF NOT EXISTS "exercisesPayload" JSONB;
