import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight text-brand">Kaizen</div>
          <p className="mt-1 text-sm text-muted">Case recording and governance</p>
        </div>
        <div className="card">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Access is logged. Only use an account issued to you.
        </p>
      </div>
    </main>
  );
}
