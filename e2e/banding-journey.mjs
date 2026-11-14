// The client's console, entered the way he works: centimetres, the board
// picked first, each part typed as length × width – quantity with its banded
// edges tapped on a small rectangle, and the totals watched as parts go in.
// Run with: npm run test:banding
//
// Like the week-long journey, it uses a throwaway workshop on the live
// database and removes it afterwards. Every expected figure here is worked out
// by hand from the client's list, never read back from the app.
import { chromium } from "playwright";
import {
  LAPTOP,
  OUTPUT,
  PHONE,
  addLogin,
  admin,
  check,
  checkEqual,
  collapse,
  created,
  expectNoSidewaysScroll,
  finish,
  form,
  logIn,
  main,
  newJob,
  newPage,
  newPassword,
  openPlan,
  pageErrors,
  removePiece,
  section,
  snapshotOtherWorkshops,
  startServer,
  submit,
  prepareOutput,
  waitForPiece,
  waitForServer,
  waitForUnit,
  BASE,
} from "./harness.mjs";
import { writeFileSync } from "node:fs";

const SMALL = "Board 4×8";
const LARGE = "Board 9×7";
const TIMBER = "2 × 4";

// His list, in cm. A left mark is the longer side whichever size is written
// first, so 26.4 × 35 bands a 35 cm edge. `metres` is the banding for the
// whole line, `total` the running total after it, `parts` the running count.
const CONSOLE = [
  { length: "210", width: "35", quantity: 1, long: 1, short: 0, metres: "2.10", total: "2.10", parts: 1 },
  { length: "206.4", width: "10", quantity: 4, long: 1, short: 0, metres: "8.26", total: "10.36", parts: 5 },
  { length: "26.4", width: "35", quantity: 4, long: 1, short: 0, metres: "1.40", total: "11.76", parts: 9 },
  { length: "28.2", width: "38", quantity: 2, long: 1, short: 0, metres: "0.76", total: "12.52", parts: 11 },
  { length: "213.6", width: "38", quantity: 1, long: 1, short: 2, metres: "2.90", total: "15.41", parts: 12 },
  { length: "70", width: "12", quantity: 6, long: 1, short: 0, metres: "4.20", total: "19.61", parts: 18 },
  { length: "30", width: "12", quantity: 6, long: 1, short: 0, metres: "1.80", total: "21.41", parts: 24 },
  { length: "70", width: "30", quantity: 3, long: 2, short: 2, metres: "6.00", total: "27.41", parts: 27 },
];
const BANDING = "27.41 m";
const EDGE_WORDS = { "1,0": "1 long", "1,2": "1 long + 2 short", "2,2": "all 4 edges" };
// 121 × 242 cm is 2.9282 m². The parts cover 4.3072 m², so 2 boards at the very least.
const SHEET_AREA_M2 = 1.21 * 2.42;
const sheetArea = (board) => (board === SMALL ? SHEET_AREA_M2 : 2.12 * 2.72);
const PART_AREA_M2 = CONSOLE.reduce((sum, row) => sum + (Number(row.length) / 100) * (Number(row.width) / 100) * row.quantity, 0);

/**
 * Measures every row of the Pieces list as it is drawn: the banding picture
 * must be a small thumbnail on the left, and the details beside it must get
 * a proper share of the row without spilling out of the card.
 */
async function measurePiecesList(page) {
  return page.locator("main section", { has: page.getByRole("heading", { name: "Pieces" }) }).evaluate((card) => {
    const cardBox = card.getBoundingClientRect();
    return [...card.querySelectorAll("li")].map((li) => {
      const icon = li.querySelector("svg")?.getBoundingClientRect();
      const details = li.querySelector("div")?.getBoundingClientRect();
      const button = li.querySelector("button")?.getBoundingClientRect();
      const row = li.getBoundingClientRect();
      return {
        text: li.querySelector("p")?.innerText,
        icon: icon && { width: icon.width, height: icon.height, right: icon.right },
        details: details && { left: details.left, width: details.width },
        rowWidth: row.width,
        insideCard: [li, ...li.querySelectorAll("*")].every((el) => {
          const box = el.getBoundingClientRect();
          return box.width === 0 || (box.left >= cardBox.left - 0.5 && box.right <= cardBox.right + 0.5);
        }),
        buttonRight: button?.right,
        detailsRight: details && details.left + details.width,
      };
    });
  });
}

function checkPiecesList(rows, label) {
  const problems = rows.flatMap((row) => {
    const issues = [];
    if (!row.icon || row.icon.width < 40 || row.icon.width > 60 || row.icon.height < 40 || row.icon.height > 60) {
      issues.push(`picture is ${Math.round(row.icon?.width)} × ${Math.round(row.icon?.height)} px`);
    }
    if (row.icon && row.details && row.icon.right > row.details.left) issues.push("picture is not to the left of the details");
    if (row.details && row.details.width < row.rowWidth * 0.4) issues.push(`details only ${Math.round(row.details.width)} px of ${Math.round(row.rowWidth)}`);
    if (row.buttonRight !== undefined && row.detailsRight > row.buttonRight) issues.push("details run under Remove");
    if (!row.insideCard) issues.push("something spills out of the card");
    return issues.map((issue) => `${row.text}: ${issue}`);
  });
  check(`the pieces list is laid out properly ${label}`, rows.length > 0 && problems.length === 0, problems.slice(0, 4).join("; "));
}

const totalsBar = (page) => page.getByRole("region", { name: "Totals so far" });

/** Reads the totals bar as a user would: boards, banding and parts. */
async function readTotals(page) {
  const text = collapse(await totalsBar(page).innerText());
  return {
    text,
    boards: Number(text.match(/^(\d+) boards?/)?.[1]),
    banding: text.match(/([\d.]+) m edge banding/)?.[1],
    parts: Number(text.match(/(\d+) parts?/)?.[1]),
  };
}

async function setUnit(page, unit) {
  await page.goto(`${BASE}/setup`);
  const sawForm = form(page, "Save");
  await sawForm.locator("select[name=unit]").selectOption(unit);
  await submit(sawForm, "Save");
  await waitForUnit(unit);
}

async function markEdges(scope, { long, short }, how = "click") {
  const press = (name) => scope.getByRole("button", { name, exact: true })[how]();
  if (long === 2 && short === 2) return press("All 4 edges");
  if (long >= 1) await press("Left edge (long side)");
  if (long === 2) await press("Right edge (long side)");
  if (short >= 1) await press("Top edge (short side)");
  if (short === 2) await press("Bottom edge (short side)");
}

const pressedEdges = (scope) => scope.locator("fieldset button[aria-pressed=true]").count();
const picker = async (scope) => collapse(await scope.locator("fieldset").innerText());

async function typePart(scope, { length, width, quantity }) {
  await scope.locator("input[name=length]").fill(length);
  if (width !== undefined) await scope.locator("input[name=width]").fill(width);
  await scope.locator("input[name=quantity]").fill(String(quantity));
}

async function enterConsole(page, board, { checkEachRow = false } = {}) {
  const pieceForm = form(page, "Add piece");
  await pieceForm.locator("select[name=materialId]").selectOption({ label: board });
  for (const [index, row] of CONSOLE.entries()) {
    await typePart(pieceForm, row);
    await markEdges(pieceForm, row);
    if (checkEachRow) {
      const shown = await picker(pieceForm);
      check(
        `row ${index + 1}: the rectangle shows ${row.long} long and ${row.short} short`,
        shown.includes(`${row.long} of 2 long sides, ${row.short} of 2 short sides`),
        shown,
      );
      const forAll = row.quantity > 1 ? ` for all ${row.quantity}` : "";
      check(`row ${index + 1}: it works out ${row.metres} m before saving`, shown.includes(`${row.metres} m of banding${forAll}`), shown);
    }
    await submit(pieceForm, "Add piece");
    await waitForPiece(page, row.quantity, `Part ${index + 1}`);
    if (checkEachRow) {
      const totals = await readTotals(page);
      checkEqual(`after row ${index + 1}: banding so far is ${row.total} m`, totals.banding, row.total);
      checkEqual(`after row ${index + 1}: ${row.parts} parts so far`, totals.parts, row.parts);
      const areaSoFar = CONSOLE.slice(0, index + 1).reduce((sum, r) => sum + (Number(r.length) / 100) * (Number(r.width) / 100) * r.quantity, 0);
      const fewest = Math.ceil(areaSoFar / sheetArea(board));
      check(`after row ${index + 1}: at least the ${fewest} board${fewest > 1 ? "s" : ""} the area needs`, totals.boards >= fewest, totals.text);
      checkEqual(`after row ${index + 1}: the next part starts with no edges marked`, await pressedEdges(pieceForm), 0);
      checkEqual(
        `after row ${index + 1}: the board stays chosen`,
        await pieceForm.locator("select[name=materialId] option:checked").innerText(),
        board,
      );
      checkEqual(`after row ${index + 1}: the size boxes are cleared`, await pieceForm.locator("input[name=length]").inputValue(), "");
    }
  }
}

prepareOutput("e2e/output/banding");
const before = await snapshotOtherWorkshops();
const browser = await chromium.launch();
startServer();
await waitForServer(true);

const owner = await addLogin("banding-owner", newPassword());
const laptop = await newPage(browser, LAPTOP);
let consoleUrl;
let consoleId;

try {
  await section("The owner sets up: centimetres, and the client's two boards", async () => {
    await logIn(laptop, owner);
    await laptop.waitForURL("**/welcome");
    await laptop.fill("input[name=name]", "Client Test Workshop Banding");
    await laptop.getByRole("button", { name: "Continue" }).click();
    await laptop.waitForURL("**/setup");
    const { data: membership } = await admin.from("workshop_members").select("workshop_id").eq("user_id", owner.id).single();
    created.workshops.push(membership.workshop_id);

    await setUnit(laptop, "cm");
    await laptop.reload();
    checkEqual("the workshop now works in centimetres", await laptop.inputValue("select[name=unit]"), "cm");

    const small = form(laptop, "Add board");
    checkEqual("a new board starts as 8 × 4", await small.locator("select[name=size] option:checked").innerText(), "8 × 4 ft (242 × 121 cm)");
    await small.locator("input[name=name]").fill(SMALL);
    await small.locator("input[name=thickness]").fill("18");
    await small.locator("input[name=price]").fill("450");
    await submit(small, "Add board");
    await laptop.locator("summary", { hasText: SMALL }).waitFor();
    check("the 4 × 8 is saved at 242 × 121 cm", (await laptop.locator("summary", { hasText: SMALL }).innerText()).includes("242 × 121 cm"));

    await laptop.getByText("Add a board", { exact: true }).click();
    const large = form(laptop, "Add board");
    await large.locator("input[name=name]").fill(LARGE);
    await large.locator("select[name=size]").selectOption("large");
    await large.locator("input[name=thickness]").fill("18");
    await large.locator("input[name=price]").fill("700");
    await submit(large, "Add board");
    await laptop.locator("summary", { hasText: LARGE }).waitFor();
    check("the 9 × 7 is saved at 272 × 212 cm", (await laptop.locator("summary", { hasText: LARGE }).innerText()).includes("272 × 212 cm"));

    const { data: boards } = await admin.from("materials").select("name, length_mm, width_mm").eq("workshop_id", created.workshops[0]).eq("kind", "board");
    const sizeOf = (name) => boards.find((b) => b.name === name);
    check("in the database the 4 × 8 is 2420 × 1210 mm", Number(sizeOf(SMALL).length_mm) === 2420 && Number(sizeOf(SMALL).width_mm) === 1210);
    check("in the database the 9 × 7 is 2720 × 2120 mm", Number(sizeOf(LARGE).length_mm) === 2720 && Number(sizeOf(LARGE).width_mm) === 2120);

    await laptop.locator("summary", { hasText: LARGE }).click();
    checkEqual("opening the 9 × 7 again shows its size picked", await laptop.locator("details[open] select[name=size] option:checked").first().innerText(), "9 × 7 ft (272 × 212 cm)");

    const timberForm = form(laptop, "Add timber");
    await timberForm.locator("input[name=name]").fill(TIMBER);
    await timberForm.locator("input[name=price12]").fill("80");
    await submit(timberForm, "Add timber");
    await laptop.locator("summary", { hasText: TIMBER }).waitFor();
  });

  await section("He enters the console part by part and watches the totals", async () => {
    consoleUrl = await newJob(laptop, "Console", "Mr Boateng");
    consoleId = consoleUrl.split("/").pop();
    const pieceForm = form(laptop, "Add piece");
    checkEqual("the first thing to choose is the board", await pieceForm.locator("select").first().getAttribute("name"), "materialId");
    checkEqual("no totals before any part is in", await totalsBar(laptop).count(), 0);

    await enterConsole(laptop, SMALL, { checkEachRow: true });

    const totals = await readTotals(laptop);
    checkEqual(`the console needs ${BANDING} of edge banding`, `${totals.banding} m`, BANDING);
    checkEqual("the console needs 2 boards of 121 × 242 cm", totals.boards, 2);
    check("2 is the least the area allows", Math.ceil(PART_AREA_M2 / SHEET_AREA_M2) === 2);
    checkEqual("27 parts in all", totals.parts, 27);

    for (const [index, row] of CONSOLE.entries()) {
      const line = collapse(await laptop.locator("li", { hasText: `${row.quantity} × Part ${index + 1}` }).innerText());
      check(
        `line ${index + 1} reads ${row.length} × ${row.width} cm, ${EDGE_WORDS[[row.long, row.short]]}, ${row.metres} m`,
        line.includes(`${row.length} × ${row.width} cm`) && line.includes(`Banding: ${EDGE_WORDS[[row.long, row.short]]} · ${row.metres} m`),
        line,
      );
    }
    await laptop.screenshot({ path: `${OUTPUT}/1-console-entered.png`, fullPage: true });

    for (const size of [
      { name: "on a laptop", width: 1280, height: 800 },
      { name: "on a tablet", width: 768, height: 1024 },
      { name: "on a phone", width: 390, height: 844 },
      { name: "on a small phone", width: 320, height: 640 },
    ]) {
      await laptop.setViewportSize(size);
      checkPiecesList(await measurePiecesList(laptop), size.name);
      await laptop.screenshot({ path: `${OUTPUT}/pieces-${size.width}.png`, fullPage: true });
    }

    // What the owner saw: the page drawn without its stylesheet, as happens
    // with a stale cached one. The stylesheets are taken out of the page
    // itself, since the service worker serves them where a network block
    // cannot reach. The picture must stay a thumbnail.
    for (const width of [1280, 390]) {
      await laptop.setViewportSize({ width, height: 800 });
      await laptop.reload();
      const removed = await laptop.evaluate(() => {
        const sheets = [...document.querySelectorAll('link[rel="stylesheet"], style')];
        sheets.forEach((sheet) => sheet.remove());
        return { sheets: sheets.length, left: document.styleSheets.length };
      });
      check(`the stylesheet really is gone at ${width} px`, removed.sheets > 0 && removed.left === 0, JSON.stringify(removed));
      const rows = await measurePiecesList(laptop);
      const big = rows.filter((row) => !row.icon || row.icon.width > 60 || row.icon.height > 60);
      check(`without its stylesheet the pictures stay small at ${width} px`, rows.length === 8 && big.length === 0, big.map((r) => `${Math.round(r.icon?.width)} px`).slice(0, 3).join(", "));
    }
    await laptop.screenshot({ path: `${OUTPUT}/pieces-no-stylesheet.png`, fullPage: true });
    await laptop.setViewportSize(LAPTOP.viewport);
    await laptop.reload();
  });

  await section("The rectangle reads the part the way he draws it", async () => {
    const pieceForm = form(laptop, "Add piece");
    await typePart(pieceForm, { length: "26.4", width: "35", quantity: 1 });
    const shown = await picker(pieceForm);
    check("26.4 × 35 is drawn tall with 35 cm up the side", shown.includes("35 cm × 26.4 cm"), shown);
    await markEdges(pieceForm, { long: 1, short: 0 });
    check("a left mark on 26.4 × 35 bands 0.35 m", shown !== (await picker(pieceForm)) && (await picker(pieceForm)).includes("0.35 m of banding"));
    await pieceForm.getByRole("button", { name: "Left edge (long side)", exact: true }).click();
    checkEqual("tapping an edge again takes the mark off", await pressedEdges(pieceForm), 0);
    await markEdges(pieceForm, { long: 0, short: 1 });
    check("a top mark bands the short 26.4 cm side", (await picker(pieceForm)).includes("0.26 m of banding"));

    await typePart(pieceForm, { length: "35", width: "26.4", quantity: 1 });
    check("typing the sizes the other way round gives the same answer", (await picker(pieceForm)).includes("0.26 m of banding"));

    await pieceForm.getByRole("button", { name: "All 4 edges", exact: true }).click();
    checkEqual("All 4 edges marks every side", await pressedEdges(pieceForm), 4);
    check("all round 35 × 26.4 is 1.23 m", (await picker(pieceForm)).includes("1.23 m of banding"));
    await pieceForm.locator("input[name=quantity]").fill("3");
    check("changing how many updates the figure at once", (await picker(pieceForm)).includes("3.68 m of banding for all 3"), await picker(pieceForm));
    await pieceForm.getByRole("button", { name: "Clear all", exact: true }).click();
    checkEqual("Clear all takes every mark off", await pressedEdges(pieceForm), 0);
    await laptop.reload();
  });

  await section("Mistakes he might make", async () => {
    const pieceForm = form(laptop, "Add piece");

    await typePart(pieceForm, { length: "abc", width: "35", quantity: 2 });
    await markEdges(pieceForm, { long: 2, short: 1 });
    await submit(pieceForm, "Add piece");
    await pieceForm.getByRole("alert").waitFor();
    check("a size that is not a number is refused", (await pieceForm.getByRole("alert").innerText()).includes("Check the length"));
    checkEqual("the edges he marked are kept", await pressedEdges(pieceForm), 3);
    checkEqual("the width he typed is kept", await pieceForm.locator("input[name=width]").inputValue(), "35");
    checkEqual("the totals did not move", (await readTotals(laptop)).banding, "27.41");

    await pieceForm.locator("input[name=length]").fill("50");
    // Hold each save back a little so the loader is on screen long enough to see.
    const slowSaves = async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await route.continue();
    };
    await laptop.route("**/*", slowSaves);
    await submit(pieceForm, "Add piece");
    const adding = laptop.getByRole("button", { name: "Adding…", exact: true });
    await adding.waitFor();
    check("the button shows a loader while the piece saves", (await adding.locator(".animate-spin").count()) === 1);
    check("and cannot be pressed twice", await adding.isDisabled());
    await waitForPiece(laptop, 2, "Part 9");
    await laptop.getByRole("button", { name: "Add piece", exact: true }).waitFor();
    checkEqual("once saved it says Add piece again", await laptop.getByRole("button", { name: "Adding…" }).count(), 0);
    // 2 × (2 × 50 + 35) = 270 cm
    checkEqual("once corrected it saves with those edges: 2.70 m more", (await readTotals(laptop)).banding, "30.11");
    const partRow = laptop.locator("li", { hasText: "× Part 9" });
    await partRow.getByRole("button", { name: "Remove", exact: true }).click();
    await partRow.getByRole("button", { name: "Removing…", exact: true }).waitFor();
    check("Remove shows a loader too", true);
    await partRow.waitFor({ state: "detached" });
    await laptop.unroute("**/*", slowSaves);
    checkEqual("removing it takes its banding back off", (await readTotals(laptop)).banding, "27.41");
    checkEqual("and its parts", (await readTotals(laptop)).parts, 27);

    await typePart(pieceForm, { length: "50", width: "35", quantity: 0 });
    await submit(pieceForm, "Add piece");
    checkEqual("how many cannot be 0", await pieceForm.locator("input[name=quantity]:invalid").count(), 1);
    await typePart(pieceForm, { length: "50", width: "", quantity: 1 });
    await submit(pieceForm, "Add piece");
    checkEqual("a board part needs a width", await pieceForm.locator("input[name=width]:invalid").count(), 1);
    await laptop.waitForTimeout(500);
    checkEqual("neither was saved", (await readTotals(laptop)).parts, 27);

    await typePart(pieceForm, { length: "250", width: "50", quantity: 1 });
    await markEdges(pieceForm, { long: 1, short: 0 });
    await submit(pieceForm, "Add piece");
    await waitForPiece(laptop, 1, "Part 9");
    const tooBig = await readTotals(laptop);
    check("a part longer than the board is flagged in the totals", tooBig.text.includes("1 part does not fit"), tooBig.text);
    const plan = await openPlan(laptop, consoleUrl);
    check("the plan names it", plan.includes("These pieces do not fit your materials: Part 9"), plan.slice(0, 200));
    checkEqual("and it cannot be accepted", await laptop.getByRole("button", { name: "Yes: accept this plan" }).count(), 0);
    await laptop.goto(consoleUrl);
    await removePiece(laptop, "Part 9");
    check("once removed, nothing is flagged", !(await readTotals(laptop)).text.includes("does not fit"));

    await pieceForm.locator("select[name=materialId]").selectOption({ label: TIMBER });
    checkEqual("timber has no edges to band", await pieceForm.locator("fieldset").count(), 0);
    checkEqual("and no width", await pieceForm.locator("input[name=width]").count(), 0);
    await typePart(pieceForm, { length: "90", quantity: 2 });
    await submit(pieceForm, "Add piece");
    await waitForPiece(laptop, 2, "Part 9");
    const withTimber = await readTotals(laptop);
    check("timber shows as a plank in the totals", /\b1 plank\b/.test(withTimber.text), withTimber.text);
    checkEqual("and adds no banding", withTimber.banding, "27.41");
    await removePiece(laptop, "Part 9");
    await pieceForm.locator("select[name=materialId]").selectOption({ label: SMALL });
  });

  await section("The plan: 2 boards, 27.41 m, and every banded edge drawn", async () => {
    const plan = await openPlan(laptop, consoleUrl);
    check("2 boards to buy", plan.includes("2 boards to buy"), plan.slice(0, 200));
    checkEqual("and both are new sheets", await laptop.getByText("New sheet ·").count(), 2);
    check(`${BANDING} of edge banding`, plan.includes(`${BANDING} edge banding`));
    check("it says what to buy", plan.includes(`Buy: 2 of ${SMALL} (242 × 121 cm)`), plan.slice(0, 300));

    // Pieces are numbered in the order entered: Part 1 is 1, Part 2 is 2 to 5, and so on.
    const expected = CONSOLE.flatMap((row) => Array.from({ length: row.quantity }, () => [row.long, row.short]));
    const drawn = await laptop.locator("main svg[role=img]").evaluateAll((svgs) =>
      svgs.flatMap((svg) =>
        [...svg.querySelectorAll("g")].map((g) => {
          const rect = g.querySelector("rect");
          const [x, y, w, h] = ["x", "y", "width", "height"].map((name) => Number(rect.getAttribute(name)));
          const lines = [...g.querySelectorAll("line")].map((line) => {
            const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)));
            const onEdge =
              (x1 === x2 && (Math.abs(x1 - x) < 0.01 || Math.abs(x1 - x - w) < 0.01) && Math.min(y1, y2) >= y - 0.01 && Math.max(y1, y2) <= y + h + 0.01) ||
              (y1 === y2 && (Math.abs(y1 - y) < 0.01 || Math.abs(y1 - y - h) < 0.01) && Math.min(x1, x2) >= x - 0.01 && Math.max(x1, x2) <= x + w + 0.01);
            const length = Math.abs(x2 - x1) + Math.abs(y2 - y1);
            return { onEdge, long: Math.abs(length - Math.max(w, h)) < 0.01 };
          });
          return { number: Number(g.querySelector("text").textContent), lines };
        }),
      ),
    );
    checkEqual("all 27 parts are drawn", drawn.length, 27);
    checkEqual("38 banded edges are drawn in all", drawn.reduce((sum, part) => sum + part.lines.length, 0), 38);
    check("every banding mark sits on its part's edge", drawn.every((part) => part.lines.every((line) => line.onEdge)));
    const wrong = drawn.filter((part) => {
      const [long, short] = expected[part.number - 1];
      return part.lines.filter((l) => l.long).length !== long || part.lines.filter((l) => !l.long).length !== short;
    });
    check("each part's long and short marks match the list, however it lies on the board", wrong.length === 0, wrong.map((p) => p.number).join(", "));
    await laptop.screenshot({ path: `${OUTPUT}/2-console-plan.png`, fullPage: true });
  });

  await section("Accepting: the cut sheet tells the bander what to do", async () => {
    await laptop.getByRole("button", { name: "Yes: accept this plan" }).click();
    await laptop.waitForURL("**/cut-sheet");
    await laptop.getByText("Numbered list").waitFor();
    const sheet = collapse(await main(laptop));
    check("the cut sheet gives the banding total", sheet.includes(`Edge banding: ${BANDING} for ${SMALL}`), sheet.slice(0, 200));
    const rows = await laptop.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.innerText.trim())));
    checkEqual("27 lines, one per part", rows.length, 27);
    const names = CONSOLE.flatMap((row, i) => Array.from({ length: row.quantity }, () => [`Part ${i + 1}`, EDGE_WORDS[[row.long, row.short]]]));
    const mismatched = rows.filter((cells) => {
      const [name, band] = names[Number(cells[0]) - 1];
      return cells[1] !== name || cells[4] !== band;
    });
    check("every line says which edges to band", mismatched.length === 0, mismatched.map((c) => c.join(" | ")).slice(0, 3).join(" ; "));
    writeFileSync(`${OUTPUT}/cut-sheet.pdf`, await laptop.pdf({ format: "A4" }));

    await laptop.goto(`${consoleUrl}/cost-summary`);
    await laptop.getByRole("heading", { name: "Cost summary" }).waitFor();
    check("the customer is charged for 2 boards at GH¢ 450", collapse(await main(laptop)).includes("Material total GH¢ 900.00"));

    await laptop.goto(consoleUrl);
    await laptop.getByText("the pieces are locked").waitFor();
    checkEqual("once accepted, parts can't be added", await laptop.getByRole("button", { name: "Add piece" }).count(), 0);
    checkEqual("the totals still show", (await readTotals(laptop)).banding, "27.41");

    await openPlan(laptop, consoleUrl);
    await laptop.getByRole("button", { name: "Change the plan" }).click();
    await laptop.waitForURL(consoleUrl);
    await form(laptop, "Add piece").waitFor();
    checkEqual("changing the plan opens the parts again, totals intact", (await readTotals(laptop)).banding, "27.41");
  });

  await section("A copy of the console keeps every banded edge", async () => {
    await laptop.goto(BASE);
    await laptop.locator("main li", { hasText: "Console" }).getByRole("button", { name: "Copy" }).click();
    await laptop.getByRole("heading", { name: "Console (copy)" }).waitFor();
    const totals = await readTotals(laptop);
    checkEqual("the copy has 27 parts", totals.parts, 27);
    checkEqual(`the copy needs ${BANDING}`, `${totals.banding} m`, BANDING);
  });

  await section("The same console on the 9 × 7 board", async () => {
    const bigUrl = await newJob(laptop, "Console on 9×7", "Mr Boateng");
    await enterConsole(laptop, LARGE);
    const totals = await readTotals(laptop);
    checkEqual("it fits on 1 board of 212 × 272 cm", totals.boards, 1);
    checkEqual("the banding is the same", `${totals.banding} m`, BANDING);
    await laptop.goto(bigUrl);
    checkEqual(
      "coming back later, the 9 × 7 is still the chosen board",
      await form(laptop, "Add piece").locator("select[name=materialId] option:checked").innerText(),
      LARGE,
    );
  });

  await section("The same job reads the same in other units", async () => {
    await setUnit(laptop, "mm");
    await laptop.goto(consoleUrl);
    const line = collapse(await laptop.locator("li", { hasText: "1 × Part 5" }).innerText());
    check("in millimetres the top reads 2136 × 380 mm", line.includes("2136 × 380 mm"), line);
    checkEqual("and the banding is unchanged", (await readTotals(laptop)).banding, "27.41");
    const pieceForm = form(laptop, "Add piece");
    await typePart(pieceForm, { length: "2136", width: "380", quantity: 1 });
    await markEdges(pieceForm, { long: 1, short: 2 });
    check("a bare number now means millimetres", (await picker(pieceForm)).includes("2.90 m of banding"));

    await setUnit(laptop, "ft-in");
    await laptop.goto(consoleUrl);
    await typePart(pieceForm, { length: "2'", width: "1'", quantity: 1 });
    await markEdges(pieceForm, { long: 1, short: 0 });
    check("in feet, 2' × 1' with one long side is 0.61 m", (await picker(pieceForm)).includes("0.61 m of banding"), await picker(pieceForm));
    await setUnit(laptop, "cm");
  });

  await section("On his phone at the workshop", async () => {
    const phone = await newPage(browser, { ...PHONE, hasTouch: true, isMobile: true });
    await logIn(phone, owner);
    await phone.waitForURL(`${BASE}/`);
    await phone.goto(consoleUrl);
    const pieceForm = form(phone, "Add piece");
    await typePart(pieceForm, { length: "70", width: "30", quantity: 1 });
    await markEdges(pieceForm, { long: 1, short: 1 }, "tap");
    checkEqual("edges can be tapped with a finger", await pressedEdges(pieceForm), 2);
    await pieceForm.getByRole("button", { name: "Add piece" }).scrollIntoViewIfNeeded();
    const bar = await totalsBar(phone).boundingBox();
    check("the totals stay at the top of the screen while he types", bar !== null && bar.y >= -1 && bar.y < 5, JSON.stringify(bar));
    await pieceForm.getByRole("button", { name: "Add piece" }).tap();
    await waitForPiece(phone, 1, "Part 9");
    // One 70 side and one 30 side: 1.00 m more.
    checkEqual("his part counts straight away", (await readTotals(phone)).banding, "28.41");
    await expectNoSidewaysScroll(phone, "the part form on a phone");
    await phone.setViewportSize({ width: 320, height: 640 });
    await expectNoSidewaysScroll(phone, "the part form on a small phone");
    await phone.screenshot({ path: `${OUTPUT}/3-phone.png`, fullPage: true });
    await removePiece(phone, "Part 9");
    await phone.context().close();
  });

  await section("An offcut in the store never counts as a board to buy", async () => {
    await laptop.goto(`${BASE}/leftovers`);
    const addForm = form(laptop, "Add leftover");
    await addForm.locator("select[name=materialId]").selectOption({ label: SMALL });
    await addForm.locator("input[name=length]").fill("100");
    await addForm.locator("input[name=width]").fill("50");
    await submit(addForm, "Add leftover");
    await laptop.locator("summary", { hasText: "100 × 50 cm" }).waitFor();

    await laptop.goto(consoleUrl);
    const totals = await readTotals(laptop);
    // The offcut is 0.5 m²; the parts still cover far more than one 2.93 m² board.
    checkEqual("it still needs 2 new boards to buy", totals.boards, 2);
    check("the totals say the offcut is used and not counted", totals.text.includes("Also uses 1 offcut from your leftover store, not counted in the boards to buy"), totals.text);

    const plan = await openPlan(laptop, consoleUrl);
    check("the plan agrees: 2 boards to buy", plan.includes("2 boards to buy") && plan.includes(`Buy: 2 of ${SMALL}`), plan.slice(0, 300));
    checkEqual("exactly 2 boards on the plan are new sheets", await laptop.getByText("New sheet ·").count(), 2);
    checkEqual("and 1 is the offcut", await laptop.getByText("From your leftover store ·").count(), 1);
    check("the plan says so too", plan.includes("Also uses 1 offcut from your leftover store"));

    await laptop.goto(`${BASE}/leftovers`);
    await laptop.locator("summary", { hasText: "100 × 50 cm" }).click();
    const done = laptop.locator("li", { hasText: "100 × 50 cm" });
    await done.getByRole("button", { name: "Used for something else" }).click();
    await done.waitFor({ state: "detached" });
    await laptop.goto(consoleUrl);
    check("with the store empty again the note goes away", !(await readTotals(laptop)).text.includes("offcut"));
  });

  await section("A plan saved before banding existed still opens", async () => {
    await openPlan(laptop, consoleUrl);
    await laptop.getByRole("button", { name: "Yes: accept this plan" }).click();
    await laptop.waitForURL("**/cut-sheet");
    const { data: saved } = await admin.from("plans").select("plan").eq("job_id", consoleId).single();
    const old = structuredClone(saved.plan);
    delete old.banding;
    for (const board of old.boards) {
      for (const placed of board.placements) {
        delete placed.bandedLengths;
        delete placed.bandedWidths;
      }
    }
    const workshopId = created.workshops[0];
    const { data: job } = await admin.from("jobs").insert({ workshop_id: workshopId, name: "Old console", status: "accepted" }).select("id").single();
    const { data: pieces } = await admin.from("pieces").select("material_id, name, length_mm, width_mm, quantity").eq("job_id", consoleId);
    await admin.from("pieces").insert(pieces.map((piece) => ({ ...piece, workshop_id: workshopId, job_id: job.id })));
    await admin.from("plans").insert({ job_id: job.id, workshop_id: workshopId, plan: old });

    await laptop.goto(`${BASE}/jobs/${job.id}/cut-sheet`);
    await laptop.getByText("Numbered list").waitFor();
    checkEqual("its cut sheet opens with all 27 parts", await laptop.locator("tbody tr").count(), 27);
    checkEqual("with no banding column it never had", await laptop.getByRole("columnheader", { name: "Band" }).count(), 0);
    await openPlan(laptop, `${BASE}/jobs/${job.id}`);
    check("its plan opens too", true);
  });

  await section("Nothing went wrong behind the scenes", async () => {
    check("no browser errors on any screen", pageErrors.length === 0, [...new Set(pageErrors)].map((text) => text.slice(0, 220)).slice(0, 6).join("\n      "));
  });
} finally {
  await finish(browser, before);
}
