CREATE INDEX "follower_idx" ON "follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "following_idx" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "is_public_idx" ON "looks" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "looks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "created_at_idx" ON "looks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reaction_look_id_idx" ON "reactions" USING btree ("look_id");--> statement-breakpoint
CREATE INDEX "reaction_user_id_idx" ON "reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_images_user_id_idx" ON "user_images" USING btree ("user_id");