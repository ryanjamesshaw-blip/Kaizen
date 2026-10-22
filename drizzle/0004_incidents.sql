CREATE TYPE "public"."incident_type" AS ENUM('incident', 'missing', 'physical_intervention', 'safeguarding', 'complaint', 'accident', 'medication_error', 'property_damage', 'police_involvement', 'allegation_against_staff');--> statement-breakpoint
CREATE TYPE "public"."notification_recipient" AS ENUM('ofsted', 'placing_authority', 'police', 'lado', 'iro', 'parents', 'ri', 'other');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'not_applicable');--> statement-breakpoint
CREATE TABLE "follow_up_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"child_id" uuid,
	"incident_id" uuid,
	"rule_key" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"regulation" text,
	"owner_role" "role",
	"owner_user_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"completion_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"child_id" uuid,
	"other_child_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"type" "incident_type" NOT NULL,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"location" text,
	"staff_involved" text,
	"witnesses" text,
	"antecedent" text,
	"narrative" text NOT NULL,
	"immediate_actions" text,
	"injuries" text,
	"notify_ofsted" boolean DEFAULT false NOT NULL,
	"notify_placing_authority" boolean DEFAULT false NOT NULL,
	"notify_police" boolean DEFAULT false NOT NULL,
	"notify_lado" boolean DEFAULT false NOT NULL,
	"manager_review_notes" text,
	"lessons_learned" text,
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
CREATE TABLE "missing_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"left_at" timestamp with time zone NOT NULL,
	"circumstances" text,
	"classification" text DEFAULT 'missing' NOT NULL,
	"police_informed_at" timestamp with time zone,
	"police_reference" text,
	"returned_at" timestamp with time zone,
	"returned_how" text,
	"condition_on_return" text,
	"return_conversation_at" timestamp with time zone,
	"return_conversation_notes" text,
	"independent_interview_offered_at" timestamp with time zone,
	"independent_interview_at" timestamp with time zone,
	"independent_interview_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"incident_id" uuid,
	"child_id" uuid,
	"recipient" "notification_recipient" NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"sent_by" uuid,
	"method" text,
	"reference" text,
	"notes" text,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "physical_interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"hold_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"staff_applying" text NOT NULL,
	"de_escalation_attempted" text NOT NULL,
	"justification" text NOT NULL,
	"injuries_child" text,
	"injuries_staff" text,
	"medical_attention" text,
	"effectiveness" text,
	"childs_view" text,
	"childs_view_recorded_at" timestamp with time zone,
	"childs_view_recorded_by" uuid,
	"staff_debrief_notes" text,
	"staff_debrief_at" timestamp with time zone,
	"manager_signed_at" timestamp with time zone,
	"manager_signed_by" uuid,
	"manager_comments" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_episodes" ADD CONSTRAINT "missing_episodes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_episodes" ADD CONSTRAINT "missing_episodes_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_episodes" ADD CONSTRAINT "missing_episodes_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_episodes" ADD CONSTRAINT "missing_episodes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_interventions" ADD CONSTRAINT "physical_interventions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_interventions" ADD CONSTRAINT "physical_interventions_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_interventions" ADD CONSTRAINT "physical_interventions_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_interventions" ADD CONSTRAINT "physical_interventions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_interventions" ADD CONSTRAINT "physical_interventions_childs_view_recorded_by_users_id_fk" FOREIGN KEY ("childs_view_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_interventions" ADD CONSTRAINT "physical_interventions_manager_signed_by_users_id_fk" FOREIGN KEY ("manager_signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_home_status_idx" ON "follow_up_tasks" USING btree ("home_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_incident_idx" ON "follow_up_tasks" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incidents_home_idx" ON "incidents" USING btree ("home_id","occurred_at");--> statement-breakpoint
CREATE INDEX "incidents_child_idx" ON "incidents" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "missing_incident_idx" ON "missing_episodes" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "missing_child_idx" ON "missing_episodes" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "notifications_incident_idx" ON "notifications" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "pi_incident_idx" ON "physical_interventions" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "pi_child_idx" ON "physical_interventions" USING btree ("child_id");