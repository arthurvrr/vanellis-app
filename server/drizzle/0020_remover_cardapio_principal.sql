-- PR E4: o vínculo product_category é a única ligação entre produto e cardápio. Saem o cardápio
-- principal (product.category_id e product.position), o gatilho que o mantinha (0018, 0019) e a
-- coluna category.visible_until, sem uso desde o RF60. Esta migração APAGA colunas: a volta
-- automática para uma versão anterior não funciona depois dela (ver deploy/publicar.sh).
DROP TRIGGER IF EXISTS "product_primary_link" ON "product";--> statement-breakpoint
DROP FUNCTION IF EXISTS "product_primary_link"();--> statement-breakpoint
ALTER TABLE "product" DROP CONSTRAINT "product_category_id_category_id_fk";
--> statement-breakpoint
ALTER TABLE "category" DROP COLUMN "visible_until";--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN "position";