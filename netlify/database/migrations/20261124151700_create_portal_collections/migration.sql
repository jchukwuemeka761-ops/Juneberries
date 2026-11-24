CREATE TABLE "portal_collections" (
	"key" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
