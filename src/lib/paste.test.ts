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
