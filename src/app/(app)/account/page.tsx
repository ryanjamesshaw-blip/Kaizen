import { requireUser } from "@/lib/auth/guard";
import { changePassword } from "@/lib/staff/actions";
import { ActionForm, Text } from "@/components/form";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
      <p className="text-sm text-muted">{user.fullName} · {user.email}</p>
      <div className="card">
        <h2 className="mb-3 text-base font-semibold">Change password</h2>
        <ActionForm action={changePassword} submitLabel="Change password" successMessage="Password changed.">
          <Text name="current" label="Current password" type="password" required />
          <Text name="next" label="New password" type="password" required hint="At least 12 characters" />
          <Text name="confirm" label="Confirm new password" type="password" required />
        </ActionForm>
      </div>
    </div>
  );
}
