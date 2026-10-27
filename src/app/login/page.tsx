import { Suspense } from "react";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

async function LoginPageContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, st] = await Promise.all([searchParams, getSettings()]);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-sm space-y-6 rounded-[32px] p-8">
        <div className="space-y-1 text-center">
          <p className="eyebrow">Casting agent for</p>
          <h1 className="font-serif text-4xl italic tracking-tight">{st.client.name}</h1>
          
        </div>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error === "not-allowed" ? "That email is not on the allowed list." : "That link did not work. Try again."}
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={null}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}
