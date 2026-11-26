ALTER TABLE "product" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
-- Produto sem cardápio (RF64, decidido em 26/11/2026): o gatilho da migração 0018 passa a aceitar
-- o cardápio principal vazio. Sem cardápio, não há vínculo principal a manter.
CREATE OR REPLACE FUNCTION "product_primary_link"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."category_id" IS NOT NULL AND NEW."category_id" IS DISTINCT FROM OLD."category_id" THEN
    DELETE FROM "product_category" WHERE "product_id" = NEW."id" AND "category_id" = OLD."category_id";
  END IF;
  IF NEW."category_id" IS NOT NULL THEN
    INSERT INTO "product_category" ("product_id", "category_id", "position")
    VALUES (NEW."id", NEW."category_id", NEW."position")
    ON CONFLICT ("product_id", "category_id") DO UPDATE SET "position" = EXCLUDED."position";
  END IF;
  RETURN NEW;
END $$;
