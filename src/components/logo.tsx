import Image from "next/image";
import badge from "@/assets/logo-badge.png";
import full from "@/assets/logo-full.webp";

// Both images are already sized by scripts/make-logo-images.mjs. They are left
// unoptimized so they load from /_next/static, which the offline cut sheet and
// cost summary keep a copy of.

/** The round Tech1 badge, for the header and printed pages. */
export function LogoBadge({ className = "size-10" }: { className?: string }) {
  return <Image src={badge} alt="Tech1 Wood Works" unoptimized loading="eager" className={`shrink-0 ${className}`} />;
}

/** The full logo with its tagline, for the login and welcome pages. */
export function FullLogo() {
  return (
    <Image
      src={full}
      alt="Tech1 Wood Works: premium wood solutions, built to last"
      unoptimized
      loading="eager"
      className="mx-auto mb-6 w-full max-w-60 rounded-2xl border border-line"
    />
  );
}
