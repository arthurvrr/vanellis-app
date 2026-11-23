ALTER TABLE "category" ADD COLUMN "special" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "visible_from" date;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "visible_until" date;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "pickup_dates" date[] DEFAULT '{}'::date[] NOT NULL;