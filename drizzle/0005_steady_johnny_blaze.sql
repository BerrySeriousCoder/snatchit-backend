ALTER TABLE "user_images" ADD COLUMN "aspect_ratio" text DEFAULT '3:4' NOT NULL;--> statement-breakpoint
CREATE INDEX "user_public_idx" ON "looks" USING btree ("user_id","is_public");