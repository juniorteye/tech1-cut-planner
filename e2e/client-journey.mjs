// A full working week at the workshop, played through the real screens against
// the live database and a production build. Run with: npm run test:client
//
// It creates its own throwaway workshop and logins, removes them afterwards, and
// proves the real workshops were not touched. Expected money and sheet counts are
// worked out by hand here, never read from the app.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  BASE,
  LAPTOP,
  OUTPUT,
  PHONE,
  WORKSHOP,
  accept,
  addLogin,
  addPiece,
  admin,
  askToDelete,
  check,
  checkEqual,
  checkEverySize,
  clickAndWaitFor,
  collapse,
  created,
  emailFor,
  expectNoSidewaysScroll,
  finish,
  form,
  imageShows,
  jobExists,
  jobRow,
  logIn,
  main,
  newJob,
  newPage,
  newPassword,
  openPlan,
  pageErrors,
  publishable,
  removePiece,
  section,
  snapshotOtherWorkshops,
  startServer,
  stopServer,
  submit,
  url,
  waitForPiece,
  waitForServer,
  waitForUnit,
  prepareOutput,
} from "./harness.mjs";

// The wardrobe's figures were worked out by hand on a 2440 × 1220 sheet, so its
// plywood is entered as "Other size". The console uses the client's own 8 × 4.
const SHEET = { length: 2440, width: 1220 };
const KERF = 3;

function gapBetween(a, b) {
  const across = Math.max(a.x - (b.x + b.lengthMm), b.x - (a.x + a.lengthMm));
  const down = Math.max(a.y - (b.y + b.widthMm), b.y - (a.y + a.widthMm));
  return Math.max(across, down);
}

/** Checks the saved plan as a carpenter would, from the raw numbers. */
function checkLayout(plan, ordered) {
  const placed = plan.boards.flatMap((board) => board.placements);
  const cuts = plan.planks.flatMap((plank) => plank.cuts);
  const count = ordered.reduce((sum, piece) => sum + piece.quantity, 0);
  checkEqual("every piece ordered is in the plan, none twice", new Set([...placed, ...cuts].map((p) => p.number)).size, count);
  checkEqual("nothing extra was added to the plan", placed.length + cuts.length, count);

  for (const piece of ordered) {
    const matches = [...placed, ...cuts].filter((p) => p.name === piece.name);
    checkEqual(`${piece.quantity} × ${piece.name} are all there`, matches.length, piece.quantity);
    const rightSize = matches.every((p) =>
      piece.width === undefined
        ? p.lengthMm === piece.length
        : (p.lengthMm === piece.length && p.widthMm === piece.width) ||
          (p.turned && p.lengthMm === piece.width && p.widthMm === piece.length),
    );
    check(`${piece.name} keeps its exact size`, rightSize);
    if (piece.grain) check(`${piece.name} is never turned against the grain`, matches.every((p) => !p.turned));
  }

  const allInside = plan.boards.every((board) =>
    [...board.placements, ...board.offcuts].every(
      (p) => p.x >= 0 && p.y >= 0 && p.x + p.lengthMm <= board.lengthMm && p.y + p.widthMm <= board.widthMm,
    ),
  );
  check("everything stays inside its sheet", allInside);

  const gaps = plan.boards.flatMap((board) => {
    const parts = [...board.placements, ...board.offcuts];
    return parts.flatMap((a, i) => parts.slice(i + 1).map((b) => gapBetween(a, b)));
  });
  check("no two parts overlap and a full blade width sits between them", gaps.every((gap) => gap >= KERF - 1e-6), `smallest gap ${Math.min(...gaps)}`);

  for (const plank of plan.planks) {
    const used = plank.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0) + (plank.cuts.length - 1) * KERF;
    check("timber cuts fit on their plank with blade widths", used <= plank.lengthMm, `${used} on ${plank.lengthMm}`);
  }
}

// The wardrobe from the walk-through. Three sheets is proven by hand: the sides
// share one sheet, the doors another, and the tops and shelves a third.
const PLY = "Plywood 18 mm";
const TIMBER = "2 × 4";
const WARDROBE = [
  { name: "Side panel", material: PLY, length: 2000, width: 560, quantity: 2, grain: true },
  { name: "Door", material: PLY, length: 1990, width: 445, quantity: 2, grain: true },
  { name: "Top or bottom", material: PLY, length: 864, width: 560, quantity: 2 },
  { name: "Shelf", material: PLY, length: 864, width: 540, quantity: 3 },
  { name: "Base rail", material: TIMBER, length: 900, quantity: 4 },
];
// The client's console sketch, in cm as written: length × width – quantity, then
// how many long and short sides are banded. A left mark is always the longer
// side, so 26.4 × 35 bands a 35 edge. 27.41 m was worked out by hand.
const CONSOLE_BOARD = "Board 18 mm";
const CONSOLE = [
  { length: "210", width: "35", quantity: 1, lengths: 1, widths: 0 },
  { length: "206.4", width: "10", quantity: 4, lengths: 1, widths: 0 },
  { length: "26.4", width: "35", quantity: 4, lengths: 1, widths: 0 },
  { length: "28.2", width: "38", quantity: 2, lengths: 1, widths: 0 },
  { length: "213.6", width: "38", quantity: 1, lengths: 1, widths: 2 },
  { length: "70", width: "12", quantity: 6, lengths: 1, widths: 0 },
  { length: "30", width: "12", quantity: 6, lengths: 1, widths: 0 },
  { length: "70", width: "30", quantity: 3, lengths: 2, widths: 2 },
];
const CONSOLE_BANDING = "27.41 m";
const WARDROBE_TOTAL = "GH¢ 1,430.00"; // 3 × 450 + 1 × 80
const WARDROBE_PART_USED = "GH¢ 1,147.26"; // wood in the pieces, plus 10%

prepareOutput("e2e/output/week");

const before = await snapshotOtherWorkshops();
const browser = await chromium.launch();
startServer();
await waitForServer(true);

const owner = await addLogin("owner", newPassword());
const laptop = await newPage(browser, LAPTOP);
let jobUrl;
let shelfJobUrl;
let savedPlan;
let storedBefore = [];
let keptCopyId;
let consoleUrl;
let worker;
let phone;

try {
  await section("Monday morning: the owner opens the app for the first time", async () => {
    await laptop.goto(BASE);
    await laptop.waitForURL("**/login");
    check("a stranger is sent to the login page", true);
    checkEqual("there is no way to create an account", await laptop.getByText("Create a new account").count(), 0);
    check("the Tech1 logo shows on the login page", await imageShows(laptop.getByAltText(/^Tech1 Wood Works: premium/)));
    const icon = await fetch(`${BASE}${await laptop.locator("link[rel=icon]").first().getAttribute("href")}`);
    check("the browser tab shows the Tech1 badge", icon.ok && icon.headers.get("content-type") === "image/png");

    const outsider = createClient(url, publishable, { auth: { persistSession: false } });
    const signUp = await outsider.auth.signUp({ email: emailFor("stranger"), password: newPassword() });
    if (signUp.data.user) created.users.push(signUp.data.user.id);
    check("a stranger cannot sign up behind the screens either", signUp.error !== null);

    await laptop.fill("input[name=email]", owner.email);
    await laptop.fill("input[name=password]", "the-wrong-password");
    const password = laptop.locator("input[name=password]");
    await laptop.getByRole("button", { name: "Show password" }).click();
    checkEqual("the eye shows the password", await password.getAttribute("type"), "text");
    await laptop.getByRole("button", { name: "Hide password" }).click();
    checkEqual("the eye hides it again", await password.getAttribute("type"), "password");

    await laptop.route("**/login", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await laptop.getByRole("button", { name: "Log in" }).click();
    await laptop.getByRole("button", { name: "Logging in…" }).waitFor();
    check("the loader shows while logging in", true);
    await laptop.getByText("That email or password is not right.").waitFor();
    checkEqual("a wrong password keeps the email typed", await laptop.inputValue("input[name=email]"), owner.email);
    await laptop.unroute("**/login");

    await laptop.fill("input[name=password]", owner.password);
    await laptop.getByRole("button", { name: "Log in" }).click();
    await laptop.waitForURL("**/welcome");
    await laptop.fill("input[name=name]", WORKSHOP);
    await laptop.getByRole("button", { name: "Continue" }).click();
    await laptop.waitForURL("**/setup");
    const { data: membership } = await admin.from("workshop_members").select("workshop_id, role").eq("user_id", owner.id).single();
    created.workshops.push(membership.workshop_id);
    checkEqual("the first login becomes the owner", membership.role, "owner");
  });

  await section("Setting up the workshop", async () => {
    checkEqual("the blade starts at 3 mm", await laptop.inputValue("input[name=kerf]"), String(KERF));

    const boardForm = form(laptop, "Add board");
    await boardForm.locator("input[name=name]").fill(PLY);
    await boardForm.locator("input[name=thickness]").fill("18");
    await boardForm.locator("input[name=price]").fill("not a price");
    await submit(boardForm, "Add board");
    await boardForm.getByRole("alert").waitFor();
    checkEqual("a bad price is refused and the form keeps its typing", await boardForm.locator("input[name=name]").inputValue(), PLY);

    await boardForm.locator("input[name=price]").fill("450");
    checkEqual("a new board starts as the client's 8 × 4 (242 × 121 cm)", await boardForm.locator("select[name=size] option:checked").innerText(), "8 × 4 ft (242 × 121 cm)");
    await boardForm.locator("select[name=size]").selectOption("other");
    await boardForm.locator("input[name=length]").fill(String(SHEET.length));
    await boardForm.locator("input[name=width]").fill(String(SHEET.width));
    await submit(boardForm, "Add board");
    await laptop.locator("summary", { hasText: PLY }).waitFor();
    check("plywood is saved at GH¢ 450", (await laptop.locator("summary", { hasText: PLY }).innerText()).includes("GH¢ 450.00"));

    await laptop.getByText("Add a board", { exact: true }).click();
    const secondBoard = form(laptop, "Add board");
    await secondBoard.locator("input[name=name]").fill("Melamine 16 mm");
    await secondBoard.locator("select[name=boardType]").selectOption("melamine");
    await secondBoard.locator("input[name=thickness]").fill("16");
    await secondBoard.locator("input[name=price]").fill("520");
    await submit(secondBoard, "Add board");
    await laptop.locator("summary", { hasText: "Melamine 16 mm" }).waitFor();
    const { data: melamine } = await admin.from("materials").select("edge_trim_mm").eq("name", "Melamine 16 mm").eq("workshop_id", created.workshops[0]).single();
    checkEqual("melamine gets the usual 10 mm edge trim", Number(melamine.edge_trim_mm), 10);

    const timberForm = form(laptop, "Add timber");
    await timberForm.locator("input[name=name]").fill(TIMBER);
    await timberForm.locator("input[name=price12]").fill("80");
    await timberForm.locator("input[name=price14]").fill("95");
    await submit(timberForm, "Add timber");
    await laptop.locator("summary", { hasText: TIMBER }).waitFor();

    await laptop.reload();
    await laptop.locator("summary", { hasText: TIMBER }).click();
    checkEqual("saved timber prices survive a reload", await laptop.locator("details[open] input[name=price12]").first().inputValue(), "80.00");
    await laptop.screenshot({ path: `${OUTPUT}/1-setup.png`, fullPage: true });
  });

  await section("Madam Esi orders a wardrobe", async () => {
    jobUrl = await newJob(laptop, "Bedroom wardrobe", "Madam Esi");

    await addPiece(laptop, { name: "Nonsense", material: PLY, length: "abc", width: "560" });
    await form(laptop, "Add piece").getByRole("alert").waitFor();
    check("a size that makes no sense is refused", (await laptop.getByText("× Nonsense").count()) === 0);
    await laptop.reload();

    await addPiece(laptop, { name: "Measured in feet", material: PLY, length: "4ft", width: "1ft 6in" });
    await waitForPiece(laptop, 1, "Measured in feet");
    check("sizes typed in feet and inches convert correctly", collapse(await main(laptop)).includes("1219.2 × 457.2"));
    await removePiece(laptop, "Measured in feet");
    check("a piece added by mistake can be removed", true);

    for (const piece of WARDROBE) {
      await addPiece(laptop, { ...piece, length: String(piece.length), width: piece.width && String(piece.width) });
      await waitForPiece(laptop, piece.quantity, piece.name);
    }
    check("all the pieces are listed", true);
    await laptop.screenshot({ path: `${OUTPUT}/2-job.png`, fullPage: true });

    const { count } = await admin.from("leftovers").select("id", { count: "exact" }).eq("workshop_id", created.workshops[0]);
    checkEqual("the leftover store starts empty", count, 0);
  });

  await section("Plan my cuts", async () => {
    await laptop.goto(jobUrl);
    await laptop.getByRole("link", { name: "Plan my cuts" }).click();
    await laptop.waitForURL("**/plan");
    await laptop.locator("svg[role=img]").first().waitFor();
    const plan = collapse(await main(laptop));
    check("it plans 3 sheets, the proven minimum", plan.includes("3 boards to buy"), plan.slice(0, 160));
    check("it buys one 12 ft plank for the rails", plan.includes("1 plank to buy"));
    check(`the cost is ${WARDROBE_TOTAL}`, plan.includes(WARDROBE_TOTAL));
    check("every sheet has a drawing", (await laptop.getByRole("heading", { name: /^Board \d/ }).count()) === 3);
    await laptop.screenshot({ path: `${OUTPUT}/3-plan.png`, fullPage: true });

    const { count } = await admin.from("plans").select("job_id", { count: "exact" }).eq("job_id", jobUrl.split("/").pop());
    checkEqual("looking at a plan saves nothing yet", count, 0);
  });

  await section("Madam Esi changes her mind, and the owner tries other pricing", async () => {
    await laptop.goto(jobUrl);
    await addPiece(laptop, { name: "Extra shelf", material: PLY, length: "864", width: "540", quantity: 4 });
    await waitForPiece(laptop, 4, "Extra shelf");
    const bigger = await openPlan(laptop, jobUrl);
    check("adding 4 shelves needs a 4th sheet and changes the cost", bigger.includes("4 boards to buy") && bigger.includes("GH¢ 1,880.00"), bigger.slice(0, 120));
    await laptop.goto(jobUrl);
    await removePiece(laptop, "Extra shelf");
    const back = await openPlan(laptop, jobUrl);
    check("removing them returns to the original plan", back.includes("3 boards to buy") && back.includes(WARDROBE_TOTAL));

    await laptop.goto(jobUrl);
    const pricing = form(laptop, "Save");
    await pricing.locator("select[name=quoteMode]").selectOption("part-used");
    await pricing.locator("input[name=allowance]").fill("10");
    await submit(pricing, "Save");
    await laptop.waitForTimeout(1200);
    check(`charging only for wood used gives ${WARDROBE_PART_USED}`, (await openPlan(laptop, jobUrl)).includes(WARDROBE_PART_USED));

    await laptop.goto(jobUrl);
    await form(laptop, "Save").locator("select[name=quoteMode]").selectOption("whole-sheets");
    await submit(form(laptop, "Save"), "Save");
    await laptop.waitForTimeout(1200);
    check("switching back to whole sheets restores the price", (await openPlan(laptop, jobUrl)).includes(WARDROBE_TOTAL));

    await laptop.goto(jobUrl);
    await addPiece(laptop, { name: "Too big", material: PLY, length: "3000", width: "1300" });
    await waitForPiece(laptop, 1, "Too big");
    await openPlan(laptop, jobUrl);
    check("a piece bigger than any board is named, not dropped", (await laptop.getByRole("alert").filter({ hasText: "Too big" }).count()) === 1);
    checkEqual("a plan missing a piece cannot be accepted", await laptop.getByRole("button", { name: "Yes: accept this plan" }).count(), 0);
    await laptop.goto(jobUrl);
    await removePiece(laptop, "Too big");
  });

  await section("Accepting the plan: the cut sheet and the customer's cost summary", async () => {
    await openPlan(laptop, jobUrl);
    await accept(laptop);
    checkEqual("the cut sheet lists all 13 pieces", await laptop.locator("tbody tr").count(), 13);
    check("it names the job and customer", (await main(laptop)).includes("Bedroom wardrobe · Madam Esi"));
    await laptop.screenshot({ path: `${OUTPUT}/4-cut-sheet.png`, fullPage: true });

    await laptop.emulateMedia({ media: "print" });
    checkEqual("printing hides the menu", await laptop.locator("header").isVisible(), false);
    writeFileSync(`${OUTPUT}/cut-sheet.pdf`, await laptop.pdf({ format: "A4" }));
    await laptop.emulateMedia({ media: "screen" });

    const jobId = jobUrl.split("/").pop();
    const { data } = await admin.from("plans").select("plan").eq("job_id", jobId).single();
    savedPlan = data.plan;
    checkLayout(savedPlan, WARDROBE);

    await laptop.goto(`${jobUrl}/cost-summary`);
    await laptop.getByText("Material total").waitFor();
    const summary = collapse(await main(laptop));
    check("the summary shows the workshop name", summary.includes(WORKSHOP));
    check("it is addressed to the customer", summary.includes("For Madam Esi"));
    check(`it totals ${WARDROBE_TOTAL}`, summary.includes(WARDROBE_TOTAL));
    check("it shows 3 sheets at GH¢ 1,350", summary.includes("GH¢ 1,350.00"));
    await laptop.emulateMedia({ media: "print" });
    writeFileSync(`${OUTPUT}/cost-summary.pdf`, await laptop.pdf({ format: "A4" }));
    await laptop.emulateMedia({ media: "screen" });
    await laptop.screenshot({ path: `${OUTPUT}/5-cost-summary.png`, fullPage: true });

    await laptop.goto(jobUrl);
    await laptop.getByText("the pieces are locked").waitFor();
    checkEqual("pieces lock once the plan is accepted", await laptop.getByRole("button", { name: "Add piece" }).count(), 0);
  });

  await section("Plywood goes up to GH¢ 500 at the market", async () => {
    await laptop.goto(`${BASE}/setup`);
    await laptop.locator("summary", { hasText: PLY }).click();
    const open = laptop.locator("details[open]").filter({ has: laptop.locator(`input[value="${PLY}"]`) });
    await open.locator("input[name=price]").fill("500");
    await submit(open, "Save changes");
    await laptop.getByText("GH¢ 500.00").first().waitFor();

    await laptop.goto(`${jobUrl}/cost-summary`);
    await laptop.getByText("Material total").waitFor();
    check("Madam Esi's agreed price does not change", (await main(laptop)).includes(WARDROBE_TOTAL));

    const draft = await newJob(laptop, "Price check", "Nobody");
    await addPiece(laptop, { name: "Panel", material: PLY, length: "1000", width: "500" });
    await waitForPiece(laptop, 1, "Panel");
    check("a new job uses the new price", (await openPlan(laptop, draft)).includes("GH¢ 500.00"));

    await laptop.goto(`${BASE}/setup`);
    await laptop.locator("summary", { hasText: PLY }).click();
    await open.locator("input[name=price]").fill("450");
    await submit(open, "Save changes");
    await laptop.getByText("GH¢ 450.00").first().waitFor();
  });

  await section("The wood is cut: offcuts go into the leftover store", async () => {
    await openPlan(laptop, jobUrl);
    const kept = savedPlan.offcuts.length;
    check("the plan keeps usable offcuts", kept > 0);
    await clickAndWaitFor(laptop, "Mark as cut", "Undo cut");

    const { data: stored } = await admin.from("leftovers").select("*").eq("workshop_id", created.workshops[0]).eq("status", "available");
    storedBefore = stored;
    checkEqual("every offcut in the plan is now in the store", stored.length, kept);

    const boards = stored.filter((leftover) => leftover.width_mm !== null);
    check("every saved offcut is big enough to be worth keeping", boards.every((l) => Math.min(l.length_mm, l.width_mm) >= 100 && l.length_mm * l.width_mm >= 90000));
    check(
      "each offcut is valued at its share of the sheet price",
      boards.every((l) => Math.abs(Number(l.value) - (Number(l.length_mm) * Number(l.width_mm) * 45000) / (SHEET.length * SHEET.width)) <= 1),
    );

    await laptop.goto(`${BASE}/leftovers`);
    await laptop.locator("summary", { hasText: PLY }).first().waitFor();
    checkEqual("the store screen shows them all", await laptop.locator("summary", { hasText: PLY }).count(), boards.length);
    await laptop.screenshot({ path: `${OUTPUT}/6-leftovers.png`, fullPage: true });
  });

  await section("The next job is built from offcuts", async () => {
    shelfJobUrl = await newJob(laptop, "Narrow shelf", "Mr Boateng");
    await addPiece(laptop, { name: "Long shelf", material: PLY, length: "1900", width: "200" });
    await waitForPiece(laptop, 1, "Long shelf");
    const plan = await openPlan(laptop, shelfJobUrl);
    check("it uses the leftover instead of a new sheet", plan.includes("0 boards to buy") && plan.includes("From your leftover store"), plan.slice(0, 160));

    await accept(laptop);
    await laptop.goto(`${BASE}/leftovers`);
    await laptop.getByText("Reserved", { exact: true }).waitFor();
    check("the offcut is held for this job", true);
    const held = laptop.locator("li", { hasText: "Reserved" });
    await held.locator("summary").click();
    checkEqual("a held offcut cannot be edited", await held.getByRole("button", { name: "Fix size" }).count(), 0);

    await openPlan(laptop, shelfJobUrl);
    await laptop.getByRole("button", { name: "Change the plan" }).click();
    await laptop.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    await laptop.goto(`${BASE}/leftovers`);
    await laptop.locator("summary", { hasText: PLY }).first().waitFor();
    checkEqual("changing the plan releases the offcut", await laptop.getByText("Reserved", { exact: true }).count(), 0);

    await openPlan(laptop, shelfJobUrl);
    await accept(laptop);
    await openPlan(laptop, shelfJobUrl);
    await clickAndWaitFor(laptop, "Mark as cut", "Undo cut");

    await openPlan(laptop, jobUrl);
    await laptop.getByRole("button", { name: "Undo cut" }).click();
    await laptop.getByRole("alert").filter({ hasText: "Narrow shelf" }).waitFor();
    check("the wardrobe cannot be undone while a later job used its offcut", true);

    await openPlan(laptop, shelfJobUrl);
    await clickAndWaitFor(laptop, "Undo cut", "Mark as cut");
    const stock = () => admin.from("leftovers").select("id, status").eq("workshop_id", created.workshops[0]).in("status", ["available", "reserved"]);
    const undone = (await stock()).data;
    checkEqual("after undo the offcut is held for the shelf again, not lost", undone.filter((l) => l.status === "reserved").length, 1);
    checkEqual("the shelf's own new offcut is removed", undone.length, storedBefore.length);

    await laptop.getByRole("button", { name: "Change the plan" }).click();
    await laptop.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    const released = (await stock()).data;
    check(
      "changing the plan puts back exactly the same offcuts as before",
      released.every((l) => l.status === "available") &&
        released.map((l) => l.id).sort().join() === storedBefore.map((l) => l.id).sort().join(),
    );
  });

  await section("Tidying the leftover store by hand", async () => {
    await laptop.goto(`${BASE}/leftovers`);
    const added = form(laptop, "Add leftover");
    await added.locator("select[name=materialId]").selectOption({ label: PLY });
    await added.locator("input[name=length]").fill("777");
    await added.locator("input[name=width]").fill("444");
    await submit(added, "Add leftover");
    const row = laptop.locator("li", { hasText: "777 × 444" });
    await row.waitFor();
    check("a piece found in the workshop can be added", true);

    await row.locator("summary").click();
    await row.locator("input[name=length]").fill("770");
    await submit(row, "Fix size");
    await laptop.locator("li", { hasText: "770 × 444" }).waitFor();
    check("a wrong size can be fixed", true);

    const fixed = laptop.locator("li", { hasText: "770 × 444" });
    await submit(fixed, "Mark damaged");
    const damaged = laptop.locator("section", { hasText: "Damaged" }).locator("li", { hasText: "770 × 444" });
    await damaged.waitFor();
    check("a damaged piece moves out of the store", true);

    const job = await newJob(laptop, "Small box", "Nobody");
    await addPiece(laptop, { name: "Box side", material: PLY, length: "760", width: "430" });
    await waitForPiece(laptop, 1, "Box side");
    await laptop.goto(`${BASE}/leftovers`);
    await laptop.getByRole("button", { name: "Put back" }).click();
    await laptop.getByRole("button", { name: "Put back" }).waitFor({ state: "detached" });
    check("a damaged piece can be put back", true);

    const repaired = laptop.locator("li", { hasText: "770 × 444" });
    await repaired.locator("summary").click();
    await submit(repaired, "Used for something else");
    await repaired.waitFor({ state: "detached" });
    check("a piece used elsewhere leaves the store", true);
    const plan = await openPlan(laptop, job);
    check("the planner no longer offers it", !plan.includes("770 × 444"));
  });

  await section("Madam Esi's sister wants the same wardrobe", async () => {
    await laptop.goto(BASE);
    await laptop.locator("li", { hasText: "Bedroom wardrobe" }).getByRole("button", { name: "Copy" }).click();
    await laptop.getByRole("heading", { name: "Bedroom wardrobe (copy)" }).waitFor();
    checkEqual("all 5 lines of pieces are copied", await laptop.locator("section", { hasText: "Pieces" }).first().locator("li").count(), WARDROBE.length);
    const original = await admin.from("jobs").select("status").eq("id", jobUrl.split("/").pop()).single();
    checkEqual("the original job is untouched", original.data.status, "cut");
  });

  await section("The sister never comes back, so the copy is deleted", async () => {
    const copyId = laptop.url().split("/").pop();
    const sisterJob = jobRow(laptop, "Bedroom wardrobe (copy)");
    const wardrobe = jobRow(laptop, "Bedroom wardrobe").filter({ hasNotText: "(copy)" });
    await laptop.goto(BASE);
    checkEqual("a cut job has no Delete button", await wardrobe.getByRole("button", { name: "Delete" }).count(), 0);

    const ownerPhone = await newPage(browser, PHONE);
    await logIn(ownerPhone, owner);
    await ownerPhone.waitForURL(`${BASE}/`);
    await askToDelete(jobRow(ownerPhone, "Bedroom wardrobe (copy)"));
    await expectNoSidewaysScroll(ownerPhone, "the delete question");
    await ownerPhone.context().close();

    await askToDelete(sisterJob);
    check("it asks first and names the job", (await sisterJob.innerText()).includes("Delete Bedroom wardrobe (copy)? This cannot be undone."));
    await sisterJob.getByRole("button", { name: "Keep it" }).click();
    await sisterJob.getByRole("button", { name: "Delete" }).waitFor();
    check("Keep it changes nothing", (await jobExists(copyId)) && (await sisterJob.getByText("This cannot be undone.").count()) === 0);

    await askToDelete(sisterJob);
    await laptop.context().setOffline(true);
    await sisterJob.getByRole("button", { name: "Yes, delete" }).click();
    await sisterJob.getByText("You need a connection for this.").waitFor();
    await laptop.context().setOffline(false);
    check("with no signal it says so and keeps the job", await jobExists(copyId));

    await sisterJob.getByRole("button", { name: "Yes, delete" }).click();
    await sisterJob.waitFor({ state: "detached" });
    const { data: pieces } = await admin.from("pieces").select("id").eq("job_id", copyId);
    check("once the signal is back, the job and its pieces are deleted", !(await jobExists(copyId)) && pieces.length === 0);
    checkEqual("the cut wardrobe is still there", await wardrobe.count(), 1);
  });

  await section("Clearing out old quotes", async () => {
    // The narrow shelf was accepted, cut, undone and changed back, so it is a
    // draft with a history. Deleting it must not disturb the offcuts it once held.
    const shelfId = shelfJobUrl.split("/").pop();
    const shelf = jobRow(laptop, "Narrow shelf").filter({ hasNotText: "(copy)" });
    await laptop.goto(BASE);
    await shelf.getByRole("button", { name: "Copy" }).click();
    await laptop.getByRole("heading", { name: "Narrow shelf (copy)" }).waitFor();
    keptCopyId = laptop.url().split("/").pop();

    await laptop.goto(BASE);
    await askToDelete(shelf);
    await shelf.getByRole("button", { name: "Yes, delete" }).click();
    await shelf.waitFor({ state: "detached" });
    const [{ data: pieces }, { data: plans }, { data: copy }, { data: copyPieces }] = await Promise.all([
      admin.from("pieces").select("id").eq("job_id", shelfId),
      admin.from("plans").select("job_id").eq("job_id", shelfId),
      admin.from("jobs").select("copied_from_job_id").eq("id", keptCopyId).single(),
      admin.from("pieces").select("id").eq("job_id", keptCopyId),
    ]);
    check("a draft with a history deletes cleanly, saved plan included", !(await jobExists(shelfId)) && pieces.length === 0 && plans.length === 0);
    check("its copy stays, with its own pieces", copy.copied_from_job_id === null && copyPieces.length === 1);
    const { data: store } = await admin.from("leftovers").select("id").eq("workshop_id", created.workshops[0]).eq("status", "available");
    check(
      "every offcut it once held is still in the store",
      storedBefore.every((offcut) => store.some((entry) => entry.id === offcut.id)),
    );

    // Two people tidy the list at once.
    const otherTab = await laptop.context().newPage();
    const asante = await newJob(laptop, "Quote for Mr Asante", "Mr Asante");
    const asanteId = asante.split("/").pop();
    await laptop.goto(BASE);
    await askToDelete(jobRow(laptop, "Quote for Mr Asante"));
    await otherTab.goto(BASE);
    await askToDelete(jobRow(otherTab, "Quote for Mr Asante"));
    await jobRow(otherTab, "Quote for Mr Asante").getByRole("button", { name: "Yes, delete" }).click();
    await jobRow(otherTab, "Quote for Mr Asante").waitFor({ state: "detached" });
    await jobRow(laptop, "Quote for Mr Asante").getByRole("button", { name: "Yes, delete" }).click();
    await jobRow(laptop, "Quote for Mr Asante").waitFor({ state: "detached" });
    check("a job someone else already deleted just disappears", !(await jobExists(asanteId)));
    checkEqual("and no error is shown", await laptop.locator("main").getByRole("alert").count(), 0);

    // The owner is about to delete the small box while a worker accepts it.
    const box = jobRow(laptop, "Small box");
    const boxId = await box.locator("a").getAttribute("href").then((href) => href.split("/").pop());
    await askToDelete(box);
    await openPlan(otherTab, `${BASE}/jobs/${boxId}`);
    await accept(otherTab);
    await box.getByRole("button", { name: "Yes, delete" }).click();
    await box.getByText("This job has just been accepted, so it can no longer be deleted.").waitFor();
    const { data: accepted } = await admin.from("jobs").select("status").eq("id", boxId).single();
    checkEqual("a job accepted in the meantime is refused and kept", accepted.status, "accepted");
    await laptop.reload();
    await box.getByText("Ready to cut").waitFor();
    checkEqual("a job ready to cut has no Delete button", await box.getByRole("button", { name: "Delete" }).count(), 0);
    await otherTab.close();
  });

  await section("A console in centimetres, with every banded edge counted", async () => {
    await laptop.goto(`${BASE}/setup`);
    const sawForm = form(laptop, "Save");
    await sawForm.locator("select[name=unit]").selectOption("cm");
    await submit(sawForm, "Save");
    await waitForUnit("cm");
    await laptop.reload();
    checkEqual("the workshop can work in centimetres", await laptop.inputValue("select[name=unit]"), "cm");

    await laptop.getByText("Add a board", { exact: true }).click();
    const boardForm = form(laptop, "Add board");
    await boardForm.locator("input[name=name]").fill(CONSOLE_BOARD);
    await boardForm.locator("input[name=thickness]").fill("18");
    await boardForm.locator("input[name=price]").fill("400");
    await submit(boardForm, "Add board");
    await laptop.locator("summary", { hasText: CONSOLE_BOARD }).waitFor();
    check("the client's 8 × 4 board is saved as 242 × 121 cm", (await laptop.locator("summary", { hasText: CONSOLE_BOARD }).innerText()).includes("242 × 121 cm"));

    consoleUrl = await newJob(laptop, "Console", "Mr Boateng");
    const pieceForm = form(laptop, "Add piece");
    checkEqual("the board is chosen first", await pieceForm.locator("select").first().getAttribute("name"), "materialId");
    await pieceForm.locator("select[name=materialId]").selectOption({ label: CONSOLE_BOARD });

    for (const [index, row] of CONSOLE.entries()) {
      await pieceForm.locator("input[name=length]").fill(row.length);
      await pieceForm.locator("input[name=width]").fill(row.width);
      await pieceForm.locator("input[name=quantity]").fill(String(row.quantity));
      if (row.lengths === 2 && row.widths === 2) {
        await pieceForm.getByRole("button", { name: "All 4 edges" }).click();
      } else {
        if (row.lengths >= 1) await pieceForm.getByRole("button", { name: "Left edge (long side)" }).click();
        if (row.lengths === 2) await pieceForm.getByRole("button", { name: "Right edge (long side)" }).click();
        if (row.widths >= 1) await pieceForm.getByRole("button", { name: "Top edge (short side)" }).click();
        if (row.widths === 2) await pieceForm.getByRole("button", { name: "Bottom edge (short side)" }).click();
      }
      if (index === 4) {
        const typing = collapse(await pieceForm.locator("fieldset").innerText());
        check("the part being typed shows its own banding", typing.includes("2.90 m of banding"), typing);
      }
      await submit(pieceForm, "Add piece");
      await waitForPiece(laptop, row.quantity, `Part ${index + 1}`);
      if (index === 0) {
        checkEqual("the board stays chosen for the next part", await pieceForm.locator("select[name=materialId] option:checked").innerText(), CONSOLE_BOARD);
        checkEqual("the edges start blank for the next part", await pieceForm.getByRole("button", { pressed: true }).count(), 0);
        check("totals appear as soon as the first part is in", (await laptop.getByRole("region", { name: "Totals so far" }).innerText()).includes("2.10 m"));
      }
    }
    check("a part needs no name: unnamed parts are numbered", true);

    const totals = collapse(await laptop.getByRole("region", { name: "Totals so far" }).innerText());
    check(`the live total shows ${CONSOLE_BANDING} of banding`, totals.includes(`${CONSOLE_BANDING} edge banding`), totals);
    check("the live total counts all 27 parts", totals.includes("27 parts"), totals);
    const topRow = collapse(await laptop.locator("li", { hasText: "1 × Part 5" }).innerText());
    check("the console top lists 1 long and 2 short sides", topRow.includes("213.6 × 38 cm") && topRow.includes("Banding: 1 long + 2 short · 2.90 m"), topRow);
    const shortFirst = collapse(await laptop.locator("li", { hasText: "4 × Part 3" }).innerText());
    check("26.4 × 35 with a left mark bands the 35 cm side", shortFirst.includes("Banding: 1 long · 1.40 m"), shortFirst);
    const allRound = collapse(await laptop.locator("li", { hasText: "3 × Part 8" }).innerText());
    check("the 70 × 30 parts are banded all round", allRound.includes("all 4 edges · 6.00 m"), allRound);
    const liveBoards = totals.match(/^(\d+) boards?/)?.[1];
    await laptop.screenshot({ path: `${OUTPUT}/8-console-job.png`, fullPage: true });

    const plan = await openPlan(laptop, consoleUrl);
    check(`the plan shows ${CONSOLE_BANDING} of edge banding`, plan.includes(`${CONSOLE_BANDING} edge banding`), plan.slice(0, 300));
    check("the live board count matches the plan", plan.includes(`${liveBoards} ${liveBoards === "1" ? "board" : "boards"} to buy`), `${liveBoards} vs ${plan.slice(0, 200)}`);
    check("sizes show in centimetres", plan.includes("242 × 121 cm"));
    check("the console needs 2 boards of 121 × 242 cm", plan.includes("2 boards to buy"), plan.slice(0, 200));
    checkEqual("the diagrams mark the banded edges", (await laptop.getByText("Edge banding", { exact: true }).count()) > 0, true);
    await laptop.screenshot({ path: `${OUTPUT}/9-console-plan.png`, fullPage: true });

    await submit(laptop.locator("form", { has: laptop.getByRole("button", { name: "Yes: accept this plan" }) }), "Yes: accept this plan");
    await laptop.waitForURL("**/cut-sheet");
    await laptop.getByRole("heading", { name: "Cut sheet" }).waitFor();
    const sheet = collapse(await main(laptop));
    check("the cut sheet tells the workers how much banding", sheet.includes(`Edge banding: ${CONSOLE_BANDING} for ${CONSOLE_BOARD}`), sheet.slice(0, 300));
    const topLine = collapse(await laptop.locator("tbody tr", { hasText: "Part 5" }).innerText());
    check("the cut sheet says which edges of each part to band", topLine.endsWith("1 long + 2 short"), topLine);
    await laptop.screenshot({ path: `${OUTPUT}/10-console-cut-sheet.png`, fullPage: true });

    await laptop.goto(`${BASE}/setup`);
    await form(laptop, "Save").locator("select[name=unit]").selectOption("mm");
    await submit(form(laptop, "Save"), "Save");
    await waitForUnit("mm");
  });

  await section("A worker joins, on his phone at the saw", async () => {
    await laptop.goto(`${BASE}/account`);
    const addForm = form(laptop, "Add to team");
    worker = { email: emailFor("kofi"), password: newPassword() };
    await addForm.locator("input[name=name]").fill("Kofi");
    await addForm.locator("input[name=email]").fill(worker.email);
    await addForm.locator("input[name=password]").fill(worker.password);
    await submit(addForm, "Add to team");
    await laptop.locator("summary", { hasText: "Kofi" }).waitFor();
    check("the owner adds Kofi, with no email step", true);
    const { data: logins } = await admin.auth.admin.listUsers({ perPage: 1000 });
    worker.id = logins.users.find((user) => user.email === worker.email).id;
    created.users.push(worker.id);

    phone = await newPage(browser, PHONE);
    await logIn(phone, worker);
    await phone.waitForURL(`${BASE}/`);
    await phone.getByText("Bedroom wardrobe", { exact: true }).waitFor();
    check("Kofi sees the same jobs", true);
    check("the Tech1 badge shows in the header", await imageShows(phone.locator("header").getByAltText("Tech1 Wood Works")));
    await expectNoSidewaysScroll(phone, "the jobs list");

    await phone.goto(`${jobUrl}/cut-sheet`);
    await phone.getByText("Numbered list").waitFor();
    await expectNoSidewaysScroll(phone, "the cut sheet");
    await phone.screenshot({ path: `${OUTPUT}/7-phone-cut-sheet.png`, fullPage: true });

    await phone.goto(`${BASE}/account`);
    await phone.getByRole("heading", { name: "Change your password" }).waitFor();
    checkEqual("Kofi has no team tools", await phone.getByRole("button", { name: "Add to team" }).count(), 0);

    for (const path of ["/setup", "/leftovers"]) {
      await phone.goto(BASE + path);
      await phone.locator("h1").first().waitFor();
      await expectNoSidewaysScroll(phone, path.slice(1));
    }
  });

  await section("Every screen on every size of screen", async () => {
    mkdirSync(`${OUTPUT}/sizes`, { recursive: true });
    const openEverything = () => laptop.locator("details").evaluateAll((all) => all.forEach((d) => (d.open = true)));
    const screens = [
      { label: "the jobs list", path: "/" },
      {
        label: "the delete question",
        path: "/",
        open: async () => {
          const row = jobRow(laptop, "Narrow shelf (copy)");
          if ((await row.getByText("This cannot be undone.").count()) === 0) await askToDelete(row);
        },
      },
      { label: "a new job", path: "/jobs/new" },
      { label: "a draft job", path: `/jobs/${keptCopyId}` },
      { label: "a job with edge banding", path: new URL(consoleUrl).pathname },
      { label: "a cut sheet with edge banding", path: `${new URL(consoleUrl).pathname}/cut-sheet` },
      { label: "a plan waiting to be accepted", path: `/jobs/${keptCopyId}/plan` },
      { label: "the wardrobe plan", path: `${new URL(jobUrl).pathname}/plan` },
      { label: "the cut sheet", path: `${new URL(jobUrl).pathname}/cut-sheet` },
      { label: "the cost summary", path: `${new URL(jobUrl).pathname}/cost-summary` },
      { label: "the leftover store, every offcut opened", path: "/leftovers", open: openEverything },
      { label: "setup, every form opened", path: "/setup", open: openEverything },
      { label: "account, with Kofi opened", path: "/account", open: openEverything },
    ];
    for (const screen of screens) {
      await laptop.goto(BASE + screen.path);
      await laptop.locator("main :is(h1, h2)").first().waitFor();
      await checkEverySize(laptop, screen.label, screen.open);
    }
    await laptop.setViewportSize(LAPTOP.viewport);

    const visitor = await newPage(browser, LAPTOP);
    await visitor.goto(`${BASE}/login`);
    await checkEverySize(visitor, "the login page");
    const newcomer = await addLogin("newcomer", newPassword());
    await logIn(visitor, newcomer);
    await visitor.waitForURL("**/welcome");
    await checkEverySize(visitor, "the welcome page");
    await visitor.context().close();
  });

  await section("The signal drops at the workshop", async () => {
    await phone.goto(BASE);
    await phone.waitForFunction(() => navigator.serviceWorker.controller !== null).catch(() => phone.reload());
    await phone.reload();
    await phone.waitForFunction(
      async (id) => {
        const keys = await (await caches.open("saved-pages-v1")).keys();
        return keys.some((key) => key.url.endsWith(`/jobs/${id}/cut-sheet`));
      },
      jobUrl.split("/").pop(),
      { polling: 300 },
    );
    check("the phone saves the cut sheet on its own", true);

    stopServer();
    await waitForServer(false);
    await phone.context().setOffline(true);

    await phone.goto(`${jobUrl}/cut-sheet`);
    await phone.getByText("Numbered list").waitFor();
    checkEqual("the cut sheet opens with no signal, all 13 pieces", await phone.locator("tbody tr").count(), 13);
    await phone.getByRole("status").waitFor();
    check("the phone says it has no signal", true);
    await phone.goto(`${jobUrl}/cost-summary`);
    await phone.getByText("Material total").waitFor();
    check("the cost summary opens with no signal", (await main(phone)).includes(WARDROBE_TOTAL));
    check("its Tech1 logo still shows with no signal", await imageShows(phone.locator("main").getByAltText("Tech1 Wood Works")));

    await phone.context().setOffline(false);
    startServer();
    await waitForServer(true);
  });

  await section("Kofi leaves, and the owner changes the password", async () => {
    await laptop.goto(`${BASE}/account`);
    const row = laptop.locator("li", { has: laptop.locator("summary", { hasText: "Kofi" }) });
    await row.locator("summary").click();
    await row.getByRole("button", { name: "Remove from team" }).click();
    await laptop.locator("summary", { hasText: "Kofi" }).waitFor({ state: "detached" });
    await phone.goto(`${BASE}/leftovers`);
    await phone.waitForURL("**/login");
    check("Kofi is logged out straight away", true);
    const gone = await createClient(url, publishable, { auth: { persistSession: false } }).auth.signInWithPassword(worker);
    check("Kofi cannot log back in", gone.error !== null);
    const job = await admin.from("jobs").select("id").eq("id", jobUrl.split("/").pop()).single();
    check("his jobs stay in the workshop", job.data !== null);

    const replacement = newPassword();
    const change = form(laptop, "Change password");
    await change.locator("input[name=password]").fill(replacement);
    await change.locator("input[name=confirm]").fill(replacement);
    await submit(change, "Change password");
    await laptop.getByText("Your password has been changed.").waitFor();
    await laptop.getByRole("button", { name: "Log out" }).click();
    await laptop.waitForURL("**/login");
    await logIn(laptop, { email: owner.email, password: owner.password });
    await laptop.getByText("That email or password is not right.").waitFor();
    check("the old password stops working", true);
    await logIn(laptop, { email: owner.email, password: replacement });
    await laptop.waitForURL(`${BASE}/`);
    check("the new password works", true);
  });

  await section("Nobody else can see this workshop", async () => {
    const stranger = await addLogin("other", newPassword());
    const { data: other } = await admin.from("workshops").insert({ name: `${WORKSHOP} Other` }).select().single();
    created.workshops.push(other.id);
    await admin.from("workshop_members").insert({ workshop_id: other.id, user_id: stranger.id, role: "owner" });

    const rival = await newPage(browser, LAPTOP);
    await logIn(rival, stranger);
    await rival.waitForURL(`${BASE}/`);
    await rival.getByText("No jobs yet.").waitFor();
    check("another workshop sees no jobs", true);
    await rival.goto(jobUrl);
    await rival.getByText("This page could not be found").waitFor();
    checkEqual("opening this job's link directly shows nothing of it", (await rival.locator("body").innerText()).includes("Madam Esi"), false);

    const rivalDb = createClient(url, publishable, { auth: { persistSession: false } });
    await rivalDb.auth.signInWithPassword(stranger);
    const { data: rivalDeleted } = await rivalDb.from("jobs").delete().eq("id", keptCopyId).select("id");
    check("another workshop cannot delete this workshop's drafts", rivalDeleted.length === 0 && (await jobExists(keptCopyId)));

    const signedOut = await fetch(`${url}/rest/v1/jobs?select=*`, { headers: { apikey: publishable } });
    checkEqual("the database refuses anyone logged out", signedOut.status, 401);
  });

  await section("The whole week", async () => {
    check("no browser errors on any screen", pageErrors.length === 0, [...new Set(pageErrors)].map((text) => text.slice(0, 220)).slice(0, 6).join("\n      "));
  });
} finally {
  await finish(browser, before);
}
