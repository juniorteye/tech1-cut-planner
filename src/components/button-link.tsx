import Link from "next/link";
import type { ComponentProps } from "react";

export function ButtonLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={`rounded-md bg-ruler px-4 py-2 font-semibold text-ink ${className}`}
      {...props}
    />
  );
}
