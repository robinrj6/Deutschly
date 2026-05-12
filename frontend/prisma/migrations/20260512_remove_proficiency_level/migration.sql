-- Drop the unused proficiency level column from users.
ALTER TABLE "User" DROP COLUMN IF EXISTS "proficiencyLevel";
