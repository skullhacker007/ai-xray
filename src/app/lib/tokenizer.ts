// Client & Server shared subword tokenizer and attention calculation

export type SubwordToken = {
  index: number;
  text: string;
  id: number;
  bytes: number[];
  byte_length: number;
  start_offset: number;
  end_offset: number;
  type: "PROPER_NOUN" | "NUMERIC" | "WORD" | "PUNCTUATION";
  embedding_preview: number[];
};

export function tokenizeString(text: string): SubwordToken[] {
  if (!text || text.trim().length === 0) return [];

  // Match words, numbers, punctuation
  const matches = text.match(/[\w]+|[^\s\w]|\s+/g) || [text];
  let currentOffset = 0;

  return matches
    .filter((p) => p.trim().length > 0)
    .map((tokenStr, idx) => {
      // Deterministic BPE-like vocab ID calculation
      let hash = 0;
      for (let i = 0; i < tokenStr.length; i++) {
        hash = (hash << 5) - hash + tokenStr.charCodeAt(i);
        hash |= 0;
      }
      const tokenId = Math.abs(hash % 98000) + 1000;
      const bytes: number[] = [];
      for (let i = 0; i < tokenStr.length; i++) {
        bytes.push(tokenStr.charCodeAt(i));
      }
      const start = currentOffset;
      currentOffset += tokenStr.length;

      // First 5 dimensions of d_model=4096
      const embeddingPreview = [
        Number((Math.sin(tokenId * 0.11) * 0.42).toFixed(3)),
        Number((Math.cos(tokenId * 0.19) * 0.42).toFixed(3)),
        Number((Math.sin(tokenId * 0.29) * 0.42).toFixed(3)),
        Number((Math.cos(tokenId * 0.41) * 0.42).toFixed(3)),
        Number((Math.sin(tokenId * 0.53) * 0.42).toFixed(3)),
      ];

      const type: SubwordToken["type"] = /^[A-Z]/.test(tokenStr)
        ? "PROPER_NOUN"
        : /^[\d]+$/.test(tokenStr)
        ? "NUMERIC"
        : /^[\w]+$/.test(tokenStr)
        ? "WORD"
        : "PUNCTUATION";

      return {
        index: idx,
        text: tokenStr,
        id: tokenId,
        bytes,
        byte_length: bytes.length,
        start_offset: start,
        end_offset: currentOffset,
        type,
        embedding_preview: embeddingPreview,
      };
    });
}

export function computeAttentionScores(tokens: SubwordToken[]): number[][] {
  const n = tokens.length;
  if (n === 0) return [];
  const matrix: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const distance = Math.abs(i - j);
      const affinity = tokens[i].id % 7 === tokens[j].id % 7 ? 0.75 : 0;
      const rawScore = Math.exp(-distance * 0.45 + affinity);
      row.push(rawScore);
      sum += rawScore;
    }
    matrix.push(row.map((v) => Number((v / (sum || 1)).toFixed(3))));
  }
  return matrix;
}

export function computeUnifiedAttention(
  inputTokens: Array<{ text: string; id: number }>,
  outputTokens: Array<{ text: string; id: number }> = []
): { tokens: Array<{ text: string; id: number; isOutput: boolean }>; matrix: number[][] } {
  const allTokens = [
    ...inputTokens.map((t) => ({ ...t, isOutput: false })),
    ...outputTokens.map((t) => ({ ...t, isOutput: true })),
  ];

  const n = Math.min(allTokens.length, 24); // Focus on top 24 tokens for clear rendering
  const sliced = allTokens.slice(0, n);
  const matrix: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    let sum = 0;
    for (let j = 0; j < n; j++) {
      // Causal mask: generated token can only attend to previous tokens
      if (sliced[i].isOutput && j > i) {
        row.push(0);
        continue;
      }
      const distance = Math.abs(i - j);
      const hashA = sliced[i].id;
      const hashB = sliced[j].id;
      const semanticMatch = hashA % 5 === hashB % 5 ? 0.6 : 0;
      const rawScore = Math.exp(-distance * 0.35 + semanticMatch);
      row.push(rawScore);
      sum += rawScore;
    }
    matrix.push(row.map((v) => (sum > 0 ? Number((v / sum).toFixed(3)) : 0)));
  }

  return { tokens: sliced, matrix };
}

export function calculateKVCacheFootprint(
  totalTokens: number,
  numLayers = 32,
  numKVHeads = 8,
  headDim = 128,
  precisionBytes = 2
): {
  totalBytes: number;
  totalKb: number;
  totalMb: number;
  bytesPerToken: number;
  formula: string;
} {
  // Key + Value vectors across all layers
  const bytesPerToken = 2 * numLayers * numKVHeads * headDim * precisionBytes;
  const totalBytes = totalTokens * bytesPerToken;
  const totalKb = totalBytes / 1024;
  const totalMb = totalKb / 1024;

  return {
    totalBytes,
    totalKb: Number(totalKb.toFixed(2)),
    totalMb: Number(totalMb.toFixed(3)),
    bytesPerToken,
    formula: `2 × ${numLayers} layers × ${numKVHeads} KV heads × ${headDim} head dim × ${precisionBytes}B = ${bytesPerToken} bytes/token`,
  };
}
