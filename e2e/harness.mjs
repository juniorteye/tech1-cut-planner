// Shared by the browser journeys: a production server, throwaway logins and a
// throwaway workshop on the live database, checks, screen-size rules, and a
// clean-up that proves the real workshops were not touched.
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, openSync, rmSync } from "node:fs";

export const PORT = 3460;
export const BASE = `http://127.0.0.1:${PORT}`;
export let OUTPUT = "e2e/output";

/** Each journey keeps its screenshots in its own folder, emptied at the start. */
export function prepareOutput(dir) {
  OUTPUT = dir;
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });
}
export const WORKSHOP = "Client Test Workshop";
export const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

export const stamp = Date.now();
export const emailFor = (name) => `client-test-${name}-${stamp}@example.com`;
export const newPassword = () => randomBytes(12).toString("hex");

export const LAPTOP = { viewport: { width: 1280, height: 800 } };
export const PHONE = { viewport: { width: 390, height: 844 } };

export const results = [];
export const created = { users: [], workshops: [] };
export const pageErrors = [];

export function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? "✓" : "✗"} ${name}${passed || !detail ? "" : `  →  ${detail}`}`);
}

export function checkEqual(name, actual, expected) {
  check(name, actual === expected, `expected ${expected}, got ${actual}`);
}

export let currentSection = "";

export async function section(title, run) {
  currentSection = title;
  console.log(`\n${title}`);
  try {
    await run();
  } catch (error) {
    const waitingFor = error.message.match(/waiting for (.*)/)?.[1] ?? "";
    check(`${title} finished`, false, `${error.message.split("\n")[0]} ${waitingFor}`);
    for (const page of openPages) {
      await page.screenshot({ path: `${OUTPUT}/failed-${results.length}.png`, fullPage: true }).catch(() => {});
    }
  }
}

export let server;
export const openPages = [];

export function startServer() {
  const log = openSync(`${OUTPUT}/server.log`, "a");
  server = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { stdio: ["ignore", log, log], detached: true });
}

export async function serverIsUp() {
  return fetch(`${BASE}/login`).then(() => true, () => false);
}

export async function waitForServer(up) {
  for (let i = 0; i < 120; i++) {
    if ((await serverIsUp()) === up) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not ${up ? "start" : "stop"}`);
}

export function stopServer() {
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {}
}

export async function newPage(browser, device) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => pageErrors.push(`${currentSection} @ ${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      pageErrors.push(`${currentSection} @ ${page.url()}: ${message.text()}`);
    }
  });
  openPages.push(page);
  return page;
}

export async function addLogin(name, password) {
  const email = emailFor(name);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  return { email, password, id: data.user.id };
}

export async function logIn(page, { email, password }) {
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export const main = (page) => page.locator("main").innerText();
export const collapse = (text) => text.replace(/\s+/g, " ");
export const form = (page, button) => page.locator("form", { has: page.getByRole("button", { name: button, exact: true }) });
export const submit = (scope, name) => scope.getByRole("button", { name, exact: true }).click();

// From a small Android phone up to a wide desktop, plus a phone held sideways.
export const SCREEN_SIZES = [
  { name: "small phone", width: 320, height: 640 },
  { name: "phone", width: 390, height: 844 },
  { name: "phone sideways", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet sideways", width: 1024, height: 768 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "wide screen", width: 1920, height: 1080 },
];

// Measures one screen as it is now. Phones get the touch rules: tap targets at
// least 40 px and inputs at 16 px, below which iPhones zoom in on focus.
export function measureScreen() {
  const width = window.innerWidth;
  const touch = width < 640;
  const describe = (el) =>
    `<${el.tagName.toLowerCase()}> "${(el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`;
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const clipped = (el) => {
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(parent).overflowX)) return true;
    }
    return false;
  };

  const problems = [];
  const overflow = document.documentElement.scrollWidth - width;
  if (overflow > 0) problems.push(`page scrolls sideways by ${overflow}px`);

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || clipped(el) || el.closest("next-route-announcer, nextjs-portal")) continue;
    const box = el.getBoundingClientRect();
    if (box.right > width + 1 || box.left < -1) problems.push(`${describe(el)} sticks out of the screen`);
  }

  if (touch) {
    for (const el of document.querySelectorAll("button, a, select, input:not([type=hidden]):not([type=checkbox]), textarea")) {
      if (!visible(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.height < 40) problems.push(`${describe(el)} is only ${Math.round(box.height)}px tall to tap`);
      if (el.matches("input, select, textarea") && parseFloat(getComputedStyle(el).fontSize) < 16) {
        problems.push(`${describe(el)} text is under 16px, so iPhones zoom in`);
      }
    }
    for (const box of document.querySelectorAll("input[type=checkbox]")) {
      const target = (box.closest("label") ?? box).getBoundingClientRect();
      if (target.height < 40) problems.push(`the "${box.closest("label")?.innerText.trim()}" tick box is only ${Math.round(target.height)}px tall to tap`);
    }
  }

  const nav = document.querySelector("header nav");
  const main = document.querySelector("main");
  if (nav && main && getComputedStyle(nav).position === "fixed") {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const lastThing = [...main.querySelectorAll("button, a, input, select, p, td")].filter(visible).at(-1);
    if (lastThing && lastThing.getBoundingClientRect().bottom > nav.getBoundingClientRect().top) {
      problems.push(`the bottom menu covers ${describe(lastThing)}`);
    }
    window.scrollTo(0, 0);
  }
  return [...new Set(problems)];
}

/** Checks one screen at every size. `open` puts it in the state to check, after each resize. */
export async function checkEverySize(page, label, open = async () => {}) {
  const problems = [];
  const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  for (const size of SCREEN_SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open();
    await page.evaluate(() => document.fonts.ready);
    for (const problem of await page.evaluate(measureScreen)) problems.push(`${size.name}: ${problem}`);
    await page.screenshot({ path: `${OUTPUT}/sizes/${slug}-${size.width}.png`, fullPage: true });
  }
  check(`${label} works at every screen size`, problems.length === 0, problems.slice(0, 8).join("\n      "));
}

export async function expectNoSidewaysScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${label} fits a phone screen`, overflow <= 0, `${overflow}px too wide`);
}

export async function addPiece(page, { name, material, length, width, quantity = 1, grain = false }) {
  const pieceForm = form(page, "Add piece");
  await pieceForm.locator("select[name=materialId]").selectOption({ label: material });
  await pieceForm.locator("input[name=name]").fill(name);
  await pieceForm.locator("input[name=length]").fill(length);
  if (width) await pieceForm.locator("input[name=width]").fill(width);
  await pieceForm.locator("input[name=quantity]").fill(String(quantity));
  if (grain) await pieceForm.locator("input[name=grainLocked]").check();
  await submit(pieceForm, "Add piece");
}

export async function waitForPiece(page, quantity, name) {
  await page.getByText(`${quantity} × ${name}`, { exact: true }).waitFor();
}

export async function removePiece(page, name) {
  const row = page.locator("li", { hasText: `× ${name}` });
  await row.getByRole("button", { name: "Remove" }).click();
  await row.waitFor({ state: "detached" });
}

/** The saved setting, not the dropdown, which changes before the save lands. */
export async function waitForUnit(unit) {
  for (let i = 0; i < 50; i++) {
    const { data } = await admin.from("workshops").select("display_unit").eq("id", created.workshops[0]).single();
    if (data.display_unit === unit) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`waiting for the workshop unit to be saved as ${unit}`);
}

/** The job's first section is on `board` when given, otherwise on the first board in Setup. */
export async function newJob(page, name, customer, board) {
  await page.goto(`${BASE}/jobs/new`);
  await page.fill("input[name=name]", name);
  await page.fill("input[name=customer]", customer);
  if (board) await page.locator("select[name=materialId]").selectOption({ label: board });
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  return page.url();
}

export async function openPlan(page, jobUrl) {
  await page.goto(`${jobUrl}/plan`);
  await page.getByRole("heading", { name: "Your cutting plan" }).waitFor();
  return collapse(await main(page));
}

export async function accept(page) {
  await page.getByRole("button", { name: "Yes: accept this plan" }).click();
  await page.waitForURL("**/cut-sheet");
  await page.getByText("Numbered list").waitFor();
}

/** True once the image has really loaded, not just been put on the page. */
export async function imageShows(image) {
  await image.waitFor();
  return image.evaluate(async (img) => {
    await img.decode().catch(() => {});
    return img.complete && img.naturalWidth > 0;
  });
}

export const jobRow = (page, name) => page.locator("main li", { hasText: name });

export async function askToDelete(row) {
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByText("This cannot be undone.").waitFor();
}

export async function jobExists(id) {
  const { data } = await admin.from("jobs").select("id").eq("id", id);
  return data.length === 1;
}

export async function clickAndWaitFor(page, button, next) {
  await page.getByRole("button", { name: button }).click();
  await page.getByRole("button", { name: next }).waitFor();
}



export async function snapshotOtherWorkshops() {
  const { data: workshops } = await admin.from("workshops").select("id, name, kerf_mm, display_unit").order("id");
  const others = (workshops ?? []).filter((workshop) => !created.workshops.includes(workshop.id));
  const rows = [];
  for (const table of ["materials", "jobs", "sections", "pieces", "leftovers"]) {
    const { data } = await admin.from(table).select("*").in("workshop_id", others.map((w) => w.id)).order("id");
    rows.push(data);
  }
  return JSON.stringify([others, rows]);
}

export async function removeTestData() {
  for (const id of created.workshops) {
    await admin.from("pieces").delete().eq("workshop_id", id);
    await admin.from("sections").delete().eq("workshop_id", id);
    await admin.from("leftovers").delete().eq("workshop_id", id);
    await admin.from("jobs").delete().eq("workshop_id", id);
    await admin.from("timber_lengths").delete().eq("workshop_id", id);
    await admin.from("materials").delete().eq("workshop_id", id);
    await admin.from("workshops").delete().eq("id", id);
  }
  for (const id of created.users) {
    await admin.auth.admin.deleteUser(id);
  }
}

/** Closes everything, removes the test data and prints the result. */
export async function finish(browser, before) {
  await browser.close();
  stopServer();
  const realWorkshopsUntouched = before === (await snapshotOtherWorkshops());
  await removeTestData();
  console.log("\nCleaning up");
  check("the real workshops were not touched", realWorkshopsUntouched);
  const { data: leftOver } = await admin.from("workshops").select("id").like("name", `${WORKSHOP}%`);
  checkEqual("the test left nothing behind", leftOver.length, 0);

  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
  for (const result of failed) {
    console.log(`  FAILED: ${result.name}  ${result.detail}`);
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
}
