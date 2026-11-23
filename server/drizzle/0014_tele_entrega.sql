ALTER TABLE "agenda_config" ADD COLUMN "delivery_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_config" ADD COLUMN "delivery_all_days" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_config" ADD COLUMN "delivery_dates" date[] DEFAULT '{}'::date[] NOT NULL;