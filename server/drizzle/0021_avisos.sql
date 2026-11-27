CREATE TABLE "aviso_evento" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" varchar(40) NOT NULL,
	"chave" varchar(80) NOT NULL,
	"gravidade" varchar(10) NOT NULL,
	"titulo" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"conta" varchar(50),
	"conta_fim" varchar(50),
	"ciente_por" varchar(50),
	"ciente_em" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "aviso_evento_aberto" ON "aviso_evento" USING btree ("chave") WHERE "aviso_evento"."fim" is null;--> statement-breakpoint
CREATE INDEX "aviso_evento_inicio" ON "aviso_evento" USING btree ("inicio");