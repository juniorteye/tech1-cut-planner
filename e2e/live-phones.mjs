// Checks the LIVE site the way the client's phones will meet it:
//   - iPhone: WebKit (the engine inside Safari and every iPhone browser) as an iPhone 13
//   - Android: real Google Chrome as a Pixel 7, where Chrome itself decides to offer Install
// Nothing is faked: no hand-sent install event. Uses a throwaway login and workshop
// on the live database and removes them afterwards.
// Run with: npm run test:live-phones   (another address: LIVE_URL=https://… npm run test:live-phones)
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices, webkit } from "playwright";
import { admin, newPassword } from "./harness.mjs";

const LIVE = process.env.LIVE_URL ?? "https://tech1-cut-planner-imdd.vercel.app";
const OUT = "e2e/output/live-phones";
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? "✓" : "✗"} ${name}${passed || !detail ? "" : `  →  ${detail}`}`);
}
const card = (page) => page.getByRole("region", { name: "Install the app" });
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const email = `client-test-live-phones-${Date.now()}@example.com`;
const password = newPassword();
const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const userId = made.user.id;
let workshopId = null;
let step = "";
const browsers = [];

async function logIn(page, firstTime) {
  step = "logging in";
  await page.goto(`${LIVE}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.getByRole("button", { name: "Log in" }).click();
  if (firstTime) {
    await page.waitForURL("**/welcome");
    await page.fill("input[name=name]", "Client Test Workshop Live Phones");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/setup");
    // Let Setup finish loading, as a person would. Leaving within milliseconds makes
    // WebKit report the loads it cancels as errors, which no one ever sees.
    await page.waitForLoadState("networkidle");
    const { data } = await admin.from("workshop_members").select("workshop_id").eq("user_id", userId).single();
    workshopId = data.workshop_id;
  } else {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  step = "opening the jobs list";
  await page.goto(`${LIVE}/`);
  await page.getByRole("heading", { name: "Jobs" }).waitFor();
  step = "on the jobs list";
}

// Opening the app with no signal must show the saved jobs list, not a browser error.
async function checkOffline(context, page, label) {
  step = "offline";
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.getByRole("heading", { name: "Jobs" }).waitFor();
  await context.setOffline(true);
  await page.reload().catch(() => {});
  // The banner appears once the page has started up, a moment after it shows.
  const banner = await page.getByText("No signal. You are seeing saved copies").waitFor({ timeout: 10000 }).then(() => true, () => false);
  const text = await page.locator("body").innerText().catch(() => "");
  check(`${label}: opens with no signal, showing the saved jobs list`, banner && text.includes("New job"), `onLine=${await page.evaluate(() => navigator.onLine).catch(() => "?")} ${text.slice(0, 80).replace(/\n/g, " | ")}`);
  await context.setOffline(false);
  step = "back online";
}

try {
  console.log(`\nLive site: ${LIVE}`);

  console.log("\niPhone 13 · WebKit (Safari's engine)");
  {
    const browser = await webkit.launch();
    browsers.push(browser);
    const context = await browser.newContext(devices["iPhone 13"]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`${step}: ${e.message}`));
    await logIn(page, true);

    const head = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
      appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.href,
      capable: document.querySelector('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]')?.content,
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
    }));
    check("the page links the app manifest", head.manifest === "/manifest.webmanifest", JSON.stringify(head));
    check("Add to Home Screen opens it full screen", head.capable === "yes");
    check('the home-screen label is "Tech1 Cuts"', head.title === "Tech1 Cuts");
    const icon = head.appleIcon ? await page.request.get(head.appleIcon) : null;
    check("the home-screen icon loads", icon?.ok() && icon.headers()["content-type"] === "image/png");

    const text = await card(page).innerText().catch(() => "");
    check("the card shows: Tap Share, then Add to Home Screen", /Tap\s+Share, then Add to Home Screen/.test(text), text || "no card");
    check("no Install button (Safari would ignore it)", (await card(page).getByRole("button", { name: "Install" }).count()) === 0);
    check("nothing sticks out sideways on the phone", (await sideways(page)) <= 0);
    await page.screenshot({ path: `${OUT}/iphone-card.png` });

    await checkOffline(context, page, "iPhone");

    await card(page).getByRole("button", { name: "Got it" }).click();
    await page.reload();
    await page.getByRole("heading", { name: "Jobs" }).waitFor();
    check("after Got it, the card stays away", (await card(page).count()) === 0);
    check("no page errors in WebKit", errors.length === 0, errors.slice(0, 3).join(" | "));

    // The app as opened from the home screen: iPhone keeps it apart from Safari, so it has
    // its own login, and must show no install card.
    const app = await browser.newContext(devices["iPhone 13"]);
    await app.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
    const appPage = await app.newPage();
    await appPage.goto(`${LIVE}/`);
    check("the home-screen app asks to log in the first time", appPage.url().includes("/login"));
    await logIn(appPage, false);
    check("inside the home-screen app there is no install card", (await card(appPage).count()) === 0);
    await appPage.screenshot({ path: `${OUT}/iphone-installed.png` });
  }

  console.log("\nPixel 7 · real Google Chrome");
  {
    // A normal profile: Chrome never offers to install in a private (incognito) window.
    const { defaultBrowserType, ...pixel } = devices["Pixel 7"];
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "chrome-phone-")), {
      ...pixel, channel: "chrome", headless: false, args: ["--window-position=-2400,0"],
    });
    browsers.push(context);
    const page = context.pages()[0] ?? (await context.newPage());
    const errors = [];
    page.on("pageerror", (e) => errors.push(`${step}: ${e.message}`));
    await logIn(page, false);

    const cdp = await context.newCDPSession(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    check("Chrome finds nothing stopping an install", installabilityErrors.length === 0, JSON.stringify(installabilityErrors));
    const { errors: manifestErrors } = await cdp.send("Page.getAppManifest");
    check("Chrome reads the manifest cleanly", manifestErrors.length === 0, JSON.stringify(manifestErrors));
    await cdp.detach(); // Left open, it stops the offline switch below from reaching the page.

    // Chrome offers to install on its own; the card must then appear with an Install button.
    await page.reload();
    const offered = await card(page).getByRole("button", { name: "Install" }).waitFor({ timeout: 20000 }).then(() => true, () => false);
    check("Chrome offered to install by itself, and the card shows Install", offered);
    check("nothing sticks out sideways on the phone", (await sideways(page)) <= 0);
    await page.screenshot({ path: `${OUT}/android-card.png` });

    if (offered) {
      await card(page).getByRole("button", { name: "Not now" }).click();
      await page.reload();
      await page.getByRole("heading", { name: "Jobs" }).waitFor();
      await page.waitForTimeout(3000);
      check("after Not now, the card stays away", (await card(page).count()) === 0);
    }
    await checkOffline(context, page, "Android");
    check("no page errors in Chrome", errors.length === 0, errors.slice(0, 3).join(" | "));
  }
} catch (e) {
  check("the check finished", false, e.message.split("\n")[0]);
} finally {
  for (const browser of browsers) await browser.close().catch(() => {});
  if (workshopId) {
    for (const table of ["pieces", "sections", "leftovers", "jobs", "timber_lengths", "materials"]) {
      await admin.from(table).delete().eq("workshop_id", workshopId);
    }
    await admin.from("workshops").delete().eq("id", workshopId);
  }
  await admin.auth.admin.deleteUser(userId);
  const { data: left } = await admin.from("workshops").select("id").like("name", "Client Test Workshop%");
  check("the test left nothing behind", left.length === 0);

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}
