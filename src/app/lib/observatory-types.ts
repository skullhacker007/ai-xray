// NAVI — COMPLETE AI EXECUTION OBSERVATORY
// Domain data models & Universal Schema

export type MetricClassification = "ACTUAL" | "CALCULATED" | "ESTIMATED" | "UNAVAILABLE";

export type ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "retrying"
  | "cancelled"
  | "skipped"
  | "idle";

export type NodeType =
  | "input"
  | "gateway"
  | "session"
  | "context"
  | "memory"
  | "retrieval"
  | "tokenizer"
  | "cache"
  | "intelligence"
  | "planner"
  | "router"
  | "agent"
  | "subagent"
  | "provider"
  | "model"
  | "api"
  | "inference"
  | "token_generation"
  | "tool"
  | "validation"
  | "security"
  | "output"
  | "database"
  | "error";

export type SpatialNode = {
  id: string;
  type: NodeType;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  status: ExecutionStatus;
  durationMs: number;
  timestamp: string;
  spanId: string;
  parentSpanId: string | null;
  agentId?: string;
  modelId?: string;

  // Universal Node Inspector Data
  identity: {
    nodeId: string;
    nodeType: NodeType;
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    executionId: string;
    timestamp: string;
  };
  input: {
    data: unknown;
    type: string;
    sizeBytes: number;
    source: string;
    tokenCount?: number;
    classification: MetricClassification;
  };
  operation: {
    name: string;
    details: string;
    configuration?: Record<string, unknown>;
    logicMetadata?: string[];
    dependencies?: string[];
    decisions?: string[];
    classification: MetricClassification;
  };
  output: {
    data: unknown;
    type: string;
    sizeBytes: number;
    tokenCount?: number;
    classification: MetricClassification;
  };
  performance: {
    startTime: string;
    endTime?: string;
    durationMs: number;
    queueTimeMs?: number;
    latencyMs: number;
    classification: MetricClassification;
  };
  resources: {
    agentName?: string;
    modelName?: string;
    providerName?: string;
    tokensIn?: number;
    tokensOut?: number;
    cachedTokens?: number;
    costEstimatedUsd?: number;
    classification: MetricClassification;
  };
  debugging: {
    errorDetails?: string;
    retryCount?: number;
    retryReason?: string;
    logs: string[];
    provenance: MetricClassification;
  };
};

export type SpatialConnection = {
  id: string;
  source: string;
  target: string;
  label?: string;
  dataType: string;
  payloadSummary?: string;
  status: "idle" | "active" | "completed" | "failed";
  bandwidthBytes?: number;
  timestamp?: string;
};

export type TokenSequenceItem = {
  position: number;
  tokenId: number;
  tokenString: string;
  type: "word" | "subword" | "punctuation" | "special";
  classification: "input" | "output";
  timestampMs: number;
  probability?: number;
  topAlternatives?: Array<{ token: string; prob: number }>;
  provenance: MetricClassification;
};

export type ContextWindowLedger = {
  modelCapacity: number;
  reservedOutput: number;
  actualInput: number;
  systemTokens: number;
  developerTokens: number;
  userTokens: number;
  historyTokens: number;
  memoryTokens: number;
  retrievedTokens: number;
  toolResultTokens: number;
  cachedInputTokens: number;
  availableCapacity: number;
  isTruncated: boolean;
};

export type CacheTelemetry = {
  promptCache: { hits: number; misses: number; cachedTokens: number; savingsUsd: number };
  kvCache: { activeSlots: number; maxSlots: number; hbmMemoryKb: number };
  semanticCache: { hits: number; misses: number };
  responseCache: { hits: number; misses: number };
};

export type ExecutionTraceRecord = {
  executionId: string;
  traceId: string;
  title: string;
  scenarioType: "live" | "test_calc" | "test_llm" | "test_tool" | "test_multiagent" | "test_error";
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  totalDurationMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  nodes: SpatialNode[];
  connections: SpatialConnection[];
  tokens: TokenSequenceItem[];
  contextLedger: ContextWindowLedger;
  cacheTelemetry: CacheTelemetry;
  rawInput: string;
  rawOutput: string;
  activeAgents: string[];
  activeModels: string[];
};
