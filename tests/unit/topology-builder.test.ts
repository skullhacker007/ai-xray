import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDynamicTopology,
  getMappedNodeId,
  getMappedStepId,
} from "../../src/app/lib/topology-builder";

test("Topology: Stream mode builds 7 distinct connected nodes with valid hierarchy", () => {
  const topo = buildDynamicTopology(
    "stream",
    "Explain AI",
    "nvidia/nemotron-3.5-bolt-e4b",
    "trace-test-stream",
    "completed",
    120,
    "AI is machine learning.",
    2,
    5
  );

  assert.equal(topo.nodes.length, 7);
  assert.equal(topo.connections.length, 6);

  const nodeIds = topo.nodes.map((n) => n.id);
  assert.deepEqual(nodeIds, [
    "node-in",
    "node-tok",
    "node-embed",
    "node-prefill",
    "node-decode",
    "node-sample",
    "node-out",
  ]);

  // Check parent-child span hierarchy
  const spanMap = new Map(topo.nodes.map((n) => [n.spanId, n]));
  for (const node of topo.nodes) {
    if (node.parentSpanId) {
      assert.ok(
        spanMap.has(node.parentSpanId),
        `Node ${node.id} has invalid parentSpanId ${node.parentSpanId}`
      );
    }
  }
});

test("Topology: Tool mode builds 6 nodes and integrates tool executions", () => {
  const toolExecutions = [
    { name: "calculator", args: { expression: "348 * 29" }, result: 10092, duration_ms: 2 },
  ];
  const topo = buildDynamicTopology(
    "tool",
    "What is 348 * 29?",
    "nvidia/nemotron-3.5-bolt-e4b",
    "trace-test-tool",
    "completed",
    250,
    "The answer is 10092.",
    8,
    6,
    { toolExecutions }
  );

  assert.equal(topo.nodes.length, 6);
  const execNode = topo.nodes.find((n) => n.id === "node-exec");
  assert.ok(execNode);
  assert.equal(execNode.durationMs, 2);
  assert.equal(execNode.status, "completed");
});

test("Topology: Multiagent mode builds 5 nodes and incorporates breakdown", () => {
  const agentsBreakdown = [
    { agent: "NAVI Planner", duration_ms: 120, tokens: 40, output: "Plan 1" },
    { agent: "NAVI Specialist", duration_ms: 220, tokens: 60, output: "Draft 1" },
    { agent: "NAVI Critic & Synthesizer", duration_ms: 180, tokens: 50, output: "Final" },
  ];
  const topo = buildDynamicTopology(
    "multiagent",
    "Build low latency stream",
    "nvidia/nemotron-3.5-bolt-e4b",
    "trace-test-multi",
    "completed",
    520,
    "Final consensus output",
    12,
    150,
    { agentsBreakdown }
  );

  assert.equal(topo.nodes.length, 5);
  const ag1 = topo.nodes.find((n) => n.id === "node-ag1");
  const ag2 = topo.nodes.find((n) => n.id === "node-ag2");
  const ag3 = topo.nodes.find((n) => n.id === "node-ag3");

  assert.equal(ag1?.durationMs, 120);
  assert.equal(ag2?.durationMs, 220);
  assert.equal(ag3?.durationMs, 180);
});

test("Topology: Compare mode builds 5 nodes with concurrent models", () => {
  const compareA = { model: "nvidia/nemotron-3.5-bolt-e4b", duration_ms: 150, content: "Ans A", usage: { total_tokens: 25 } };
  const compareB = { model: "poolside/laguna-xs-2.1", duration_ms: 110, content: "Ans B", usage: { total_tokens: 22 } };

  const topo = buildDynamicTopology(
    "compare",
    "Compare models",
    "nvidia/nemotron-3.5-bolt-e4b",
    "trace-test-comp",
    "completed",
    150,
    "Side-by-side verdict",
    10,
    47,
    { compareA, compareB, modelB: "poolside/laguna-xs-2.1" }
  );

  assert.equal(topo.nodes.length, 5);
  const nodeA = topo.nodes.find((n) => n.id === "node-modelA");
  const nodeB = topo.nodes.find((n) => n.id === "node-modelB");

  assert.equal(nodeA?.durationMs, 150);
  assert.equal(nodeB?.durationMs, 110);
  // Both share same parentSpanId (concurrent execution from node-in)
  assert.equal(nodeA?.parentSpanId, nodeB?.parentSpanId);
});

test("Topology: Bidirectional step and node ID mapping", () => {
  assert.equal(getMappedNodeId("step-1", "stream"), "node-in");
  assert.equal(getMappedNodeId("step-2", "stream"), "node-tok");
  assert.equal(getMappedNodeId("step-7", "stream"), "node-out");

  assert.equal(getMappedStepId("node-in", "stream"), "step-1");
  assert.equal(getMappedStepId("node-tok", "stream"), "step-2");
  assert.equal(getMappedStepId("node-out", "stream"), "step-7");
});
