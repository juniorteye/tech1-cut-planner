import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLength, formatMetres, formatMoney, formatSize, parseLength, parseMoney } from "./units.ts";

test("bare numbers follow the workshop's unit", () => {
  assert.equal(parseLength("720", "mm"), 720);
  assert.equal(parseLength("27", "ft-in"), 685.8);
  assert.equal(parseLength("206.4", "cm"), 2064);
  assert.equal(parseLength("2064mm", "cm"), 2064);
  assert.equal(parseLength("8ft", "cm"), 2438.4);
});

test("marked units win over the workshop's unit", () => {
  assert.equal(parseLength("720mm", "ft-in"), 720);
  assert.equal(parseLength("72 cm", "ft-in"), 720);
  assert.equal(parseLength("8ft", "mm"), 2438.4);
  assert.equal(parseLength("27in", "mm"), 685.8);
});

test("feet, inches and fractions", () => {
  assert.equal(parseLength(`2' 3 1/2"`, "mm"), 698.5);
  assert.equal(parseLength(`1/2"`, "mm"), 12.7);
  assert.equal(parseLength("3 1/4", "ft-in"), 82.55);
  assert.equal(parseLength(`2'`, "mm"), 609.6);
});

test("nonsense is rejected", () => {
  for (const text of ["", "abc", "0", "-5", "1/0", "12x"]) {
    assert.equal(parseLength(text, "mm"), null, text);
  }
});

test("formats lengths for each unit", () => {
  assert.equal(formatLength(720, "mm"), "720 mm");
  assert.equal(formatLength(698.5, "ft-in"), `2' 3 1/2"`);
  assert.equal(formatLength(12.7, "ft-in"), `1/2"`);
  assert.equal(formatLength(2064, "cm"), "206.4 cm");
  assert.equal(formatSize(2100, 350, "cm"), "210 × 35 cm");
  assert.equal(formatMetres(26872), "26.87 m");
});

test("money round-trips through pesewas", () => {
  assert.equal(parseMoney("450"), 45000);
  assert.equal(parseMoney("1,250.50"), 125050);
  assert.equal(parseMoney("12.345"), null);
  assert.equal(formatMoney(125050), "GH¢ 1,250.50");
});
