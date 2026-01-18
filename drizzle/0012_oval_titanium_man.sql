ALTER TABLE "waitlist" ADD COLUMN "verification_code" varchar(6);--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "verification_code_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;