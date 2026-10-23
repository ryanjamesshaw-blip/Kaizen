CREATE TABLE "rule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_by" uuid,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD COLUMN "subject_key" text;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rule_runs" ADD CONSTRAINT "rule_runs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_runs" ADD CONSTRAINT "rule_runs_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_runs" ADD CONSTRAINT "rule_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_runs_home_idx" ON "rule_runs" USING btree ("home_id","ran_at");--> statement-breakpoint
CREATE INDEX "tasks_subject_idx" ON "follow_up_tasks" USING btree ("home_id","rule_key","subject_key");