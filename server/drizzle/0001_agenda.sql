CREATE TABLE "agenda_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"min_lead_hours" integer DEFAULT 2 NOT NULL,
	"window_days" integer DEFAULT 30 NOT NULL,
	"orders_paused" boolean DEFAULT false NOT NULL,
	CONSTRAINT "agenda_config_single_row" CHECK ("agenda_config"."id" = 1),
	CONSTRAINT "agenda_config_lead_check" CHECK ("agenda_config"."min_lead_hours" >= 0),
	CONSTRAINT "agenda_config_window_check" CHECK ("agenda_config"."window_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "blocked_date" (
	"date" date PRIMARY KEY NOT NULL,
	"reason" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "closed_slot" (
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	CONSTRAINT "closed_slot_date_start_time_pk" PRIMARY KEY("date","start_time")
);
--> statement-breakpoint
CREATE TABLE "special_date" (
	"date" date PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date,
	CONSTRAINT "weekly_schedule_period_check" CHECK ("weekly_schedule"."valid_until" >= "weekly_schedule"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "weekly_slot" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "weekly_slot_unique" UNIQUE("schedule_id","weekday","start_time"),
	CONSTRAINT "weekly_slot_weekday_check" CHECK ("weekly_slot"."weekday" between 0 and 6),
	CONSTRAINT "weekly_slot_time_check" CHECK ("weekly_slot"."end_time" > "weekly_slot"."start_time")
);
--> statement-breakpoint
ALTER TABLE "weekly_slot" ADD CONSTRAINT "weekly_slot_schedule_id_weekly_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."weekly_schedule"("id") ON DELETE cascade ON UPDATE no action;