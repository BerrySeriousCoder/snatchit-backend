CREATE TABLE "outfit_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outfit_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"product_url" text,
	"product_name" text,
	"product_image_url" text,
	"generated_image_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "bio" SET DATA TYPE varchar(150);--> statement-breakpoint
ALTER TABLE "outfit_generations" ADD CONSTRAINT "outfit_generations_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_gen_outfit_id_idx" ON "outfit_generations" USING btree ("outfit_id");--> statement-breakpoint
CREATE INDEX "outfit_gen_step_order_idx" ON "outfit_generations" USING btree ("outfit_id","step_order");--> statement-breakpoint
CREATE INDEX "outfit_user_id_idx" ON "outfits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outfit_created_at_idx" ON "outfits" USING btree ("created_at");