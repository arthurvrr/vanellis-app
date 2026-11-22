CREATE TABLE "store_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"whatsapp_number" varchar(15) NOT NULL,
	"instagram_url" varchar(200),
	"contact_phone" varchar(15),
	CONSTRAINT "store_settings_single_row" CHECK ("store_settings"."id" = 1),
	CONSTRAINT "store_settings_whatsapp_check" CHECK ("store_settings"."whatsapp_number" ~ '^[0-9]{12,15}$')
);
