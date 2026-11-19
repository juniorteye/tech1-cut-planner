import { FullLogo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <>
      <div className="ruler h-3" />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <FullLogo />
        <h1 className="font-display text-4xl font-bold">Tech1 Cut Planner</h1>
        <p className="mt-1 text-muted">Log in to plan your cuts.</p>
        <LoginForm />
      </main>
    </>
  );
}
