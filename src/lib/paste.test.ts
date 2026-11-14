import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePastedList } from "./paste.ts";

const read = (text: string) => parsePastedList(text, "cm");

test("paste: his own ways of writing a line, in cm, width first", () => {
  const lines = read(["35 x 260 - 6 pcs", "35x260-6", "35 × 260 – 6", "35*260 6pcs", "16.4 x 35 - 4pcs", "35 x 260", "10 x 280 = 20 nos", "26,4 x 33 x 6"].join("\n"));
  assert.deepEqual(
    lines.map((l) => (l.ok ? [l.widthMm, l.lengthMm, l.quantity] : l.reason)),
    [[350, 2600, 6], [350, 2600, 6], [350, 2600, 6], [350, 2600, 6], [164, 350, 4], [350, 2600, 1], [100, 2800, 20], [264, 330, 6]],
  );
});

test("paste: a name after the quantity is kept, the size order is left as written", () => {
  const [door, side] = read("70 x 150 - 2 pcs door\n260 x 35 - 1 side panel");
  assert.ok(door.ok && door.name === "door" && door.widthMm === 700 && door.lengthMm === 1500);
  assert.ok(side.ok && side.name === "side panel" && side.widthMm === 2600 && side.lengthMm === 350);
});

test("paste: blank lines are ignored, unreadable lines are marked with their line number, never dropped", () => {
  const lines = read("Miniyator\n\n35 x 260 - 6\n35 x - 6\n35 x 260 - 0\n  \n12 x 40");
  assert.deepEqual(
    lines.map((l) => [l.line, l.ok]),
    [[1, false], [3, true], [4, false], [5, false], [7, true]],
  );
  const zero = lines.find((l) => l.line === 5);
  assert.ok(zero && !zero.ok && zero.reason === "The quantity must be a whole number");
  const heading = lines[0];
  assert.ok(!heading.ok && heading.text === "Miniyator");
});

test("paste: sizes follow the workshop's unit", () => {
  const [mm] = parsePastedList("350 x 2600 - 6", "mm");
  assert.ok(mm.ok && mm.widthMm === 350 && mm.lengthMm === 2600);
});

test("paste: pc, pcs, pic and pr mean pieces, with or without a number, and are never the name", () => {
  const cases: [string, number, string][] = [
    ["15.6 x 66.4 - 3 pic", 3, ""],
    ["15.6 x 66.4 - 3pic", 3, ""],
    ["15.6 x 66.4 - 3 pics", 3, ""],
    ["35 x 260 - 6 pc", 6, ""],
    ["35 x 260 - 6 PCS", 6, ""],
    ["35 x 260 - 2 pr", 2, ""],
    ["35 x 260 - 2 prs.", 2, ""],
    ["35 x 260 - 6 pcs door", 6, "door"],
    ["35 x 260 - 3 pic shelf", 3, "shelf"],
    // The word alone, with no number before it: one piece, no name.
    ["35 x 260 pcs", 1, ""],
    ["35 x 260 - pic", 1, ""],
    ["35 x 260 - pr", 1, ""],
    ["35 x 260 pc door", 1, "door"],
    // A real word that only starts the same way stays a name.
    ["35 x 260 - 2 nose", 2, "nose"],
    ["35 x 260 - 2 price tag", 2, "price tag"],
  ];
  for (const [text, quantity, name] of cases) {
    const [line] = read(text);
    assert.ok(line.ok, text);
    assert.deepEqual([line.widthMm, line.lengthMm > 0, line.quantity, line.name], [line.widthMm, true, quantity, name], text);
  }
  const [pic] = read("15.6 x 66.4 - 3 pic");
  assert.ok(pic.ok && pic.widthMm === 156 && pic.lengthMm === 664);
});
