import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSafeMath } from "../../src/app/lib/safe-math";

test("Safe Math: Basic arithmetic operations", () => {
  assert.equal(evaluateSafeMath("2 + 2"), 4);
  assert.equal(evaluateSafeMath("10 - 3"), 7);
  assert.equal(evaluateSafeMath("6 * 7"), 42);
  assert.equal(evaluateSafeMath("100 / 4"), 25);
  assert.equal(evaluateSafeMath("14 % 4"), 2);
  assert.equal(evaluateSafeMath("348 * 29"), 10092);
});

test("Safe Math: Operator precedence and parentheses", () => {
  assert.equal(evaluateSafeMath("2 + 3 * 4"), 14);
  assert.equal(evaluateSafeMath("(2 + 3) * 4"), 20);
  assert.equal(evaluateSafeMath("10 - 2 * 3 + 4 / 2"), 6);
  assert.equal(evaluateSafeMath("((2 + 3) * (4 + 1))"), 25);
});

test("Safe Math: Exponentiation (power operator ^)", () => {
  assert.equal(evaluateSafeMath("2 ^ 3"), 8);
  assert.equal(evaluateSafeMath("3 ^ 2"), 9);
  assert.equal(evaluateSafeMath("2 ^ 3 ^ 2"), 512); // right-associative: 2^(3^2) = 2^9 = 512
  assert.equal(evaluateSafeMath("(2 ^ 3) ^ 2"), 64);
});

test("Safe Math: Unary operators and decimal numbers", () => {
  assert.equal(evaluateSafeMath("-5 + 10"), 5);
  assert.equal(evaluateSafeMath("+5 + 10"), 15);
  assert.equal(evaluateSafeMath("-(3 + 4)"), -7);
  assert.equal(evaluateSafeMath("3.5 * 2"), 7);
  assert.equal(evaluateSafeMath("0.1 + 0.2").toFixed(1), "0.3");
});

test("Safe Math: Division and Modulo by zero throw clean errors", () => {
  assert.throws(() => evaluateSafeMath("10 / 0"), /Division by zero/);
  assert.throws(() => evaluateSafeMath("10 % 0"), /Modulo by zero/);
});

test("Safe Math: Malformed expressions throw clean errors without crash", () => {
  assert.throws(() => evaluateSafeMath(""), /Empty expression/);
  assert.throws(() => evaluateSafeMath("   "), /Empty expression/);
  assert.throws(() => evaluateSafeMath("2 + * 3"), /Unexpected token/);
  assert.throws(() => evaluateSafeMath("(2 + 3"), /Expected '\)'/);
  assert.throws(() => evaluateSafeMath("2 + 3)"), /Unexpected trailing input/);
  assert.throws(() => evaluateSafeMath("alert(1)"), /Unexpected character/);
  assert.throws(() => evaluateSafeMath("process.exit()"), /Unexpected character/);
  assert.throws(() => evaluateSafeMath("3..14 + 1"), /Invalid number/);
});
