import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NextRequest } from "next/server";

// Load .env.local if present
if (fs.existsSync(".env.local")) {
  const envContent = fs.readFileSync(".env.local", "utf8");
  const lines = envContent.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*['"]?(.*?)['"]?\s*$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
}

import { GET as getModels } from "../../src/app/api/nvidia/models/route";
import { POST as postStream } from "../../src/app/api/nvidia/stream/route";
import { POST as postAgent } from "../../src/app/api/nvidia/agent/route";
import { POST as postCompare } from "../../src/app/api/nvidia/compare/route";
import { POST as postMultiAgent } from "../../src/app/api/nvidia/multiagent/route";
import { POST as postTrace } from "../../src/app/api/nvidia/trace/route";

test("API: GET /api/nvidia/models returns real models catalog", async () => {
  const res = await getModels();
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.models));
  assert.ok(data.count > 0, "Expected at least 1 model from NVIDIA NIM");

  // Check featured model is present
  const bolt = data.models.find((m: { id: string }) => m.id === "nvidia/nemotron-3.5-bolt-e4b");
  assert.ok(bolt, "Featured model nvidia/nemotron-3.5-bolt-e4b should be in models list");
});

test("API: POST /api/nvidia/models rejects missing key with 400", async () => {
  const savedKey = process.env.NVIDIA_API_KEY;
  try {
    delete process.env.NVIDIA_API_KEY;
    const res = await getModels();
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.includes("NVIDIA_API_KEY"));
  } finally {
    process.env.NVIDIA_API_KEY = savedKey;
  }
});

test("API: POST /api/nvidia/stream rejects invalid JSON body with 400", async () => {
  const req = new NextRequest("http://localhost/api/nvidia/stream", {
    method: "POST",
    body: "invalid-json-content",
    headers: { "Content-Type": "application/json" },
  });
  const res = await postStream(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});

test("API: POST /api/nvidia/agent validates and executes safe arithmetic tool", async () => {
  const req = new NextRequest("http://localhost/api/nvidia/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "What is 348 * 29?",
      model: "nvidia/nemotron-3.5-bolt-e4b",
    }),
  });

  const res = await postAgent(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type")?.includes("text/event-stream"), true);

  const reader = res.body?.getReader();
  assert.ok(reader);

  const decoder = new TextDecoder();
  let accumulated = "";
  let receivedInit = false;
  let receivedFinal = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
  }

  const lines = accumulated.split("\n").filter((l) => l.startsWith("data:"));
  for (const line of lines) {
    const payload = JSON.parse(line.replace(/^data:\s*/, ""));
    if (payload.type === "init") receivedInit = true;
    if (payload.type === "final_output") receivedFinal = true;
  }

  assert.ok(receivedInit, "Should have received SSE init event");
  assert.ok(receivedFinal, "Should have received SSE final_output event");
});

test("API: POST /api/nvidia/compare runs parallel comparison", async () => {
  const req = new NextRequest("http://localhost/api/nvidia/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Give 1 key word description of AI.",
      modelA: "nvidia/nemotron-3.5-bolt-e4b",
      modelB: "poolside/laguna-xs-2.1",
    }),
  });

  const res = await postCompare(req);
  assert.equal(res.status, 200);

  const reader = res.body?.getReader();
  assert.ok(reader);

  const decoder = new TextDecoder();
  let accumulated = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
  }

  const lines = accumulated.split("\n").filter((l) => l.startsWith("data:"));
  const doneEvent = lines
    .map((l) => JSON.parse(l.replace(/^data:\s*/, "")))
    .find((e) => e.type === "compare_done");

  assert.ok(doneEvent, "Expected compare_done event");
  assert.ok(doneEvent.resultA, "Expected resultA in compare_done");
  assert.ok(doneEvent.resultB, "Expected resultB in compare_done");
  assert.ok(doneEvent.total_tokens > 0, "Expected positive total_tokens");
});

test("API: POST /api/nvidia/multiagent runs 3-agent pipeline", async () => {
  const req = new NextRequest("http://localhost/api/nvidia/multiagent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "State 1 design rule for microservices.",
      model: "nvidia/nemotron-3.5-bolt-e4b",
    }),
  });

  const res = await postMultiAgent(req);
  assert.equal(res.status, 200);

  const reader = res.body?.getReader();
  assert.ok(reader);

  const decoder = new TextDecoder();
  let accumulated = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
  }

  const lines = accumulated.split("\n").filter((l) => l.startsWith("data:"));
  const events = lines.map((l) => JSON.parse(l.replace(/^data:\s*/, "")));

  const initEvt = events.find((e) => e.type === "init");
  const finalEvt = events.find((e) => e.type === "final_output");

  assert.ok(initEvt, "Expected init event");
  assert.ok(finalEvt, "Expected final_output event");
  assert.ok(finalEvt.breakdown.length === 3, "Expected 3 agents in breakdown");
});

test("API: POST /api/nvidia/trace completes 11-layer forensic trace", async () => {
  const req = new NextRequest("http://localhost/api/nvidia/trace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "What is self-attention?",
      model: "nvidia/nemotron-3.5-bolt-e4b",
    }),
  });

  const res = await postTrace(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.trace_id.startsWith("trace-"));
  assert.equal(data.steps.length, 11, "Trace must have exactly 11 structured execution steps");

  // Verify parent-child relationship invariant across all steps
  const spanSet = new Set(data.steps.map((s: { span_id: string }) => s.span_id));
  spanSet.add(data.root_span_id);

  for (const step of data.steps) {
    if (step.parent_span_id) {
      assert.ok(
        spanSet.has(step.parent_span_id),
        `Step ${step.span_id} has invalid parent_span_id: ${step.parent_span_id}`
      );
    }
  }
});
