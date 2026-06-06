import test from "node:test";
import assert from "node:assert/strict";
import { calculateEntryCount } from "../src/services/lottery.js";

test("ORDER_MINIMUM gives one lot from EUR 70", () => {
  const rule = { LOT_RULE_MODE: "ORDER_MINIMUM", LOT_ORDER_MINIMUM_CENTS: 7000, LOT_PER_CENTS: 7000 };
  assert.equal(calculateEntryCount(6999, rule), 0);
  assert.equal(calculateEntryCount(7000, rule), 1);
  assert.equal(calculateEntryCount(14000, rule), 1);
});

test("PER_AMOUNT gives one lot per EUR 70", () => {
  const rule = { LOT_RULE_MODE: "PER_AMOUNT", LOT_ORDER_MINIMUM_CENTS: 7000, LOT_PER_CENTS: 7000 };
  assert.equal(calculateEntryCount(6999, rule), 0);
  assert.equal(calculateEntryCount(7000, rule), 1);
  assert.equal(calculateEntryCount(14000, rule), 2);
});
