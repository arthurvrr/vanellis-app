CREATE TABLE "product_category" (
	"product_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_category_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Cada produto começa no cardápio que já tinha, na mesma posição (RF64).
INSERT INTO "product_category" ("product_id", "category_id", "position")
SELECT "id", "category_id", "position" FROM "product";--> statement-breakpoint
-- Até o PR E3, o painel edita só o cardápio principal (product.category_id). Este gatilho mantém o
-- vínculo dele igual: produto novo, troca de cardápio e mudança de posição. Sai no PR E4, junto
-- com a coluna.
CREATE FUNCTION "product_primary_link"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."category_id" <> OLD."category_id" THEN
    DELETE FROM "product_category" WHERE "product_id" = NEW."id" AND "category_id" = OLD."category_id";
  END IF;
  INSERT INTO "product_category" ("product_id", "category_id", "position")
  VALUES (NEW."id", NEW."category_id", NEW."position")
  ON CONFLICT ("product_id", "category_id") DO UPDATE SET "position" = EXCLUDED."position";
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "product_primary_link" AFTER INSERT OR UPDATE OF "category_id", "position" ON "product"
FOR EACH ROW EXECUTE FUNCTION "product_primary_link"();
