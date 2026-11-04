import { AppNav } from "@/components/app-nav";
import { OfflineBanner, ServiceWorker } from "@/components/offline";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <ServiceWorker />
      <OfflineBanner />
      <AppNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 sm:pb-6">
        {children}
      </main>
    </>
  );
}
