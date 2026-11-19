import type { MetadataRoute } from "next";

// Lets a phone install the planner as an app: own icon, opens without the browser bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Tech1 Cut Planner",
    // Shown under the home-screen icon, which cuts off at about 12 letters.
    short_name: "Tech1 Cuts",
    description: "Plan your cuts, buy the right amount of wood and quote faster.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f2f0",
    theme_color: "#e9b308",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
