CREATE TABLE "closed_period" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "closed_period_time_check" CHECK ("closed_period"."end_time" > "closed_period"."start_time")
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"open_time" time NOT NULL,
	"close_time" time NOT NULL,
	CONSTRAINT "opening_hours_unique" UNIQUE("schedule_id","weekday"),
	CONSTRAINT "opening_hours_weekday_check" CHECK ("opening_hours"."weekday" between 0 and 6),
	CONSTRAINT "opening_hours_time_check" CHECK ("opening_hours"."close_time" > "opening_hours"."open_time")
);
--> statement-breakpoint
CREATE TABLE "pickup_restriction" (
	"id" serial PRIMARY KEY NOT NULL,
	"weekday" integer,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"label" varchar(60),
	CONSTRAINT "pickup_restriction_weekday_check" CHECK ("pickup_restriction"."weekday" between 0 and 6),
	CONSTRAINT "pickup_restriction_time_check" CHECK ("pickup_restriction"."end_time" > "pickup_restriction"."start_time")
);
--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_schedule_id_weekly_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."weekly_schedule"("id") ON DELETE cascade ON UPDATE no action;