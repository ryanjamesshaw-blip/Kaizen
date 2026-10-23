CREATE TYPE "public"."ai_status" AS ENUM('draft', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ai_target" AS ENUM('reg45_review', 'chronology_summary', 'log_feedback', 'mock_inspection');--> statement-breakpoint
CREATE TABLE "ai_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"child_id" uuid,
	"target" "ai_target" NOT NULL,
	"target_id" uuid,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_hash" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"output" text NOT NULL,
	"output_json" jsonb,
	"status" "ai_status" DEFAULT 'draft' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_drafts_target_idx" ON "ai_drafts" USING btree ("target","target_id");--> statement-breakpoint
CREATE INDEX "ai_drafts_home_idx" ON "ai_drafts" USING btree ("home_id","created_at");