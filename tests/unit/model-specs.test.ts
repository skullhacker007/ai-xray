import test from "node:test";
import assert from "node:assert/strict";
import { getModelArchitectureSpecs } from "../../src/app/lib/model-specs";

test("Model Specs: Resolves NVIDIA Nemotron 3.5 Bolt correctly", () => {
  const specs = getModelArchitectureSpecs("nvidia/nemotron-3.5-bolt-e4b");
  assert.equal(specs.family, "NVIDIA Nemotron 3.5 Bolt");
  assert.equal(specs.layers, 32);
  assert.equal(specs.hiddenDim, 4096);
  assert.equal(specs.qHeads, 32);
  assert.equal(specs.kvHeads, 8);
  assert.equal(specs.activation, "SwiGLU");
  assert.equal(specs.contextWindow, 131072);
});

test("Model Specs: Resolves Poolside Laguna XS 2.1 accurately", () => {
  const specs = getModelArchitectureSpecs("poolside/laguna-xs-2.1");
  assert.equal(specs.family, "Poolside Laguna XS 2.1");
  assert.equal(specs.layers, 24);
  assert.equal(specs.hiddenDim, 2560);
  assert.equal(specs.contextWindow, 32768);
});

test("Model Specs: Resolves Meta LLaMA 3.1 70B & 8B", () => {
  const specs70b = getModelArchitectureSpecs("meta/llama-3.1-70b-instruct");
  assert.equal(specs70b.layers, 80);
  assert.equal(specs70b.hiddenDim, 8192);
  assert.equal(specs70b.qHeads, 64);

  const specs8b = getModelArchitectureSpecs("meta/llama-3.1-8b-instruct");
  assert.equal(specs8b.layers, 32);
  assert.equal(specs8b.hiddenDim, 4096);
});

test("Model Specs: Resolves MoE architecture correctly", () => {
  const specs = getModelArchitectureSpecs("mistralai/mixtral-8x7b-instruct-v0.1");
  assert.equal(specs.architectureType, "Sparse Mixture of Experts (MoE)");
});

test("Model Specs: Dynamic heuristic fallback for unknown 70B class model", () => {
  const specs = getModelArchitectureSpecs("custom-org/future-model-70b-preview");
  assert.equal(specs.layers, 80);
  assert.equal(specs.hiddenDim, 8192);
  assert.equal(specs.family, "70B Class Foundation Model");
});

test("Model Specs: Dynamic heuristic fallback for unknown Small Edge model", () => {
  const specs = getModelArchitectureSpecs("custom-org/edge-device-4b");
  assert.equal(specs.layers, 24);
  assert.equal(specs.hiddenDim, 3072);
  assert.equal(specs.family, "Small Footprint Edge LLM");
});
