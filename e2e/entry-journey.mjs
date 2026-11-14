// Entering a long kitchen list fast, and what happens to parts that do not
// fit: quick entry by keyboard, the quick edge buttons, pasting a list,
// editing a part, notes, "Use 272 × 212 cm?", "Split into 2 pieces", the
// shopping list with Copy, WhatsApp and Print, and drawings to scale.
// Run with: npm run test:entry
//
// Like the other journeys it uses a throwaway workshop on the live database
// and removes it afterwards. Every expected figure is worked out by hand from
// the client's own lists.
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
  logIn,
  main,
  newPassword,
  openPlan,
  pageErrors,
  prepareOutput,
  section,
  snapshotOtherWorkshops,
  startServer,
  submit,
  waitForServer,
} from "./harness.mjs";

const GREY = "D-Grey 8×4";
const GREY_BIG = "D-Grey 9×7";
const BACK = "B-Panel 6 mm";
const SHORT = "Short 2 × 4";

prepareOutput("e2e/output/entry");
mkdirSync(`${OUTPUT}/sizes`, { recursive: true });
const before = await snapshotOtherWorkshops();
const browser = await chromium.launch();
startServer();
await waitForServer(true);

const owner = await addLogin("entry-owner", newPassword());
const context = await browser.newContext({ ...LAPTOP, permissions: ["clipboard-read", "clipboard-write"] });
const laptop = await context.newPage();
laptop.setDefaultTimeout(15000);
laptop.on("pageerror", (error) => pageErrors.push(`${laptop.url()}: ${error.message}`));
laptop.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && pageErrors.push(`${laptop.url()}: ${m.text()}`));
const ids = {};
let workshopId;
let jobUrl;
let jobId;

const card = (name) => laptop.getByRole("region", { name, exact: true });
const totals = async () => collapse(await laptop.getByRole("region", { name: "Totals so far" }).innerText());
const quickForm = (sectionName) => card(sectionName).locator("form", { has: laptop.getByRole("button", { name: "Add piece", exact: true }) });
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The row whose name is exactly this, so "Part 1" never matches Part 10 or "Part 1 (1 of 2)". */
const row = (sectionName, name) =>
  card(sectionName).locator("li").filter({ has: laptop.locator("p", { hasText: new RegExp(`^\\d+ × ${escape(name)}$`) }) });
const pieces = async () => (await admin.from("pieces").select("*").eq("job_id", jobId).order("created_at")).data;
const pieceNamed = async (name) => (await pieces()).find((p) => p.name === name);
const focusedName = () => laptop.evaluate(() => document.activeElement?.getAttribute("name"));

/** Types one line the way he would: width, Tab, length, Tab, quantity, Enter. */
async function typeLine(sectionName, { width, length, quantity, edges }) {
  const form = quickForm(sectionName);
  await form.locator("input[name=width]").click();
  await laptop.keyboard.type(width);
  await laptop.keyboard.press("Tab");
  await laptop.keyboard.type(length);
  await laptop.keyboard.press("Tab");
  await laptop.keyboard.press("ControlOrMeta+a");
  await laptop.keyboard.type(String(quantity));
  if (edges) {
    await form.getByRole("button", { name: edges, exact: true }).click();
    await form.locator("input[name=quantity]").focus();
  }
  const before = (await pieces()).length;
  await laptop.keyboard.press("Enter");
  for (let i = 0; i < 60 && (await pieces()).length === before; i++) await laptop.waitForTimeout(250);
  for (let i = 0; i < 40 && (await form.locator("input[name=width]").inputValue()) !== ""; i++) await laptop.waitForTimeout(100);
}

try {
  await section("Setup: the client's boards and a short timber", async () => {
    await logIn(laptop, owner);
    await laptop.waitForURL("**/welcome");
    await laptop.fill("input[name=name]", "Client Test Workshop Entry");
    await laptop.getByRole("button", { name: "Continue" }).click();
    await laptop.waitForURL("**/setup");
    const { data: membership } = await admin.from("workshop_members").select("workshop_id").eq("user_id", owner.id).single();
    workshopId = membership.workshop_id;
    created.workshops.push(workshopId);
    await admin.from("workshops").update({ display_unit: "cm" }).eq("id", workshopId);
    const board = (name, over = {}) => ({
      workshop_id: workshopId, kind: "board", name, board_type: "melamine", length_mm: 2420, width_mm: 1210, thickness_mm: 18,
      price_per_sheet: 50000, banding_colour: "D-Grey", no_banding: false, edge_trim_mm: 0, ...over,
    });
    const { data: boards, error } = await admin
      .from("materials")
      .insert([board(GREY), board(GREY_BIG, { length_mm: 2720, width_mm: 2120, price_per_sheet: 80000 }), board(BACK, { thickness_mm: 6, banding_colour: BACK, no_banding: true, price_per_sheet: 20000 })])
      .select("id, name");
    if (error) throw new Error(error.message);
    const { data: timber } = await admin.from("materials").insert({ workshop_id: workshopId, kind: "timber", name: SHORT }).select("id, name");
    for (const r of [...boards, ...timber]) ids[r.name] = r.id;
    // Only 8 ft planks: 243.8 cm.
    await admin.from("timber_lengths").insert({ workshop_id: workshopId, material_id: ids[SHORT], length_mm: 2438.4, price_per_piece: 6000 });

    await laptop.goto(`${BASE}/jobs/new`);
    await laptop.fill("input[name=name]", "Kitchen");
    await laptop.fill("input[name=customer]", "Mrs Mensah");
    await laptop.fill("input[name=sectionName]", "Miniyator");
    await laptop.locator("select[name=materialId]").selectOption({ label: GREY });
    await laptop.getByRole("button", { name: "Create job" }).click();
    await laptop.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    jobUrl = laptop.url();
    jobId = jobUrl.split("/").pop();
    await card("Miniyator").waitFor();
  });

  await section("Quick entry: width, length, how many, Enter, next line", async () => {
    const form = quickForm("Miniyator");
    const labels = await form.locator("label > span").allInnerTexts();
    checkEqual("the boxes come in his order: width, length, how many", labels.slice(0, 3).join(" | "), "Width (cm) | Length (cm) | How many");

    await typeLine("Miniyator", { width: "35", length: "60", quantity: 12, edges: "1 long" });
    const first = await pieceNamed("Part 1");
    check("Enter saves the line as typed", first && Number(first.width_mm) === 350 && Number(first.length_mm) === 600 && first.quantity === 12);
    checkEqual("with the quick edge button's 1 long side", `${first?.banded_lengths}/${first?.banded_widths}`, "1/0");
    checkEqual("the cursor goes back to the width for the next line", await focusedName(), "width");
    checkEqual("the quantity goes back to 1", await form.locator("input[name=quantity]").inputValue(), "1");
    checkEqual("and the edges back to none", await form.locator("fieldset button[aria-pressed=true]").count(), 0);

    await typeLine("Miniyator", { width: "16.4", length: "35", quantity: 4 });
    checkEqual("a second line straight after, without touching the mouse", (await pieceNamed("Part 2"))?.quantity, 4);

    const presets = [
      ["None", "0 of 2 long sides, 0 of 2 short sides"],
      ["2 long", "2 of 2 long sides, 0 of 2 short sides"],
      ["1 long + 2 short", "1 of 2 long sides, 2 of 2 short sides"],
      ["All 4", "2 of 2 long sides, 2 of 2 short sides"],
      ["1 long", "1 of 2 long sides, 0 of 2 short sides"],
    ];
    for (const [preset, shown] of presets) {
      await form.getByRole("button", { name: preset, exact: true }).click();
      const picture = collapse(await form.locator("fieldset").innerText());
      check(`${preset} marks the rectangle: ${shown}`, picture.includes(shown), picture);
      checkEqual(`and shows ${preset} as chosen`, await form.getByRole("button", { name: preset, exact: true }).getAttribute("aria-pressed"), "true");
    }
    await form.getByRole("button", { name: "Right edge (long side)", exact: true }).click();
    checkEqual("tapping the rectangle still works, and lights up 2 long", await form.getByRole("button", { name: "2 long", exact: true }).getAttribute("aria-pressed"), "true");
    await form.getByRole("button", { name: "None", exact: true }).click();

    await typeLine("Miniyator", { width: "55", length: "100", quantity: 2, edges: "1 long + 2 short" });
    const door = await pieceNamed("Part 3");
    checkEqual("1 long + 2 short is saved as 1 long and 2 short", `${door?.banded_lengths}/${door?.banded_widths}`, "1/2");
  });

  await section("A part too long for the 8 × 4: one tap onto the 9 × 7", async () => {
    await typeLine("Miniyator", { width: "35", length: "260", quantity: 6, edges: "1 long" });
    let text = await totals();
    check("the totals say Can't plan instead of a board count", text.includes("Can't plan 6 parts don't fit") && !/\d+ boards? to buy/.test(text), text);
    check("and name the part once, with how many", text.includes("Doesn't fit any board: 6 × Part 4 (Miniyator)"), text);
    const warning = collapse(await row("Miniyator", "Part 4").getByRole("alert").innerText());
    check("its row says why and offers the 9 × 7", warning.includes("Too long for 242 × 121 cm. Use 272 × 212 cm?") && warning.includes(`It fits ${GREY_BIG}`), warning);
    await row("Miniyator", "Part 4").getByRole("button", { name: "Use 272 × 212 cm", exact: true }).click();
    await row("Miniyator", "Part 4").getByRole("alert").waitFor({ state: "detached" });
    checkEqual("one tap moves it to the 9 × 7", (await pieceNamed("Part 4")).material_id, ids[GREY_BIG]);
    checkEqual("keeping its banding", (await pieceNamed("Part 4")).banded_lengths, 1);
    text = await totals();
    check("and the board count comes back", /\d+ boards? to buy/.test(text) && !text.includes("Can't plan"), text);
  });

  await section("A part longer than every board: split into 2 pieces", async () => {
    await typeLine("Miniyator", { width: "10", length: "280", quantity: 20, edges: "1 long + 2 short" });
    const text = await totals();
    check("20 plinths are one line, not 20", text.includes("Doesn't fit any board: 20 × Part 5 (Miniyator)") && !text.includes("Part 5, Part 5"), text);
    const warning = collapse(await row("Miniyator", "Part 5").getByRole("alert").innerText());
    check("the row says it fits no board", warning.includes("Too long for 242 × 121 cm. It fits no board in Setup"), warning);

    const plan = await openPlan(laptop, jobUrl);
    check("the plan says it can't plan", plan.includes("Can't plan: some parts don't fit"), plan.slice(0, 300));
    checkEqual("the plan lists the 20 as one line", await laptop.getByRole("alert").locator("li").count(), 1);
    check("with the size", plan.includes("20 × Part 5 · 280 × 10 cm (Miniyator, D-Grey 8×4)"), plan.slice(0, 400));
    checkEqual("no board count", await laptop.getByText(/^boards? to buy$/).count(), 0);
    checkEqual("no shopping list", await laptop.getByRole("region", { name: "Shopping list" }).count(), 0);
    checkEqual("and it cannot be accepted", await laptop.getByRole("button", { name: "Yes: accept this plan" }).count(), 0);
    await laptop.goto(`${jobUrl}/shopping-list`);
    await laptop.waitForURL(`${jobUrl}/plan`);
    check("the print view sends you back to the plan until it fits", true);

    await laptop.goto(jobUrl);
    const bandingBefore = (await totals()).match(/([\d.]+) m edge banding/)?.[1];
    await row("Miniyator", "Part 5").getByRole("button", { name: "Split into 2 pieces" }).click();
    await card("Miniyator").getByText("20 × Part 5 (2 of 2)").waitFor();
    const halves = (await pieces()).filter((p) => p.name.startsWith("Part 5"));
    checkEqual("the part is replaced by two halves", halves.map((p) => p.name).join(", "), "Part 5 (1 of 2), Part 5 (2 of 2)");
    check("each half is 140 cm long and 10 cm wide", halves.every((p) => Number(p.length_mm) === 1400 && Number(p.width_mm) === 100));
    check("both keep the 20", halves.every((p) => p.quantity === 20));
    check("both keep the long-side banding", halves.every((p) => p.banded_lengths === 1));
    checkEqual("each half keeps one end's short edge", halves.map((p) => p.banded_widths).join(","), "1,1");
    checkEqual("the banding total is exactly the same", (await totals()).match(/([\d.]+) m edge banding/)?.[1], bandingBefore);
    check("and now everything fits", !(await totals()).includes("Can't plan"));
  });

  await section("Timber too long for its planks splits the same way", async () => {
    await laptop.getByText("Add a section", { exact: true }).click();
    const sectionForm = laptop.locator("form", { has: laptop.getByRole("button", { name: "Add section" }) });
    await sectionForm.locator("input[name=name]").fill("Frame");
    await sectionForm.locator("select[name=materialId]").selectOption({ label: SHORT });
    await submit(sectionForm, "Add section");
    await card("Frame").waitFor();
    const form = quickForm("Frame");
    checkEqual("timber asks for the length first", await form.locator("label > span").first().innerText(), "Length (cm)");
    await form.locator("input[name=length]").fill("300");
    await form.locator("input[name=quantity]").fill("2");
    await form.locator("input[name=name]").fill("Rail");
    await laptop.keyboard.press("Enter");
    await card("Frame").getByText("2 × Rail").waitFor();
    const warning = collapse(await row("Frame", "Rail").getByRole("alert").innerText());
    check("a 300 cm rail is too long for 243.8 cm planks", warning.includes(`Too long for the longest ${SHORT} (243.8 cm)`), warning);
    await row("Frame", "Rail").getByRole("button", { name: "Split into 2 pieces" }).click();
    await card("Frame").getByText("2 × Rail (2 of 2)").waitFor();
    check("split, each half is 150 cm", (await pieces()).filter((p) => p.name.startsWith("Rail")).every((p) => Number(p.length_mm) === 1500 && p.width_mm === null));
  });

  await section("Edit a part: sizes, quantity, edges, board and a note", async () => {
    const part = row("Miniyator", "Part 1");
    await part.getByRole("button", { name: "Edit" }).click();
    const form = part.locator("form", { has: laptop.getByRole("button", { name: "Save part" }) });
    checkEqual("the editor opens with its width", await form.locator("input[name=width]").inputValue(), "35");
    checkEqual("its length", await form.locator("input[name=length]").inputValue(), "60");
    checkEqual("its quantity", await form.locator("input[name=quantity]").inputValue(), "12");
    checkEqual("and its edges", await form.getByRole("button", { name: "1 long", exact: true }).getAttribute("aria-pressed"), "true");

    await form.locator("input[name=length]").fill("abc");
    await submit(form, "Save part");
    await form.getByRole("alert").waitFor();
    checkEqual("a wrong size is refused", await form.getByRole("alert").innerText(), `Check the length. Try 720 or 2' 4".`);
    await form.locator("input[name=note]").evaluate((input) => input.removeAttribute("maxlength"));
    await form.locator("input[name=length]").fill("60");
    await form.locator("input[name=note]").fill("x".repeat(201));
    await submit(form, "Save part");
    await form.getByText("Keep the note under 200 characters.").waitFor();
    check("a note over 200 characters is refused", true);
    checkEqual("and nothing was saved", (await pieceNamed("Part 1")).quantity, 12);

    await form.locator("input[name=quantity]").fill("8");
    await form.getByRole("button", { name: "2 long", exact: true }).click();
    await form.locator("input[name=note]").fill("thick tape on front");
    await submit(form, "Save part");
    // The editor closes once the save is done; until then its button says Saving….
    await part.getByRole("button", { name: "Edit", exact: true }).waitFor();
    const saved = await pieceNamed("Part 1");
    check("the change is saved", saved.quantity === 8 && saved.banded_lengths === 2 && saved.note === "thick tape on front");
    const shown = collapse(await part.innerText());
    check("the row shows it", shown.includes("8 × Part 1") && shown.includes("Banding: 2 long") && shown.includes("Note: thick tape on front"), shown);

    const back = row("Miniyator", "Part 2");
    await back.getByRole("button", { name: "Edit" }).click();
    const backForm = back.locator("form", { has: laptop.getByRole("button", { name: "Save part" }) });
    await backForm.getByRole("button", { name: "All 4", exact: true }).click();
    await backForm.locator("select[name=materialId]").selectOption({ label: BACK });
    check("choosing the back panel hides the edges", (await backForm.innerText()).includes(`${BACK} takes no edge banding`));
    await submit(backForm, "Save part");
    await back.getByRole("button", { name: "Edit", exact: true }).waitFor();
    const panel = await pieceNamed("Part 2");
    check("a part moved to a back panel keeps no banding", panel.material_id === ids[BACK] && panel.banded_lengths === 0 && panel.banded_widths === 0);
  });

  await section("Paste a list: a preview, edges per line, unreadable lines held back", async () => {
    await card("Miniyator").getByText("Paste a list").click();
    const box = card("Miniyator").locator("textarea[name=pasted]");
    await box.fill(["35 x 120 - 6 pcs", "35x35-6", "D-Grey", "35 × 30 – 6", "35 x - 6", "55 x 76 - 2 pcs door"].join("\n"));
    await card("Miniyator").getByRole("button", { name: "Read the list" }).click();
    const table = card("Miniyator").locator("table");
    await table.waitFor();
    checkEqual("4 lines are read", await table.locator("tbody tr:not([data-unread])").count(), 4);
    checkEqual("2 lines are marked, not skipped", await table.locator("tbody tr[data-unread]").count(), 2);
    const unread = (await table.locator("tr[data-unread]").allInnerTexts()).map(collapse);
    check("each shows its line number and text", unread[0].startsWith("3 D-Grey") && unread[1].startsWith("5 35 x - 6"), unread.join(" / "));
    const add = card("Miniyator").getByRole("button", { name: /^Add \d+ parts?$/ });
    checkEqual("the list cannot be added while lines are unread", await add.isDisabled(), true);
    checkEqual("the button counts the parts: 6 + 6 + 6 + 2", await add.innerText(), "Add 20 parts");
    await card("Miniyator").getByLabel("Edges for line 1").selectOption({ label: "2 long" });
    await card("Miniyator").getByLabel(/Leave out the 2 lines I can't read/).check();
    checkEqual("leaving them out on purpose allows it", await add.isDisabled(), false);
    const before = (await pieces()).length;
    await add.click();
    await box.and(laptop.locator(":placeholder-shown")).waitFor();
    const added = (await pieces()).slice(before);
    checkEqual("4 parts are added", added.length, 4);
    checkEqual("in the order pasted, with his sizes", added.map((p) => `${Number(p.width_mm) / 10}x${Number(p.length_mm) / 10}-${p.quantity}`).join(" "), "35x120-6 35x35-6 35x30-6 55x76-2");
    checkEqual("the edges chosen per line are kept", added.map((p) => `${p.banded_lengths}/${p.banded_widths}`).join(" "), "2/0 0/0 0/0 0/0");
    checkEqual("a name after the quantity is kept", added[3].name, "door");
    check("the others are numbered", /^Part \d+$/.test(added[0].name));
    check("all on the section's board", added.every((p) => p.material_id === ids[GREY]));
    checkEqual("the box is cleared afterwards", await box.inputValue(), "");

    await box.fill("35 x 25 - 6\n35 x 190 - 3 pcs");
    await card("Miniyator").getByRole("button", { name: "Read the list" }).click();
    await card("Miniyator").getByRole("button", { name: "Add 9 parts" }).click();
    await box.and(laptop.locator(":placeholder-shown")).waitFor();
    checkEqual("a clean list adds straight away", (await pieces()).length, before + 6);
  });

  await section("The plan: shopping list, Copy, WhatsApp, Print, notes and scale", async () => {
    const plan = await openPlan(laptop, jobUrl);
    const shopping = laptop.getByRole("region", { name: "Shopping list" });
    const list = collapse(await shopping.innerText());
    check("the shopping list has the D-Grey 9 × 7", list.includes(`${GREY_BIG} 272 × 212 cm · GH¢ 800.00 each`), list);
    check("the D-Grey 8 × 4", list.includes(`${GREY} 242 × 121 cm · GH¢ 500.00 each`), list);
    check("the back panel", list.includes(`${BACK} 242 × 121 cm · GH¢ 200.00 each`), list);
    check("the planks", list.includes(`${SHORT} 243.8 cm · GH¢ 60.00 each`), list);
    check("banding per colour", list.includes("Edge banding D-Grey:"), list);
    const totalText = list.match(/Total for the wood: (GH¢ [\d,.]+)/)?.[1];
    check("and the total", Boolean(totalText), list);

    await shopping.getByRole("button", { name: "Copy for WhatsApp" }).click();
    await shopping.getByText("Copied. Paste it into a WhatsApp chat.").waitFor();
    const copied = await laptop.evaluate(() => navigator.clipboard.readText());
    check("Copy puts the list on the clipboard as text", copied.startsWith("*Shopping list: Kitchen (Mrs Mensah)*"), copied.slice(0, 80));
    check("with the boards", copied.includes(`boards ${GREY}, 242 × 121 cm`) || copied.includes(`board ${GREY}, 242 × 121 cm`), copied);
    check("the tape", copied.includes("*Edge banding*\n• D-Grey:"), copied);
    check("and the same total", copied.includes(`*Total for the wood: ${totalText}*`), copied);
    const whatsapp = await shopping.getByRole("link", { name: "Send on WhatsApp" }).getAttribute("href");
    checkEqual("Send on WhatsApp opens WhatsApp with the same text", decodeURIComponent(whatsapp.replace("https://wa.me/?text=", "")), copied);

    const notes = collapse(await laptop.getByRole("region", { name: "Notes for the workers" }).innerText());
    check("the plan lists the note with its part numbers", notes.includes("1–8 Part 1: thick tape on front"), notes);

    const scales = await laptop.locator("svg[data-scale]").evaluateAll((svgs) =>
      svgs.map((svg) => ({ label: svg.getAttribute("aria-label"), scale: Number(svg.getAttribute("data-scale")), width: svg.getBoundingClientRect().width })),
    );
    const big = scales.find((s) => s.label.startsWith(GREY_BIG));
    const small = scales.find((s) => s.label.startsWith(GREY));
    checkEqual("the 9 × 7 is drawn full width", big?.scale, 100);
    // 242 / 272 = 89 %.
    checkEqual("the 8 × 4 is drawn at 242 / 272 of it", small?.scale, 89);
    check("and really is narrower on screen", small && big && Math.abs(small.width / big.width - 242 / 272) < 0.01, `${small?.width} vs ${big?.width}`);
    check("the plan says it is to scale", plan.includes("Every board and plank is drawn to scale."));
    await laptop.screenshot({ path: `${OUTPUT}/1-plan.png`, fullPage: true });

    await shopping.getByRole("link", { name: "Print view" }).click();
    await laptop.waitForURL(`${jobUrl}/shopping-list`);
    await laptop.getByRole("heading", { name: "Shopping list" }).waitFor();
    await laptop.getByText("Total for the wood").filter({ visible: true }).waitFor();
    const printed = collapse(await main(laptop));
    check("the print view has the list and the same total", printed.includes("Shopping list") && printed.includes(`Total for the wood: ${totalText}`), printed.slice(0, 200));
    checkEqual("and a Print button", await laptop.getByRole("button", { name: "Print" }).count(), 1);

    await openPlan(laptop, jobUrl);
    await laptop.getByRole("button", { name: "Yes: accept this plan" }).click();
    await laptop.waitForURL("**/cut-sheet");
    await laptop.getByText("Numbered list").waitFor();
    const sheet = collapse(await main(laptop));
    check("the cut sheet lists the note at the top", sheet.includes("Notes 1–8 Part 1: thick tape on front"), sheet.slice(0, 300));
    const firstRow = collapse(await laptop.locator("tbody tr").filter({ visible: true }).first().innerText());
    check("and under the part in the numbered list", firstRow.includes("Note: thick tape on front"), firstRow);
    await laptop.goto(jobUrl);
    checkEqual("an accepted job offers no Edit", await laptop.getByRole("button", { name: "Edit" }).count(), 0);
    checkEqual("and no paste box", await laptop.getByText("Paste a list").count(), 0);
  });

  await section("Every screen size", async () => {
    await openPlan(laptop, jobUrl);
    await laptop.getByRole("button", { name: "Change the plan" }).click();
    await laptop.waitForURL(jobUrl);
    await checkEverySize(laptop, "the job with the paste box, a preview and an editor open", async () => {
      await laptop.goto(jobUrl);
      await card("Miniyator").getByText("Paste a list").click();
      await card("Miniyator").locator("textarea[name=pasted]").fill("35 x 120 - 6\nheading\n35 x 30 - 2");
      await card("Miniyator").getByRole("button", { name: "Read the list" }).click();
      await row("Miniyator", "Part 1").getByRole("button", { name: "Edit" }).click();
    });
    await checkEverySize(laptop, "the plan with its shopping list", () => openPlan(laptop, jobUrl));
    await checkEverySize(laptop, "the shopping list print view", async () => {
      await laptop.goto(`${jobUrl}/shopping-list`);
      await laptop.getByText("Total for the wood").filter({ visible: true }).waitFor();
    });
    await laptop.setViewportSize(LAPTOP.viewport);
    await laptop.goto(jobUrl);
    await typeLine("Miniyator", { width: "10", length: "290", quantity: 1 });
    await checkEverySize(laptop, "a job with a part that fits no board", () => laptop.goto(jobUrl));
  });

  await section("Nothing went wrong behind the scenes", async () => {
    check("no browser errors on any screen", pageErrors.length === 0, [...new Set(pageErrors)].map((t) => t.slice(0, 220)).slice(0, 6).join("\n      "));
  });
} finally {
  await finish(browser, before);
}
