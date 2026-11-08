import test from "node:test";
import assert from "node:assert/strict";
import {
  tokenizeString,
  computeAttentionScores,
  computeUnifiedAttention,
  calculateKVCacheFootprint,
} from "../../src/app/lib/tokenizer";

test("Tokenizer: handles empty and whitespace-only strings", () => {
  assert.deepEqual(tokenizeString(""), []);
  assert.deepEqual(tokenizeString("   \n\t  "), []);
});

test("Tokenizer: tokenizes text into discrete subwords with metadata", () => {
  const prompt = "Explain AI 2026!";
  const tokens = tokenizeString(prompt);

  assert.ok(tokens.length >= 3);
  assert.equal(tokens[0].text, "Explain");
  assert.equal(tokens[0].type, "PROPER_NOUN");
  assert.ok(tokens[0].id > 0);
  assert.equal(tokens[0].bytes.length, 7);

  // Check numeric token
  const numToken = tokens.find((t) => t.text === "2026");
  assert.ok(numToken);
  assert.equal(numToken.type, "NUMERIC");

  // Check punctuation token
  const punctToken = tokens.find((t) => t.text === "!");
  assert.ok(punctToken);
  assert.equal(punctToken.type, "PUNCTUATION");
});

test("Tokenizer: computeAttentionScores returns valid normalized probabilities", () => {
  const tokens = tokenizeString("Hello neural attention world");
  const matrix = computeAttentionScores(tokens);

  assert.equal(matrix.length, tokens.length);
  for (const row of matrix) {
    assert.equal(row.length, tokens.length);
    const rowSum = row.reduce((sum, v) => sum + v, 0);
    // Row sum should be normalized close to 1.0
    assert.ok(rowSum >= 0.95 && rowSum <= 1.05, `Row sum was ${rowSum}`);
  }
});

test("Tokenizer: computeUnifiedAttention adheres to causal autoregressive mask", () => {
  const inputTokens = [{ text: "Hello", id: 101 }];
  const outputTokens = [
    { text: " world", id: 102 },
    { text: "!", id: 103 },
  ];

  const { tokens, matrix } = computeUnifiedAttention(inputTokens, outputTokens);
  assert.equal(tokens.length, 3);
  assert.equal(matrix.length, 3);

  // Causal check: Output token at index 1 cannot attend to token at index 2
  assert.equal(matrix[1][2], 0, "Causal mask violated: token 1 attended to future token 2");
});

test("Tokenizer: calculateKVCacheFootprint accurately computes VRAM footprint", () => {
  const stats = calculateKVCacheFootprint(100, 32, 8, 128, 2);

  // Formula: 2 * layers * kv_heads * head_dim * bytes_per_param
  // 2 * 32 * 8 * 128 * 2 = 131,072 bytes per token
  assert.equal(stats.bytesPerToken, 131072);
  assert.equal(stats.totalBytes, 131072 * 100);
  assert.equal(stats.totalKb, Number(((131072 * 100) / 1024).toFixed(2)));
  assert.equal(stats.totalMb, Number((((131072 * 100) / 1024) / 1024).toFixed(3)));
  assert.ok(stats.formula.includes("32 layers"));
});
