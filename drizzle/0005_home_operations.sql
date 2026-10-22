CREATE TYPE "public"."home_document_kind" AS ENUM('statement_of_purpose', 'childrens_guide', 'policy', 'risk_assessment_home', 'other');--> statement-breakpoint
CREATE TYPE "public"."mar_outcome" AS ENUM('given', 'refused', 'missed', 'not_required', 'error', 'destroyed');--> statement-breakpoint
CREATE TABLE "check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"check_type_id" uuid NOT NULL,
	"checked_on" timestamp NOT NULL,
	"passed" boolean NOT NULL,
	"findings" text,
	"action_taken" text,
	"checked_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"name" text NOT NULL,
	"frequency_days" integer NOT NULL,
	"regulation" text,
	"guidance" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"kind" "home_document_kind" NOT NULL,
	"title" text NOT NULL,
	"version" text NOT NULL,
	"effective_from" timestamp NOT NULL,
	"review_due_on" timestamp,
	"summary_of_changes" text,
	"ofsted_notified_on" timestamp,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"content" "bytea",
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "maintenance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"reported_on" timestamp NOT NULL,
	"reported_by" uuid,
	"location" text,
	"description" text NOT NULL,
	"priority" text DEFAULT 'routine' NOT NULL,
	"safety_risk" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_on" timestamp,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"administered_at" timestamp with time zone NOT NULL,
	"outcome" "mar_outcome" NOT NULL,
	"dose_given" text,
	"administered_by" uuid NOT NULL,
	"witnessed_by" uuid,
	"stock_after" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dose" text NOT NULL,
	"route" text DEFAULT 'oral' NOT NULL,
	"frequency" text NOT NULL,
	"prn" boolean DEFAULT false NOT NULL,
	"prn_instructions" text,
	"prescribed_by" text,
	"reason" text,
	"controlled_drug" boolean DEFAULT false NOT NULL,
	"homely" boolean DEFAULT false NOT NULL,
	"start_on" timestamp NOT NULL,
	"end_on" timestamp,
	"stock_count" integer,
	"consent_recorded_on" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"child_id" uuid,
	"entry_on" timestamp NOT NULL,
	"description" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"receipt_held" boolean DEFAULT false NOT NULL,
	"recorded_by" uuid NOT NULL,
	"witnessed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid,
	"user_id" uuid NOT NULL,
	"job_title" text,
	"start_date" timestamp,
	"probation_ends_on" timestamp,
	"id_verified_on" timestamp,
	"photo_on_file" boolean DEFAULT false NOT NULL,
	"dbs_number" text,
	"dbs_issued_on" timestamp,
	"dbs_update_service" boolean DEFAULT false NOT NULL,
	"reference1_received_on" timestamp,
	"reference1_from" text,
	"reference2_received_on" timestamp,
	"reference2_from" text,
	"previous_care_employer_verified_on" timestamp,
	"qualifications_verified_on" timestamp,
	"employment_history_complete_on" timestamp,
	"employment_gaps_explained" text,
	"right_to_work_verified_on" timestamp,
	"health_declaration_on" timestamp,
	"level3_qualification" text,
	"level3_achieved_on" timestamp,
	"level5_qualification" text,
	"level5_achieved_on" timestamp,
	"induction_completed_on" timestamp,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "supervisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"supervisor_user_id" uuid NOT NULL,
	"held_on" timestamp NOT NULL,
	"kind" text DEFAULT 'supervision' NOT NULL,
	"wellbeing" text,
	"case_discussion" text,
	"practice_and_development" text,
	"safeguarding_discussed" boolean DEFAULT false NOT NULL,
	"actions" text,
	"next_due_on" timestamp,
	"staff_signed_at" timestamp with time zone,
	"supervisor_signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "training_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid,
	"staff_user_id" uuid NOT NULL,
	"course" text NOT NULL,
	"provider" text,
	"completed_on" timestamp NOT NULL,
	"expires_on" timestamp,
	"certificate_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_check_type_id_check_types_id_fk" FOREIGN KEY ("check_type_id") REFERENCES "public"."check_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_types" ADD CONSTRAINT "check_types_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_types" ADD CONSTRAINT "check_types_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_documents" ADD CONSTRAINT "home_documents_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_documents" ADD CONSTRAINT "home_documents_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_documents" ADD CONSTRAINT "home_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_entries" ADD CONSTRAINT "mar_entries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_entries" ADD CONSTRAINT "mar_entries_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_entries" ADD CONSTRAINT "mar_entries_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_entries" ADD CONSTRAINT "mar_entries_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_entries" ADD CONSTRAINT "mar_entries_administered_by_users_id_fk" FOREIGN KEY ("administered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_entries" ADD CONSTRAINT "mar_entries_witnessed_by_users_id_fk" FOREIGN KEY ("witnessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_ledger" ADD CONSTRAINT "money_ledger_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_ledger" ADD CONSTRAINT "money_ledger_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_ledger" ADD CONSTRAINT "money_ledger_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_ledger" ADD CONSTRAINT "money_ledger_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_ledger" ADD CONSTRAINT "money_ledger_witnessed_by_users_id_fk" FOREIGN KEY ("witnessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_supervisor_user_id_users_id_fk" FOREIGN KEY ("supervisor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_results_type_idx" ON "check_results" USING btree ("check_type_id","checked_on");--> statement-breakpoint
CREATE INDEX "check_types_home_idx" ON "check_types" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "home_documents_home_kind_idx" ON "home_documents" USING btree ("home_id","kind");--> statement-breakpoint
CREATE INDEX "maintenance_home_idx" ON "maintenance_items" USING btree ("home_id","status");--> statement-breakpoint
CREATE INDEX "mar_medication_idx" ON "mar_entries" USING btree ("medication_id","administered_at");--> statement-breakpoint
CREATE INDEX "mar_child_idx" ON "mar_entries" USING btree ("child_id","administered_at");--> statement-breakpoint
CREATE INDEX "medications_child_idx" ON "medications" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "money_home_child_idx" ON "money_ledger" USING btree ("home_id","child_id","entry_on");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_records_user_org_idx" ON "staff_records" USING btree ("user_id","organisation_id");--> statement-breakpoint
CREATE INDEX "supervisions_staff_idx" ON "supervisions" USING btree ("staff_user_id","held_on");--> statement-breakpoint
CREATE INDEX "training_staff_idx" ON "training_records" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "training_expiry_idx" ON "training_records" USING btree ("expires_on");