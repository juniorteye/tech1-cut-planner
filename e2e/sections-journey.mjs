// Sections, sets, banding colours and back panels, tested the way they can
// go wrong: the rules for moving a section to another board, values the
// browser would normally stop, a page left open while the job is accepted,
// another workshop trying to reach these sections, and plans and parts saved
// before sections existed.
// Run with: npm run test:sections
//
// Like the other journeys it uses a throwaway workshop on the live database
// and removes it afterwards. Every expected figure is worked out by hand.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import {
  BASE,
  LAPTOP,
  OUTPUT,
  addLogin,
  admin,
  check,
  checkEqual,
  checkEverySize,
  collapse,
  created,
  finish,
  form,
  logIn,
  main,
  newPage,
  newPassword,
  openPlan,
  pageErrors,
  prepareOutput,
  publishable,
  section,
  snapshotOtherWorkshops,
  startServer,
  submit,
  url,
  waitForServer,
} from "./harness.mjs";

const GREY = "Grey 18 mm 8×4";
const GREY_BIG = "Grey 18 mm 9×7";
const OAK = "Oak 18 mm";
const BACK = "Back 6 mm";
const SPARE = "Spare board";
const TIMBER = "2 × 4";
const LOCKED = "This plan has been accepted, so the job is locked.";

prepareOutput("e2e/output/sections");
mkdirSync(`${OUTPUT}/sizes`, { recursive: true });
const before = await snapshotOtherWorkshops();
const browser = await chromium.launch();
startServer();
await waitForServer(true);

const owner = await addLogin("sections-owner", newPassword());
const laptop = await newPage(browser, LAPTOP);
const ids = {};
let workshopId;
let jobUrl;
let jobId;

const totalsText = async (page = laptop) => collapse(await page.getByRole("region", { name: "Totals so far" }).innerText());
const partCount = async (page = laptop) => Number((await totalsText(page)).match(/(\d+) parts?/)?.[1]);
const card = (name, page = laptop) => page.getByRole("region", { name, exact: true });
const alertIn = (scope) => scope.getByRole("alert").first();
const piecesNamed = async (name) => (await admin.from("pieces").select("*").eq("job_id", jobId).eq("name", name)).data;
const sectionNamed = async (name) => (await admin.from("sections").select("*").eq("job_id", jobId).eq("name", name).maybeSingle()).data;
const jobRow = async () => (await admin.from("jobs").select("*").eq("id", jobId).single()).data;

/** Opens a section's "Change or remove" fold, unless it is already open. */
async function openSectionFold(name, page = laptop) {
  const fold = card(name, page).locator("details", { has: page.getByText("Change or remove this section") });
  if ((await fold.getAttribute("open")) === null) await card(name, page).getByText("Change or remove this section").click();
  return fold;
}

async function addSection(name, board, page = laptop) {
  const fold = page.locator("details", { has: page.getByText("Add a section", { exact: true }) });
  if ((await fold.getAttribute("open")) === null) await page.getByText("Add a section", { exact: true }).click();
  const sectionForm = form(page, "Add section");
  await sectionForm.locator("input[name=name]").fill(name);
  await sectionForm.locator("select[name=materialId]").selectOption({ label: board });
  await submit(sectionForm, "Add section");
  await card(name || board, page).waitFor();
}

async function addPart(sectionName, { length, width, quantity, name, board, edges }, page = laptop) {
  const pieceForm = card(sectionName, page).locator("form", { has: page.getByRole("button", { name: "Add piece", exact: true }) });
  if (board) await pieceForm.locator("select[name=materialId]").selectOption({ label: board });
  await pieceForm.locator("input[name=length]").fill(length);
  if (width !== undefined) await pieceForm.locator("input[name=width]").fill(width);
  await pieceForm.locator("input[name=quantity]").fill(String(quantity));
  for (const edge of edges ?? []) await pieceForm.getByRole("button", { name: edge, exact: true }).click();
  await pieceForm.locator("input[name=name]").fill(name);
  await submit(pieceForm, "Add piece");
  await card(sectionName, page).getByText(`${quantity} × ${name}`, { exact: true }).waitFor();
}

async function setBoard({ name, colour, noBanding }) {
  await laptop.goto(`${BASE}/setup`);
  const row = laptop.locator("li", { has: laptop.locator("summary", { hasText: name }) });
  await row.locator("summary").click();
  const boardForm = row.locator("form", { has: laptop.getByRole("button", { name: "Save changes" }) });
  if (noBanding !== undefined) await boardForm.getByLabel("No edge banding (back panels)").setChecked(noBanding);
  if (colour !== undefined) await boardForm.locator("input[name=bandingColour]").fill(colour);
  await submit(boardForm, "Save changes");
  await boardForm.getByRole("button", { name: "Save changes" }).waitFor();
  // The save is done once the summary shows the new tape.
  const want = noBanding ? "no banding" : colour ? `${colour} tape` : "tape";
  for (let i = 0; i < 40 && !(await row.locator("summary").innerText()).includes(want); i++) await laptop.waitForTimeout(250);
}

try {
  await section("Setup: a workshop with tape colours, a back panel and timber", async () => {
    await logIn(laptop, owner);
    await laptop.waitForURL("**/welcome");
    await laptop.fill("input[name=name]", "Client Test Workshop Sections");
    await laptop.getByRole("button", { name: "Continue" }).click();
    await laptop.waitForURL("**/setup");
    const { data: membership } = await admin.from("workshop_members").select("workshop_id").eq("user_id", owner.id).single();
    workshopId = membership.workshop_id;
    created.workshops.push(workshopId);
    await admin.from("workshops").update({ display_unit: "cm" }).eq("id", workshopId);

    const board = (name, over = {}) => ({
      workshop_id: workshopId, kind: "board", name, board_type: "melamine", length_mm: 2420, width_mm: 1210,
      thickness_mm: 18, price_per_sheet: 50000, banding_colour: name, no_banding: false, ...over,
    });
    // Boards and timber go in separately: one insert fills missing columns with nulls.
    const { data: boards, error: boardsError } = await admin
      .from("materials")
      .insert([
        board(GREY, { banding_colour: "Grey" }),
        board(GREY_BIG, { banding_colour: "Grey", length_mm: 2720, width_mm: 2120, price_per_sheet: 80000 }),
        board(OAK),
        board(BACK, { thickness_mm: 6, no_banding: true }),
        board(SPARE),
      ])
      .select("id, name");
    if (boardsError) throw new Error(`could not set up the boards: ${boardsError.message}`);
    const { data: timber, error: timberError } = await admin
      .from("materials")
      .insert({ workshop_id: workshopId, kind: "timber", name: TIMBER })
      .select("id, name");
    if (timberError) throw new Error(`could not set up the timber: ${timberError.message}`);
    for (const row of [...boards, ...timber]) ids[row.name] = row.id;
    await admin.from("timber_lengths").insert({ workshop_id: workshopId, material_id: ids[TIMBER], length_mm: 3658, price_per_piece: 8000 });

    await laptop.reload();
    const summary = async (name) => collapse(await laptop.locator("summary", { hasText: name }).innerText());
    check("Setup shows the tape each board takes", (await summary(GREY_BIG)).includes("Grey tape"), await summary(GREY_BIG));
    check("and that the back panel takes none", (await summary(BACK)).includes("no banding"), await summary(BACK));

    await setBoard({ name: OAK, colour: "" });
    const oak = async () => (await admin.from("materials").select("banding_colour, no_banding").eq("id", ids[OAK]).single()).data;
    checkEqual("clearing a board's colour falls back to its own name when nothing matches", (await oak()).banding_colour, OAK);
    await setBoard({ name: OAK, colour: "grey" });
    checkEqual("a colour can be typed in any case", (await oak()).banding_colour, "grey");
  });

  await section("New job: boards first, timber last, and the first section", async () => {
    await laptop.goto(`${BASE}/jobs/new`);
    const options = await laptop.locator("select[name=materialId] option").allInnerTexts();
    checkEqual("boards are offered before timber", options.join(" | "), [BACK, GREY, GREY_BIG, OAK, SPARE, TIMBER].join(" | "));
    await laptop.fill("input[name=name]", "Wardrobe");
    await laptop.fill("input[name=sectionName]", "Carcass");
    await laptop.locator("select[name=materialId]").selectOption({ label: GREY });
    await laptop.getByRole("button", { name: "Create job" }).click();
    await laptop.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    jobUrl = laptop.url();
    jobId = jobUrl.split("/").pop();
    await card("Carcass").waitFor();
    const carcass = await sectionNamed("Carcass");
    checkEqual("the first section is saved on the chosen board", carcass?.material_id, ids[GREY]);
    checkEqual("and comes first", carcass?.position, 0);
    checkEqual("the job starts at 1 set", (await jobRow()).sets, 1);

    // Sent before the board list has arrived: the first section still gets a board.
    await laptop.goto(`${BASE}/jobs/new`);
    await laptop.locator("select[name=materialId]").waitFor();
    await laptop.locator("fieldset").evaluate((fieldset) => fieldset.remove());
    await laptop.fill("input[name=name]", "Quick job");
    await laptop.getByRole("button", { name: "Create job" }).click();
    await laptop.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    const quickId = laptop.url().split("/").pop();
    const { data: quick } = await admin.from("sections").select("name, material_id").eq("job_id", quickId);
    checkEqual("a job sent before its board list loaded still gets a first section", quick.length, 1);
    checkEqual("on the first board in Setup", quick[0]?.material_id, ids[BACK]);
    checkEqual("named after it", quick[0]?.name, BACK);
    await admin.from("jobs").delete().eq("id", quickId);
    await laptop.goto(jobUrl);
    await card("Carcass").waitFor();
  });

  await section("Moving a section to another board: which parts follow", async () => {
    await addPart("Carcass", { length: "60", width: "200", quantity: 2, name: "Side", edges: ["Left edge (long side)", "Right edge (long side)"] });
    await addPart("Carcass", { length: "40", width: "80", quantity: 1, name: "Door", board: OAK, edges: ["All 4 edges"] });
    await addSection("Frame", TIMBER);
    check("a timber section asks for a length only", (await card("Frame").innerText()).includes("cut to length"));
    checkEqual("and has no edge rectangle", await card("Frame").locator("fieldset").count(), 0);
    await addPart("Frame", { length: "100", quantity: 3, name: "Rail" });

    let fold = await openSectionFold("Carcass");
    await fold.locator("select[name=materialId]").selectOption({ label: GREY_BIG });
    await submit(fold, "Save section");
    await card("Carcass").getByText(`${GREY_BIG} · 3 parts`).waitFor();
    checkEqual("parts that used the section's board move to the new one", (await piecesNamed("Side"))[0].material_id, ids[GREY_BIG]);
    checkEqual("a part given its own board keeps it", (await piecesNamed("Door"))[0].material_id, ids[OAK]);
    checkEqual("the section is saved on the new board", (await sectionNamed("Carcass")).material_id, ids[GREY_BIG]);

    fold = await openSectionFold("Frame");
    await fold.locator("select[name=materialId]").selectOption({ label: GREY });
    await submit(fold, "Save section");
    await alertIn(fold).waitFor();
    checkEqual("timber parts cannot be moved to a board", await alertIn(fold).innerText(), "This section's parts are timber parts. Pick another timber.");
    checkEqual("the timber section stays on timber", (await sectionNamed("Frame")).material_id, ids[TIMBER]);
    checkEqual("and its parts too", (await piecesNamed("Rail"))[0].material_id, ids[TIMBER]);

    await laptop.reload();
    await addSection("Empty", GREY);
    fold = await openSectionFold("Empty");
    await fold.locator("select[name=materialId]").selectOption({ label: TIMBER });
    await submit(fold, "Save section");
    for (let i = 0; i < 40 && (await sectionNamed("Empty")).material_id !== ids[TIMBER]; i++) await laptop.waitForTimeout(250);
    checkEqual("a section with no parts can change to timber", (await sectionNamed("Empty")).material_id, ids[TIMBER]);

    fold = await openSectionFold("Empty");
    const nameBox = fold.locator("input[name=name]");
    await nameBox.fill("");
    await submit(fold, "Save section");
    checkEqual("the browser asks for a section name", await fold.locator("input[name=name]:invalid").count(), 1);
    await nameBox.evaluate((input) => input.removeAttribute("required"));
    await submit(fold, "Save section");
    await alertIn(fold).waitFor();
    checkEqual("and so does the server, if the browser check is bypassed", await alertIn(fold).innerText(), "Give the section a name, for example Miniyator.");

    await laptop.reload();
    fold = await openSectionFold("Empty");
    checkEqual("an empty section offers a plain Remove section", await fold.getByRole("button", { name: "Remove section", exact: true }).count(), 1);
    await fold.getByRole("button", { name: "Remove section", exact: true }).click();
    await card("Empty").waitFor({ state: "detached" });
    checkEqual("it is gone from the database", await sectionNamed("Empty"), null);

    await addSection("", SPARE);
    check("a section left unnamed is named after its board", (await sectionNamed(SPARE)) !== null);
    const positions = (await admin.from("sections").select("name, position").eq("job_id", jobId).order("position")).data;
    checkEqual("sections keep the order they were added in", positions.map((s) => s.name).join(", "), `Carcass, Frame, ${SPARE}`);
  });

  await section("Totals: tape by colour, a line per board type", async () => {
    await laptop.goto(jobUrl);
    let totals = await totalsText();
    // Sides: 2 × (2 × 200 cm) = 8.00 m on the Grey 9×7. Door: all round 2 × (80 + 40) = 2.40 m on Oak, whose tape is "grey".
    check("Grey and grey are one tape: 10.40 m", totals.includes("10.40 m edge banding"), totals);
    check("with no second figure, since it is one colour", !totals.includes("8.00 m edge banding") && !totals.includes(" · Grey"), totals);
    check("the Grey 9 × 7 line", totals.includes(`${GREY_BIG}: 1 board · 8.00 m banding`), totals);
    check("the Oak line", totals.includes(`${OAK}: 1 board · 2.40 m banding`), totals);
    // 3 rails of 100 cm fit one 12 ft plank.
    check("the timber line counts planks and no banding", totals.includes(`${TIMBER}: 1 plank`) && !totals.includes(`${TIMBER}: 1 plank ·`), totals);
    checkEqual("6 parts in all", await partCount(), 6);

    await setBoard({ name: OAK, noBanding: true });
    await laptop.goto(jobUrl);
    totals = await totalsText();
    check("turning Oak to no banding takes its 2.40 m off", totals.includes("8.00 m edge banding"), totals);
    check("its line shows 0 m", totals.includes(`${OAK}: 1 board · 0.00 m banding`), totals);
    const door = card("Carcass").locator("li", { hasText: "× Door" });
    checkEqual("the door row drops its banding line", (await door.innerText()).includes("Banding"), false);
    checkEqual("and its edge picture", await door.locator("svg").count(), 0);
    let plan = await openPlan(laptop, jobUrl);
    check("the plan agrees: 8.00 m", plan.includes("8.00 m edge banding"), plan.slice(0, 300));

    await setBoard({ name: OAK, noBanding: false, colour: "grey" });
    await laptop.goto(jobUrl);
    check("turning banding back on brings the door's marks back", (await totalsText()).includes("10.40 m edge banding"));
    plan = await openPlan(laptop, jobUrl);
    check("the plan shows one Grey tape figure", plan.includes("10.40 m edge banding · Grey"), plan.slice(0, 300));
  });

  await section("Sets: wrong numbers are refused", async () => {
    await laptop.goto(jobUrl);
    const setsForm = form(laptop, "Save sets");
    const box = setsForm.locator("input[name=sets]");
    for (const [typed, why] of [["0", "0 sets"], ["2.5", "half a set"], ["1000", "more than 999"], ["many", "a word"], ["", "a blank box"]]) {
      // The browser's own checks are taken off each time, since a re-render puts them back.
      await box.evaluate((input) => {
        ["min", "max", "required"].forEach((name) => input.removeAttribute(name));
        input.type = "text";
      });
      await box.fill(typed);
      await submit(setsForm, "Save sets");
      await alertIn(setsForm).waitFor();
      check(`${why} is refused`, (await alertIn(setsForm).innerText()) === "How many sets must be a whole number from 1.");
      checkEqual(`and the job stays at 1 set after ${why}`, (await jobRow()).sets, 1);
    }
    await laptop.reload();
    await form(laptop, "Save sets").locator("input[name=sets]").fill("3");
    await submit(form(laptop, "Save sets"), "Save sets");
    await laptop.getByRole("region", { name: "Totals so far" }).getByText("× 3 sets").waitFor();
    checkEqual("3 sets is 18 parts", await partCount(), 18);
    check("and 3 × 10.40 = 31.20 m of tape", (await totalsText()).includes("31.20 m edge banding"), await totalsText());
    checkEqual("the database holds 3 sets", (await jobRow()).sets, 3);
    // The button itself says what happened, and says what will happen next.
    const setsBox = laptop.locator("input[name=sets]").filter({ visible: true });
    const setsButton = laptop.locator("form", { has: setsBox }).locator("button");
    checkEqual("saving turns the button into ✓ Saved", (await setsButton.innerText()).replace(/\s+/g, " ").trim(), "✓ Saved");
    checkEqual("with nothing left to save, it is off", await setsButton.isDisabled(), true);
    // Box and button are one joined control, the same height, on screen at every width.
    for (const width of [360, 768, 1280]) {
      await laptop.setViewportSize({ width, height: 800 });
      const [box, button] = await Promise.all([setsBox.boundingBox(), setsButton.boundingBox()]);
      check(`at ${width}px box and button are joined and the same height`, Math.abs(box.y - button.y) <= 1 && Math.abs(box.height - button.height) <= 1 && Math.abs(box.x + box.width - button.x) <= 1, JSON.stringify({ box, button }));
      check(`at ${width}px the button is on screen`, button.x + button.width <= width, JSON.stringify({ box, button }));
    }
    await laptop.setViewportSize(LAPTOP.viewport);
    await setsBox.fill("4");
    checkEqual("changing the number brings back Save sets", (await setsButton.innerText()).trim(), "Save sets");
    checkEqual("and it can be pressed again", await setsButton.isDisabled(), false);
    await setsBox.fill("3");
    checkEqual("back to the saved number, nothing to save", await setsButton.isDisabled(), true);
    const quantities = (await admin.from("pieces").select("quantity").eq("job_id", jobId)).data.map((p) => p.quantity).sort();
    checkEqual("the parts keep the quantities typed", quantities.join(","), "1,2,3");
  });

  await section("A page left open while the job is accepted cannot change it", async () => {
    const stale = await laptop.context().newPage();
    stale.setDefaultTimeout(15000);
    await stale.goto(jobUrl);
    await card("Carcass", stale).waitFor();

    await openPlan(laptop, jobUrl);
    await laptop.getByRole("button", { name: "Yes: accept this plan" }).click();
    await laptop.waitForURL("**/cut-sheet");

    const staleSets = form(stale, "Save sets");
    await staleSets.locator("input[name=sets]").fill("5");
    await submit(staleSets, "Save sets");
    await alertIn(staleSets).waitFor();
    check("changing the sets is refused", (await alertIn(staleSets).innerText()).startsWith(LOCKED), await alertIn(staleSets).innerText());
    checkEqual("the job keeps 3 sets", (await jobRow()).sets, 3);

    const pieceForm = card("Carcass", stale).locator("form", { has: stale.getByRole("button", { name: "Add piece", exact: true }) });
    await pieceForm.locator("input[name=length]").fill("30");
    await pieceForm.locator("input[name=width]").fill("30");
    await submit(pieceForm, "Add piece");
    await alertIn(pieceForm).waitFor();
    check("adding a part is refused", (await alertIn(pieceForm).innerText()).startsWith(LOCKED));

    const remove = card("Carcass", stale).locator("li", { hasText: "× Side" }).locator("form");
    await submit(remove, "Remove");
    await alertIn(remove).waitFor();
    check("removing a part is refused", (await alertIn(remove).innerText()).startsWith(LOCKED));

    const fold = await openSectionFold("Carcass", stale);
    await fold.locator("input[name=name]").fill("Renamed");
    await submit(fold, "Save section");
    await alertIn(fold).waitFor();
    check("renaming a section is refused", (await alertIn(fold).innerText()).startsWith(LOCKED));
    const removeSection = fold.locator("form", { has: stale.getByRole("button", { name: /^Remove section/ }) });
    await submit(removeSection, "Remove section and its 3 parts");
    await alertIn(removeSection).waitFor();
    check("removing a section is refused", (await alertIn(removeSection).innerText()).startsWith(LOCKED));

    await stale.getByText("Add a section", { exact: true }).click();
    const newSection = form(stale, "Add section");
    await newSection.locator("input[name=name]").fill("Late");
    await submit(newSection, "Add section");
    await alertIn(newSection).waitFor();
    check("adding a section is refused", (await alertIn(newSection).innerText()).startsWith(LOCKED));

    const pricing = form(stale, "Save");
    await submit(pricing, "Save");
    await alertIn(pricing).waitFor();
    check("changing the pricing is refused", (await alertIn(pricing).innerText()).startsWith(LOCKED));

    const parts = (await admin.from("pieces").select("name").eq("job_id", jobId)).data.map((p) => p.name).sort();
    checkEqual("the parts are untouched", parts.join(", "), "Door, Rail, Side");
    const names = (await admin.from("sections").select("name").eq("job_id", jobId).order("position")).data.map((s) => s.name);
    checkEqual("the sections are untouched", names.join(", "), `Carcass, Frame, ${SPARE}`);
    await stale.close();

    await laptop.goto(jobUrl);
    await card("Carcass").waitFor();
    checkEqual("the accepted job shows no sets box", await laptop.locator("input[name=sets]").count(), 0);
    check("but says × 3 sets", (await main(laptop)).includes("× 3 sets"));
    checkEqual("no Add piece forms", await laptop.getByRole("button", { name: "Add piece" }).count(), 0);
    checkEqual("no section changes", await laptop.getByText("Change or remove this section").count(), 0);
  });

  await section("The cut sheet and cost summary of a 3-set job", async () => {
    await laptop.goto(`${jobUrl}/cut-sheet`);
    await laptop.getByText("Numbered list").waitFor();
    const rows = (await laptop.locator("tbody tr").filter({ visible: true }).allInnerTexts()).map(collapse);
    // Per set: 2 sides + 1 door + 3 rails = 6. Carcass first: 6 sides and 3 doors, then 9 rails.
    checkEqual("18 parts for 3 sets", rows.length, 18);
    check("Carcass parts come first", rows.slice(0, 9).every((row) => row.includes("Carcass")), rows[0]);
    check("the rails follow under Frame", rows.slice(9).every((row) => row.includes("Frame")), rows[9]);
    check("numbered 1 to 18 in that order", rows.every((row, i) => row.startsWith(`${i + 1} `)));
    checkEqual("the sheet has a Section column", await laptop.getByRole("columnheader", { name: "Section" }).count(), 1);
    check("and says × 3 sets", (await main(laptop)).includes("× 3 sets"));
    await laptop.goto(`${jobUrl}/cost-summary`);
    check("the cost summary names the job × 3 sets", (await main(laptop)).includes("Wardrobe × 3 sets"));

    await openPlan(laptop, jobUrl);
    await laptop.getByRole("button", { name: "Change the plan" }).click();
    await laptop.waitForURL(jobUrl);
    await card("Carcass").waitFor();
    checkEqual("reopened, the sets box is back at 3", await laptop.locator("input[name=sets]").inputValue(), "3");
  });

  await section("A board still used by a section cannot be removed", async () => {
    await laptop.goto(`${BASE}/setup`);
    const row = laptop.locator("li", { has: laptop.locator("summary", { hasText: SPARE }) });
    await row.locator("summary").click();
    const removeBoard = row.locator("form", { has: laptop.getByRole("button", { name: "Remove", exact: true }) });
    await submit(removeBoard, "Remove");
    await alertIn(removeBoard).waitFor();
    checkEqual("Setup says why", await alertIn(removeBoard).innerText(), "This material is used by a job, so it can't be removed.");
    await laptop.goto(jobUrl);
    const fold = await openSectionFold(SPARE);
    await fold.getByRole("button", { name: "Remove section", exact: true }).click();
    await card(SPARE).waitFor({ state: "detached" });
    await laptop.goto(`${BASE}/setup`);
    await row.locator("summary").click();
    await submit(removeBoard, "Remove");
    await row.waitFor({ state: "detached" });
    check("once its section is gone, the board can be removed", true);
  });

  await section("Another workshop cannot see or change these sections", async () => {
    const intruder = await addLogin("sections-intruder", newPassword());
    const other = await newPage(browser, LAPTOP);
    await logIn(other, intruder);
    await other.waitForURL("**/welcome");
    await other.fill("input[name=name]", "Client Test Workshop Sections Other");
    await other.getByRole("button", { name: "Continue" }).click();
    await other.waitForURL("**/setup");
    const { data: membership } = await admin.from("workshop_members").select("workshop_id").eq("user_id", intruder.id).single();
    created.workshops.push(membership.workshop_id);

    await other.goto(jobUrl);
    const page = collapse(await other.locator("body").innerText());
    check("opening this job's address shows nothing of it", !page.includes("Carcass") && !page.includes("Wardrobe"), page.slice(0, 120));

    const as = createClient(url, publishable, { auth: { persistSession: false } });
    const { error: loginError } = await as.auth.signInWithPassword({ email: intruder.email, password: intruder.password });
    checkEqual("the other workshop logs in", loginError, null);
    const carcass = await sectionNamed("Carcass");
    const seen = await as.from("sections").select("*").eq("job_id", jobId);
    checkEqual("it reads none of these sections", seen.data?.length, 0);
    const parts = await as.from("pieces").select("*").eq("job_id", jobId);
    checkEqual("and none of the parts", parts.data?.length, 0);
    const inserted = await as.from("sections").insert({ workshop_id: workshopId, job_id: jobId, name: "Sneaky", material_id: ids[GREY] });
    check("it cannot add a section to this job", inserted.error !== null);
    const ownInto = await as.from("sections").insert({ workshop_id: membership.workshop_id, job_id: jobId, name: "Sneaky", material_id: ids[GREY] });
    check("not even by claiming its own workshop", ownInto.error !== null);
    await as.from("sections").update({ name: "Hacked" }).eq("id", carcass.id);
    await as.from("sections").delete().eq("id", carcass.id);
    checkEqual("it cannot rename or delete one", (await sectionNamed("Carcass"))?.id, carcass.id);
    const piece = await as.from("pieces").insert({
      workshop_id: membership.workshop_id, job_id: jobId, section_id: carcass.id, material_id: ids[GREY], name: "Sneaky", length_mm: 100, width_mm: 100,
    });
    check("it cannot slip a part into a section", piece.error !== null);
    await as.from("jobs").update({ sets: 99 }).eq("id", jobId);
    checkEqual("it cannot change the sets", (await jobRow()).sets, 3);

    const visitor = createClient(url, publishable, { auth: { persistSession: false } });
    const anon = await visitor.from("sections").select("*");
    check("someone not logged in reads no sections at all", (anon.data ?? []).length === 0);
    await other.close();
  });

  await section("Parts and plans from before sections still work", async () => {
    const { data: saved } = await admin.from("plans").select("plan").eq("job_id", jobId).maybeSingle();
    // The 3-set plan was saved on accepting; it went when the job was reopened, so make one as an older version would have.
    const fresh = saved?.plan ?? null;
    check("reopening the job removed its saved plan", fresh === null);

    const { data: pieces } = await admin.from("pieces").select("material_id, name, length_mm, width_mm, quantity, banded_lengths, banded_widths").eq("job_id", jobId);
    const { data: oldJob } = await admin.from("jobs").insert({ workshop_id: workshopId, name: "Old wardrobe", status: "draft" }).select("id").single();
    await admin.from("pieces").insert(pieces.map((p) => ({ ...p, workshop_id: workshopId, job_id: oldJob.id })));
    const oldUrl = `${BASE}/jobs/${oldJob.id}`;

    await laptop.goto(oldUrl);
    await card("Other parts").waitFor();
    check("parts with no section show under Other parts", (await card("Other parts").innerText()).includes("2 × Side"));
    checkEqual("they all count", await partCount(), 6);
    check("the job offers to add a first section", (await main(laptop)).includes("Add your first section"));

    await laptop.goto(BASE);
    await laptop.locator("li", { hasText: "Old wardrobe" }).getByRole("button", { name: "Copy" }).click();
    await laptop.getByRole("heading", { name: "Old wardrobe (copy)" }).waitFor();
    checkEqual("a copy keeps them, still under Other parts", await card("Other parts").locator("li").count(), 3);

    await laptop.goto(oldUrl);
    await submit(card("Other parts").locator("li", { hasText: "× Rail" }).locator("form"), "Remove");
    await card("Other parts").locator("li", { hasText: "× Rail" }).waitFor({ state: "detached" });
    check("one can still be removed", true);

    // Accept it, then strip the plan back to what was saved before sections, sets and colours.
    await openPlan(laptop, oldUrl);
    await laptop.getByRole("button", { name: "Yes: accept this plan" }).click();
    await laptop.waitForURL("**/cut-sheet");
    const { data: plan } = await admin.from("plans").select("plan").eq("job_id", oldJob.id).single();
    const old = structuredClone(plan.plan);
    delete old.groups;
    delete old.sets;
    old.banding = [{ materialId: ids[GREY_BIG], materialName: GREY_BIG, mm: 8000 }];
    for (const board of old.boards) for (const placed of board.placements) delete placed.section;
    await admin.from("plans").update({ plan: old }).eq("job_id", oldJob.id);

    const shown = await openPlan(laptop, oldUrl);
    const group = collapse(await laptop.getByRole("region", { name: GREY_BIG, exact: true }).innerText());
    check("the old plan is still grouped by board", group.includes("1 board to buy"), group.slice(0, 120));
    check("with its banding read from the old figures", group.includes("8.00 m banding"), group.slice(0, 120));
    check("and no section line it never had", !group.includes("Section"), group.slice(0, 120));
    check("and no sets badge", !/× \d+ sets/.test(shown));
    await laptop.goto(`${oldUrl}/cut-sheet`);
    await laptop.getByText("Numbered list").waitFor();
    checkEqual("its cut sheet has no Section column", await laptop.getByRole("columnheader", { name: "Section" }).count(), 0);
    check("and gives the old banding", (await main(laptop)).includes(`Edge banding: 8.00 m for ${GREY_BIG}`));
  });

  await section("Every screen size", async () => {
    await checkEverySize(laptop, "the new job form", () => laptop.goto(`${BASE}/jobs/new`));
    await checkEverySize(laptop, "a job with sections, every fold open", async () => {
      await laptop.goto(jobUrl);
      await card("Carcass").waitFor();
      for (const summary of await laptop.locator("summary").all()) await summary.click();
    });
    await checkEverySize(laptop, "a plan grouped by board", () => openPlan(laptop, jobUrl));
  });

  await section("Nothing went wrong behind the scenes", async () => {
    check("no browser errors on any screen", pageErrors.length === 0, [...new Set(pageErrors)].map((text) => text.slice(0, 220)).slice(0, 6).join("\n      "));
  });
} finally {
  await finish(browser, before);
}
