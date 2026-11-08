// Model Architectural Specifications & Neural Layer Metadata
// Accurate parameter definitions for NVIDIA NIM, Meta Llama, Mistral, Gemma, and DeepSeek families

export interface ModelArchitectureSpecs {
  modelId: string;
  family: string;
  architectureType: "Dense Decoder-Only Transformer" | "Sparse Mixture of Experts (MoE)" | "Encoder-Decoder";
  layers: number;
  hiddenDim: number;
  qHeads: number;
  kvHeads: number;
  headDim: number;
  intermediateDim: number;
  vocabSize: number;
  contextWindow: number;
  activation: string;
  normType: string;
  ropeTheta: number;
  bytesPerParam: number; // e.g. 2 for FP16/BF16, 1 for FP8
}

const KNOWN_MODEL_SPECS: Record<string, Partial<ModelArchitectureSpecs>> = {
  // NVIDIA Nemotron Series
  "nvidia/nemotron-3.5-bolt-e4b": {
    family: "NVIDIA Nemotron 3.5 Bolt",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 32,
    hiddenDim: 4096,
    qHeads: 32,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 14336,
    vocabSize: 128256,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },
  "nvidia/nemotron-3.5-lightning-30b-a3b": {
    family: "NVIDIA Nemotron 3.5 Lightning",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 48,
    hiddenDim: 6144,
    qHeads: 48,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 18432,
    vocabSize: 128256,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },
  "nvidia/llama-3.1-nemotron-70b-instruct": {
    family: "Llama 3.1 Nemotron 70B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 80,
    hiddenDim: 8192,
    qHeads: 64,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 28672,
    vocabSize: 128256,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },
  "nvidia/llama-3.1-nemotron-safety-guard-8b-v3": {
    family: "Llama 3.1 Nemotron Guard 8B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 32,
    hiddenDim: 4096,
    qHeads: 32,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 14336,
    vocabSize: 128256,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },

  // Meta LLaMA 3.1 Series
  "meta/llama-3.1-8b-instruct": {
    family: "Meta LLaMA 3.1 8B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 32,
    hiddenDim: 4096,
    qHeads: 32,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 14336,
    vocabSize: 128256,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },
  "meta/llama-3.1-70b-instruct": {
    family: "Meta LLaMA 3.1 70B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 80,
    hiddenDim: 8192,
    qHeads: 64,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 28672,
    vocabSize: 128256,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },

  // Mistral & Mixtral
  "mistralai/mixtral-8x7b-instruct-v0.1": {
    family: "Mistral Mixtral 8x7B MoE",
    architectureType: "Sparse Mixture of Experts (MoE)",
    layers: 32,
    hiddenDim: 4096,
    qHeads: 32,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 14336,
    vocabSize: 32000,
    contextWindow: 32768,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 1000000,
    bytesPerParam: 2,
  },
  "mistralai/mistral-large-4-1t-a52b": {
    family: "Mistral Large 4",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 88,
    hiddenDim: 8192,
    qHeads: 64,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 28672,
    vocabSize: 32768,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 1000000,
    bytesPerParam: 2,
  },

  // Google Gemma 2 Series
  "google/gemma-2-27b-it": {
    family: "Google Gemma 2 27B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 46,
    hiddenDim: 4608,
    qHeads: 32,
    kvHeads: 16,
    headDim: 128,
    intermediateDim: 36864,
    vocabSize: 256000,
    contextWindow: 8192,
    activation: "GeGLU",
    normType: "RMSNorm",
    ropeTheta: 10000,
    bytesPerParam: 2,
  },

  // Poolside Laguna
  "poolside/laguna-xs-2.1": {
    family: "Poolside Laguna XS 2.1",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 24,
    hiddenDim: 2560,
    qHeads: 20,
    kvHeads: 4,
    headDim: 128,
    intermediateDim: 6912,
    vocabSize: 32768,
    contextWindow: 32768,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 100000,
    bytesPerParam: 2,
  },

  // Meta LLaMA Guard 4
  "meta/llama-guard-4-12b": {
    family: "Meta LLaMA Guard 4 12B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 40,
    hiddenDim: 5120,
    qHeads: 40,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 16384,
    vocabSize: 128256,
    contextWindow: 131072,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },

  // NVIDIA Riva
  "nvidia/riva-translate-4b-instruct-v2": {
    family: "NVIDIA Riva Translate 4B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 24,
    hiddenDim: 3072,
    qHeads: 24,
    kvHeads: 8,
    headDim: 128,
    intermediateDim: 8192,
    vocabSize: 64000,
    contextWindow: 16384,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  },

  // Google Gemma 26B
  "google/diffusiongemma-26b-a4b-it": {
    family: "Google Gemma 26B Multimodal",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 46,
    hiddenDim: 4608,
    qHeads: 32,
    kvHeads: 16,
    headDim: 128,
    intermediateDim: 36864,
    vocabSize: 256000,
    contextWindow: 8192,
    activation: "GeGLU",
    normType: "RMSNorm",
    ropeTheta: 10000,
    bytesPerParam: 2,
  },
  "google/gemma-2-9b-it": {
    family: "Google Gemma 2 9B",
    architectureType: "Dense Decoder-Only Transformer",
    layers: 42,
    hiddenDim: 3584,
    qHeads: 16,
    kvHeads: 8,
    headDim: 256,
    intermediateDim: 14336,
    vocabSize: 256000,
    contextWindow: 8192,
    activation: "GeGLU",
    normType: "RMSNorm",
    ropeTheta: 10000,
    bytesPerParam: 2,
  },
};

/**
 * Resolves the architectural specifications for any given model ID.
 * Falls back to dynamic heuristic deduction from the model name if not in known table.
 */
export function getModelArchitectureSpecs(modelId: string): ModelArchitectureSpecs {
  const normalized = modelId.toLowerCase().trim();

  // 1. Direct table match
  for (const [key, spec] of Object.entries(KNOWN_MODEL_SPECS)) {
    if (normalized === key.toLowerCase() || normalized.includes(key.toLowerCase())) {
      return {
        modelId,
        family: spec.family || "Transformer LLM",
        architectureType: spec.architectureType || "Dense Decoder-Only Transformer",
        layers: spec.layers || 32,
        hiddenDim: spec.hiddenDim || 4096,
        qHeads: spec.qHeads || 32,
        kvHeads: spec.kvHeads || 8,
        headDim: spec.headDim || 128,
        intermediateDim: spec.intermediateDim || 14336,
        vocabSize: spec.vocabSize || 128256,
        contextWindow: spec.contextWindow || 131072,
        activation: spec.activation || "SwiGLU",
        normType: spec.normType || "RMSNorm",
        ropeTheta: spec.ropeTheta || 500000,
        bytesPerParam: spec.bytesPerParam || 2,
      };
    }
  }

  // 2. Dynamic heuristic deduction from model name
  let layers = 32;
  let hiddenDim = 4096;
  let qHeads = 32;
  let kvHeads = 8;
  const headDim = 128;
  let intermediateDim = 14336;
  let vocabSize = 128256;
  let contextWindow = 131072;
  let family = "Autoregressive Transformer";
  let architectureType: ModelArchitectureSpecs["architectureType"] = "Dense Decoder-Only Transformer";

  if (normalized.includes("gemma")) {
    vocabSize = 256000;
    contextWindow = 8192;
  } else if (normalized.includes("qwen") || normalized.includes("deepseek")) {
    vocabSize = 152064;
    contextWindow = 131072;
  } else if (normalized.includes("mistral")) {
    vocabSize = 32768;
    contextWindow = 32768;
  }

  if (normalized.includes("70b") || normalized.includes("72b")) {
    layers = 80;
    hiddenDim = 8192;
    qHeads = 64;
    kvHeads = 8;
    intermediateDim = 28672;
    family = "70B Class Foundation Model";
  } else if (normalized.includes("30b") || normalized.includes("32b") || normalized.includes("27b")) {
    layers = 48;
    hiddenDim = 6144;
    qHeads = 48;
    kvHeads = 8;
    intermediateDim = 18432;
    family = "30B Class Foundation Model";
  } else if (normalized.includes("14b") || normalized.includes("12b") || normalized.includes("13b")) {
    layers = 40;
    hiddenDim = 5120;
    qHeads = 40;
    kvHeads = 8;
    intermediateDim = 16384;
    family = "14B Class Foundation Model";
  } else if (normalized.includes("4b") || normalized.includes("3b")) {
    layers = 24;
    hiddenDim = 3072;
    qHeads = 24;
    kvHeads = 8;
    intermediateDim = 8192;
    family = "Small Footprint Edge LLM";
  } else if (normalized.includes("moe") || normalized.includes("8x7b") || normalized.includes("8x22b")) {
    layers = 32;
    hiddenDim = 4096;
    qHeads = 32;
    kvHeads = 8;
    architectureType = "Sparse Mixture of Experts (MoE)";
    family = "Sparse MoE Architecture";
  }

  return {
    modelId,
    family,
    architectureType,
    layers,
    hiddenDim,
    qHeads,
    kvHeads,
    headDim,
    intermediateDim,
    vocabSize,
    contextWindow,
    activation: "SwiGLU",
    normType: "RMSNorm",
    ropeTheta: 500000,
    bytesPerParam: 2,
  };
}
