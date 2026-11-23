ALTER TABLE "option_group" ADD COLUMN "price_mode" varchar(7);--> statement-breakpoint
ALTER TABLE "option_group" ADD COLUMN "has_weight" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "option_group" ADD COLUMN "has_pdv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_price_mode_check" CHECK ("option_group"."price_mode" in ('replace', 'add'));--> statement-breakpoint
-- Preenche as características dos grupos que já existem a partir das opções deles.
UPDATE "option_group" g SET
  "price_mode" = (SELECT o."price_mode" FROM "option" o WHERE o."group_id" = g."id" AND o."price_mode" IS NOT NULL LIMIT 1),
  "has_weight" = EXISTS (SELECT 1 FROM "option" o WHERE o."group_id" = g."id" AND o."weight_min_kg" IS NOT NULL),
  "has_pdv" = EXISTS (SELECT 1 FROM "option" o WHERE o."group_id" = g."id" AND o."pdv_code" IS NOT NULL);
