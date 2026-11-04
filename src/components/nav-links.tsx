"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Jobs" },
  { href: "/leftovers", label: "Leftovers" },
  { href: "/setup", label: "Setup" },
  { href: "/account", label: "Account" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/jobs");
  }
  return pathname.startsWith(href);
}

export function NavLinkList({ pathname }: { pathname?: string }) {
  return links.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      aria-current={pathname && isActive(pathname, link.href) ? "page" : undefined}
      className="flex-1 px-3 py-3 text-center text-sm font-semibold text-muted aria-[current=page]:text-ink sm:flex-none sm:rounded-md sm:py-1.5 sm:aria-[current=page]:bg-ruler"
    >
      {link.label}
    </Link>
  ));
}

export function NavLinks() {
  return <NavLinkList pathname={usePathname()} />;
}
