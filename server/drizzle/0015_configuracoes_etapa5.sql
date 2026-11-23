CREATE TABLE "review_reminder" (
	"kind" varchar(20) PRIMARY KEY NOT NULL,
	"every_days" integer NOT NULL,
	"last_reviewed" date,
	CONSTRAINT "review_reminder_days_check" CHECK ("review_reminder"."every_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "message_template" text;--> statement-breakpoint
-- Lembretes padrão (RN35): produtos do cardápio a cada 7 dias, horário a cada 15, preços a cada 30.
-- A contagem começa no dia da migração.
INSERT INTO "review_reminder" ("kind", "every_days", "last_reviewed") VALUES
	('cardapio', 7, CURRENT_DATE),
	('horario', 15, CURRENT_DATE),
	('precos', 30, CURRENT_DATE)
ON CONFLICT ("kind") DO NOTHING;
