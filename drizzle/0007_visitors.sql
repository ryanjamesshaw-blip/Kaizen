CREATE TABLE "visitors_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"visitor_name" text NOT NULL,
	"organisation" text,
	"purpose" text NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"id_checked" boolean DEFAULT false NOT NULL,
	"signed_in_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visitors_log" ADD CONSTRAINT "visitors_log_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors_log" ADD CONSTRAINT "visitors_log_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors_log" ADD CONSTRAINT "visitors_log_signed_in_by_users_id_fk" FOREIGN KEY ("signed_in_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitors_home_idx" ON "visitors_log" USING btree ("home_id","arrived_at");