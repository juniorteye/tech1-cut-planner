import { FullLogo } from "@/components/logo";
import { WelcomeForm } from "./welcome-form";

export default function WelcomePage() {
  return (
    <>
      <div className="ruler h-3" />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <FullLogo />
        <h1 className="font-display text-4xl font-bold">Name your workshop</h1>
        <p className="mt-1 text-muted">You can set up your materials next.</p>
        <WelcomeForm />
      </main>
    </>
  );
}
