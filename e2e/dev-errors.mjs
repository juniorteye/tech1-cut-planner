// Visits every page in the development server and fails on any console error
// or warning, such as a hydration mismatch or uncached data outside <Suspense>.
// The production build used by the other journeys hides these, so they need
// their own check. Uses a dev server already running on port 3000, or starts one.
// Run with: npm run test:dev-errors
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { addLogin, admin, check, created, newPassword, removeTestData, results } from "./harness.mjs";

const BASE = "http://localhost:3000";
const up = () => fetch(`${BASE}/login`).then(() => true, () => false);
let dev = null;
if (!(await up())) {
  dev = spawn("npx", ["next", "dev", "-p", "3000"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 240 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}

const user = await addLogin("dev-errors", newPassword());
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(90000);
// Behave like the autofill and password extensions in the workshop's Chrome: they tag form
// buttons the moment they appear, before React hydrates. The app must not warn about it.
await page.addInitScript(() => {
  new MutationObserver(() => {
    for (const button of document.querySelectorAll("button[type=submit]:not([data-filler])")) button.setAttribute("data-filler", "1");
  }).observe(document, { childList: true, subtree: true });
});
const logs = [];
page.on("console", (m) => {
  // Dev-only chatter that is not a problem in the app.
  const text = m.text();
  if (/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(text)) return;
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${text.split("\n")[0].slice(0, 300)}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message.split("\n")[0].slice(0, 300)}`));

async function visit(label, go) {
  logs.length = 0;
  await go();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  check(`${label}: no errors or warnings`, logs.length === 0, [...new Set(logs)].slice(0, 4).join("\n      "));
}

try {
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", user.email);
  await page.fill("input[name=password]", user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/welcome");
  await page.fill("input[name=name]", "Client Test Workshop Dev Errors");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/setup");
  const { data: member } = await admin.from("workshop_members").select("workshop_id").eq("user_id", user.id).single();
  created.workshops.push(member.workshop_id);
  await admin.from("materials").insert({
    workshop_id: member.workshop_id, kind: "board", name: "Ply 18", board_type: "plywood", length_mm: 2420, width_mm: 1210,
    thickness_mm: 18, price_per_sheet: 45000, banding_colour: "Ply 18", no_banding: false,
  });

  for (const path of ["/", "/setup", "/leftovers", "/account", "/jobs/new"]) {
    await visit(`opening ${path}`, () => page.goto(`${BASE}${path}`));
  }
  await page.goto(`${BASE}/`);
  await visit("going to New job from the jobs list", () => page.getByRole("link", { name: /new job/i }).first().click());

  await page.goto(`${BASE}/jobs/new`);
  await page.fill("input[name=name]", "Dev check");
  await page.locator("select[name=materialId]").waitFor();
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  const jobUrl = page.url();
  await page.locator("input[name=length]").first().fill("60");
  await page.locator("input[name=width]").first().fill("40");
  await page.getByRole("button", { name: "Add piece" }).first().click();
  await page.getByText("1 × Part 1").waitFor();

  await visit("opening a job", () => page.goto(jobUrl));
  await visit("opening its plan", () => page.goto(`${jobUrl}/plan`));
  await visit("opening its shopping list", () => page.goto(`${jobUrl}/shopping-list`));
  await page.goto(`${jobUrl}/plan`);
  await page.getByRole("button", { name: "Yes: accept this plan" }).click();
  await page.waitForURL("**/cut-sheet");
  await visit("opening its cut sheet", () => page.goto(`${jobUrl}/cut-sheet`));
  await visit("opening its cost summary", () => page.goto(`${jobUrl}/cost-summary`));
  // An accepted job opens on its cut sheet from the jobs list.
  await visit("going to the accepted job from the jobs list", async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole("link", { name: /Dev check/ }).first().click();
    await page.waitForURL(`${jobUrl}/cut-sheet`);
  });
} catch (error) {
  check("the sweep finished", false, error.message.split("\n")[0]);
} finally {
  await browser.close();
  await removeTestData();
  if (dev) try { process.kill(-dev.pid, "SIGKILL"); } catch {}
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}
