import Link from "next/link";
import { Suspense } from "react";
import { LogOutButton } from "./log-out-button";
import { LogoBadge } from "./logo";
import { NavLinkList, NavLinks } from "./nav-links";

export function AppNav() {
  return (
    <header className="no-print">
      <div className="ruler h-3" />
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:gap-6">
        <Link href="/" className="flex min-h-10 items-center gap-2 font-display text-xl font-bold">
          <LogoBadge className="size-9 sm:size-10" />
          Tech1 Cut Planner
        </Link>
        <LogOutButton />
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-card sm:static sm:gap-1 sm:border-0 sm:bg-transparent">
          <Suspense fallback={<NavLinkList />}>
            <NavLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
