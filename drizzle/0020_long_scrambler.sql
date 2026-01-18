CREATE TABLE "purchase_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD CONSTRAINT "purchase_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_intent_user_id_idx" ON "purchase_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "purchase_intent_plan_id_idx" ON "purchase_intents" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "purchase_intent_created_at_idx" ON "purchase_intents" USING btree ("created_at");