CREATE TYPE "public"."qs_rating" AS ENUM('strong', 'adequate', 'requires_improvement', 'not_assessed');--> statement-breakpoint
CREATE TABLE "reg44_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"visitor_user_id" uuid NOT NULL,
	"visited_on" timestamp NOT NULL,
	"announced" boolean DEFAULT false NOT NULL,
	"children_spoken_to" integer,
	"children_present" integer,
	"staff_spoken_to" text,
	"others_consulted" text,
	"records_reviewed" text,
	"safeguarding_opinion" text,
	"safeguarding_effective" boolean,
	"conduct_opinion" text,
	"conduct_promotes_wellbeing" boolean,
	"childrens_views" text,
	"environment" text,
	"follow_up_on_previous" text,
	"recommendations" text,
	"report_issued_on" timestamp,
	"ofsted_copy_on" timestamp,
	"manager_response" text,
	"manager_responded_at" timestamp with time zone,
	"manager_responded_by" uuid,
	"supersedes_id" uuid,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"amendment_reason" text,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "reg45_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"period_from" timestamp NOT NULL,
	"period_to" timestamp NOT NULL,
	"data_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"standards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"strengths" text,
	"areas_for_improvement" text,
	"progress_on_previous_actions" text,
	"feedback_from_children" text,
	"feedback_from_others" text,
	"ofsted_copy_on" timestamp,
	"ri_signed_at" timestamp with time zone,
	"ri_signed_by" uuid,
	"supersedes_id" uuid,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"amendment_reason" text,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_visitor_user_id_users_id_fk" FOREIGN KEY ("visitor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_manager_responded_by_users_id_fk" FOREIGN KEY ("manager_responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg44_visits" ADD CONSTRAINT "reg44_visits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_ri_signed_by_users_id_fk" FOREIGN KEY ("ri_signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg45_reviews" ADD CONSTRAINT "reg45_reviews_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reg44_home_date_idx" ON "reg44_visits" USING btree ("home_id","visited_on");--> statement-breakpoint
CREATE INDEX "reg45_home_idx" ON "reg45_reviews" USING btree ("home_id","period_to");