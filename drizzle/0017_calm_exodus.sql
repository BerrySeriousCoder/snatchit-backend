CREATE TABLE "studio_generation_chain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_step_id" uuid,
	"step_number" integer DEFAULT 1,
	"source_image_url" text,
	"pose_id" uuid,
	"prop_id" uuid,
	"scene_preset_id" uuid,
	"scene_custom" text,
	"scene_reference_url" text,
	"lighting_preset_id" uuid,
	"lighting_custom" text,
	"garment_url" text,
	"output_url" text,
	"prompt_used" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_lighting_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_poses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"category" text,
	"thumbnail_url" text,
	"control_image_url" text NOT NULL,
	"is_stock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_props" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"category" text,
	"thumbnail_url" text,
	"image_url" text,
	"prompt_text" text,
	"is_stock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_scene_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"category" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_generation_chain" ADD CONSTRAINT "studio_generation_chain_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_generation_chain" ADD CONSTRAINT "studio_generation_chain_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_generation_chain" ADD CONSTRAINT "studio_generation_chain_pose_id_studio_poses_id_fk" FOREIGN KEY ("pose_id") REFERENCES "public"."studio_poses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_generation_chain" ADD CONSTRAINT "studio_generation_chain_prop_id_studio_props_id_fk" FOREIGN KEY ("prop_id") REFERENCES "public"."studio_props"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_generation_chain" ADD CONSTRAINT "studio_generation_chain_scene_preset_id_studio_scene_presets_id_fk" FOREIGN KEY ("scene_preset_id") REFERENCES "public"."studio_scene_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_generation_chain" ADD CONSTRAINT "studio_generation_chain_lighting_preset_id_studio_lighting_presets_id_fk" FOREIGN KEY ("lighting_preset_id") REFERENCES "public"."studio_lighting_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_poses" ADD CONSTRAINT "studio_poses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_props" ADD CONSTRAINT "studio_props_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gen_chain_user_id_idx" ON "studio_generation_chain" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gen_chain_project_id_idx" ON "studio_generation_chain" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_pose_user_id_idx" ON "studio_poses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_prop_user_id_idx" ON "studio_props" USING btree ("user_id");