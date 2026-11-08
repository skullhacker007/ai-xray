import test from "node:test";
import assert from "node:assert/strict";
import { OBSERVATORY_SCENARIOS } from "../../src/app/lib/observatory-store";

test("Observatory Scenarios: Catalog contains all 5 mandatory scenarios", () => {
  const keys = Object.keys(OBSERVATORY_SCENARIOS);
  assert.ok(keys.includes("test_calc"));
  assert.ok(keys.includes("test_llm"));
  assert.ok(keys.includes("test_tool"));
  assert.ok(keys.includes("test_multiagent"));
  assert.ok(keys.includes("test_error"));
});

test("Observatory Scenarios: Context ledger calculations satisfy conservation invariant", () => {
  for (const [key, scenario] of Object.entries(OBSERVATORY_SCENARIOS)) {
    const ledger = scenario.contextLedger;
    // modelCapacity must be greater than actualInput
    assert.ok(
      ledger.modelCapacity > ledger.actualInput,
      `Scenario ${key}: capacity ${ledger.modelCapacity} not > input ${ledger.actualInput}`
    );
    // availableCapacity must be positive and non-overflowing
    assert.ok(
      ledger.availableCapacity > 0,
      `Scenario ${key}: available capacity must be positive`
    );
    assert.ok(
      ledger.actualInput <= ledger.modelCapacity,
      `Scenario ${key}: input exceeds capacity`
    );
  }
});

test("Observatory Scenarios: Trace nodes maintain valid parent-child hierarchy", () => {
  for (const [key, scenario] of Object.entries(OBSERVATORY_SCENARIOS)) {
    const spanIds = new Set(scenario.nodes.map((n) => n.spanId));
    for (const node of scenario.nodes) {
      if (node.parentSpanId) {
        assert.ok(
          spanIds.has(node.parentSpanId),
          `Scenario ${key}: node ${node.id} has invalid parentSpanId ${node.parentSpanId}`
        );
      }
    }
  }
});

test("Observatory Scenarios: Token sequence items have valid classifications", () => {
  for (const [key, scenario] of Object.entries(OBSERVATORY_SCENARIOS)) {
    for (const token of scenario.tokens) {
      assert.ok(
        token.classification === "input" || token.classification === "output",
        `Scenario ${key}: invalid token classification ${token.classification}`
      );
      assert.ok(
        typeof token.tokenId === "number" && token.tokenId >= 0,
        `Scenario ${key}: invalid tokenId ${token.tokenId}`
      );
      assert.ok(
        typeof token.tokenString === "string" && token.tokenString.length > 0,
        `Scenario ${key}: invalid tokenString`
      );
    }
  }
});
