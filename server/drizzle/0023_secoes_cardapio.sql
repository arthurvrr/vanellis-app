CREATE TABLE "menu_section" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_section_id_category_unique" UNIQUE("id","category_id")
);
--> statement-breakpoint
ALTER TABLE "product_category" ADD COLUMN "section_id" integer;--> statement-breakpoint
ALTER TABLE "menu_section" ADD CONSTRAINT "menu_section_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_section_category_name_unique" ON "menu_section" USING btree ("category_id",lower("name"));--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_section_fk" FOREIGN KEY ("section_id","category_id") REFERENCES "public"."menu_section"("id","category_id") ON DELETE no action ON UPDATE no action;