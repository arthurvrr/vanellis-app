ALTER TABLE "special_date" ADD COLUMN "choose_time" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "special_date" ADD COLUMN "window_start" time;--> statement-breakpoint
ALTER TABLE "special_date" ADD COLUMN "window_end" time;--> statement-breakpoint
ALTER TABLE "special_date" ADD CONSTRAINT "special_date_window_check" CHECK (("special_date"."window_start" is null and "special_date"."window_end" is null) or ("special_date"."window_end" > "special_date"."window_start"));