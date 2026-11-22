CREATE TABLE "category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "category_name_unique" UNIQUE("name"),
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "option" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"pdv_code" varchar(20),
	"description" text,
	"image_url" varchar(255),
	"price_mode" varchar(7),
	"price" numeric(10, 2),
	"weight_min_kg" numeric(6, 3),
	"weight_max_kg" numeric(6, 3),
	"available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "option_pdv_code_unique" UNIQUE("pdv_code"),
	CONSTRAINT "option_group_name_unique" UNIQUE("group_id","name"),
	CONSTRAINT "option_price_mode_check" CHECK ("option"."price_mode" in ('replace', 'add')),
	CONSTRAINT "option_price_check" CHECK (("option"."price_mode" is null) = ("option"."price" is null)),
	CONSTRAINT "option_weight_check" CHECK ("option"."weight_max_kg" >= "option"."weight_min_kg")
);
--> statement-breakpoint
CREATE TABLE "option_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"controls_image" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "option_group_select_check" CHECK ("option_group"."min_select" >= 0 and "option_group"."max_select" >= 1 and "option_group"."max_select" >= "option_group"."min_select")
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY NOT NULL,
	"pdv_code" varchar(20),
	"category_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"image_url" varchar(255),
	"image_alt" text,
	"sale_unit" varchar(2) NOT NULL,
	"base_price" numeric(10, 2),
	"weight_min_kg" numeric(6, 3),
	"weight_max_kg" numeric(6, 3),
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"lead_time_hours" integer,
	"available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_pdv_code_unique" UNIQUE("pdv_code"),
	CONSTRAINT "product_sale_unit_check" CHECK ("product"."sale_unit" in ('UN', 'KG')),
	CONSTRAINT "product_min_quantity_check" CHECK ("product"."min_quantity" > 0),
	CONSTRAINT "product_weight_check" CHECK ("product"."weight_max_kg" >= "product"."weight_min_kg")
);
--> statement-breakpoint
CREATE TABLE "product_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"sale_unit" varchar(2) NOT NULL,
	"groups" jsonb NOT NULL,
	CONSTRAINT "product_template_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "option" ADD CONSTRAINT "option_group_id_option_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."option_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;