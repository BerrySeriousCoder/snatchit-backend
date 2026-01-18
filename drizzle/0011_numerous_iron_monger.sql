ALTER TABLE "waitlist" ADD COLUMN "generations_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "last_image_url" text;