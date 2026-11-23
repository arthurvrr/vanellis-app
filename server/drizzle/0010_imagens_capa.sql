CREATE TABLE "stored_image" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"mime" varchar(30) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "cover_image_url" varchar(255);