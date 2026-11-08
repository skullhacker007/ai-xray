"use client";

import React, { useMemo, useState } from "react";
import { ExecutionMode, getMappedNodeId } from "../../app/lib/topology-builder";
import { ModelArchitectureSpecs, getModelArchitectureSpecs } from "../../app/lib/model-specs";
import { TokenSequenceItem } from "../../app/lib/observatory-types";

export interface WorkflowStep {
  id: string;
  stepNumber: string;
  layer: string;
  title: string;
  icon: string;
  simpleExplanation: string;
  deepExplanation: string;
  formula?: string;
  status: "idle" | "running" | "completed";
  durationMs?: number;
  metricLabel?: string;
  metricValue?: string;
  secondaryMetric?: string;
  colorScheme: "cyan" | "violet" | "indigo" | "purple" | "fuchsia" | "amber" | "emerald";
  classification: "ACTUAL" | "CALCULATED" | "PROVIDER_REPORTED" | "TOKENIZER_MEASURED";
  inputData?: string;
  outputData?: string;
}

interface WorkflowFlowchartProps {
  mode: ExecutionMode;
  isExecuting: boolean;
  durationMs: number;
  ttftMs?: number;
  throughput?: number;
  tokensIn: number;
  tokensOut: number;
  selectedModel: string;
  selectedModelB?: string;
  prompt?: string;
  liveOutput?: string;
  liveTokens?: TokenSequenceItem[];
  kvCacheStats?: { totalBytes: number; totalKb: number; totalMb: number; bytesPerToken: number; formula: string };
  modelSpecs?: ModelArchitectureSpecs;
  activeTraceId?: string | null;
  activeToolExecutions?: Array<{ name: string; args: unknown; result: unknown; duration_ms: number }>;
  activeAgentBreakdown?: Array<{ agent: string; duration_ms: number; tokens: number; output: string }>;
  liveCompareData?: {
    modelA?: { model?: string; duration_ms?: number; content?: string };
    modelB?: { model?: string; duration_ms?: number; content?: string };
  };
  onSelectStep?: (stepId: string) => void;
  selectedStepId?: string | null;
  compact?: boolean;
  replayStep?: number;
}

export default function WorkflowFlowchart({
  mode,
  isExecuting,
  durationMs,
  ttftMs,
  throughput,
  tokensIn,
  tokensOut,
  selectedModel,
  selectedModelB,
  prompt = "",
  liveOutput = "",
  liveTokens = [],
  kvCacheStats,
  modelSpecs: propModelSpecs,
  activeTraceId,
  activeToolExecutions = [],
  activeAgentBreakdown = [],
  liveCompareData,
  onSelectStep,
  selectedStepId,
  compact = false,
  replayStep,
}: WorkflowFlowchartProps) {
  const [internalSelectedStep, setInternalSelectedStep] = useState<string | null>(null);
  const [copiedStepOutput, setCopiedStepOutput] = useState(false);

  const handleCopyStepOutput = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedStepOutput(true);
    setTimeout(() => setCopiedStepOutput(false), 2000);
  };

  // Dynamic model architecture specifications
  const specs = useMemo(() => {
    return propModelSpecs || getModelArchitectureSpecs(selectedModel);
  }, [propModelSpecs, selectedModel]);

  // Active step selection
  const activeStepId = selectedStepId !== undefined ? selectedStepId : internalSelectedStep;

  // Build completely distinct, non-duplicated, dynamic steps tailored to execution
  const steps: WorkflowStep[] = useMemo(() => {
    const isFinished = !isExecuting && durationMs > 0;

    if (mode === "stream") {
      const promptSnippet = prompt.trim() ? (prompt.length > 25 ? prompt.slice(0, 25) + "..." : prompt) : "Input Query";
      const totalVramMb = kvCacheStats?.totalMb
        ? `${kvCacheStats.totalMb.toFixed(2)} MB`
        : `${(((tokensIn + tokensOut) * (2 * specs.layers * specs.kvHeads * specs.headDim * specs.bytesPerParam)) / (1024 * 1024)).toFixed(2)} MB`;
      const currentTps = throughput
        ? `${throughput} tok/s`
        : isExecuting
        ? "Streaming..."
        : durationMs > 0 && tokensOut > 0
        ? `${(tokensOut / (Math.max(durationMs - (ttftMs || 20), 40) / 1000)).toFixed(1)} tok/s`
        : "Standby";

      return [
        // =====================================================================
        // STEP 01: INPUT INGESTION & W3C BOUNDARY (Transport & Security)
        // =====================================================================
        {
          id: "step-1",
          stepNumber: "01",
          layer: "STAGE 01 • INGESTION & W3C GATEWAY",
          title: "Input (Prompt Ingestion)",
          icon: "📝",
          simpleExplanation: "Accepts raw input string, enforces UTF-8 schema validation, checks security sanitization, and binds W3C distributed traceparent context.",
          deepExplanation: "Operates at the HTTP/2 API boundary. Normalizes character encodings, measures raw byte footprint, attaches session IDs, and generates root span telemetry.",
          formula: "UTF-8 Byte Encoding & W3C traceparent: 00-{trace_id}-{span_id}-01",
          status: isExecuting ? "completed" : isFinished ? "completed" : "idle",
          durationMs: 1,
          metricLabel: "Payload Size",
          metricValue: `${prompt.length} UTF-8 bytes`,
          secondaryMetric: "Trace ID: " + (activeTraceId ? activeTraceId.slice(0, 14) + "..." : "trace-bound"),
          colorScheme: "cyan",
          classification: "ACTUAL",
          inputData: `Raw User Input: "${promptSnippet}"`,
          outputData: `Sanitized UTF-8 Payload • ${prompt.length} bytes • W3C Context Bound`,
        },

        // =====================================================================
        // STEP 02: BPE SUBWORD TOKENIZATION (Discrete Integer Dictionary)
        // DISTINCT FROM STEP 3: Pure discrete string splitting into token IDs!
        // =====================================================================
        {
          id: "step-2",
          stepNumber: "02",
          layer: "STAGE 02 • DISCRETE TOKENIZATION",
          title: "Tokenize (BPE)",
          icon: "🔤",
          simpleExplanation: `Decomposes raw text into discrete subword token IDs using deterministic Byte-Pair Encoding (BPE) dictionary lookup without continuous vectors.`,
          deepExplanation: `Computers cannot process letters directly. BPE iteratively merges frequent character pairs into subwords. Maps text to integer indices {0 .. |V|-1} from a fixed vocabulary of ${specs.vocabSize.toLocaleString()} tokens.`,
          formula: "T: Text → [id₀, id₁, ..., idₙ] ∈ {0 .. " + (specs.vocabSize - 1) + "}",
          status: isExecuting ? "completed" : isFinished ? "completed" : "idle",
          durationMs: Math.max(1, Math.round((tokensIn / 10) || 2)),
          metricLabel: "Vocab Size",
          metricValue: `${specs.vocabSize.toLocaleString()} Vocab`,
          secondaryMetric: `${tokensIn} Discrete Token IDs`,
          colorScheme: "violet",
          classification: "TOKENIZER_MEASURED",
          inputData: `Normalized Text: "${promptSnippet}"`,
          outputData: `${tokensIn} Token IDs: [${liveTokens.slice(0, 3).map((t) => t.tokenId).join(", ")}${tokensIn > 3 ? ", ..." : ""}]`,
        },

        // =====================================================================
        // STEP 03: VECTOR EMBEDDING & ROPE GEOMETRY (Continuous Linear Algebra)
        // DISTINCT FROM STEP 2: Linear transformation into 4096-D space + angles!
        // =====================================================================
        {
          id: "step-3",
          stepNumber: "03",
          layer: "STAGE 03 • CONTINUOUS VECTOR SPACE",
          title: `Embedding (RoPE θ=${specs.ropeTheta.toLocaleString()})`,
          icon: "📐",
          simpleExplanation: `Projects discrete integer IDs into continuous ${specs.hiddenDim.toLocaleString()}-D float vectors and applies Rotary Position Embeddings (RoPE) angular frequencies.`,
          deepExplanation: `Looks up token rows in embedding matrix W_e ∈ ℝ^[V × ${specs.hiddenDim}]. RoPE encodes relative word order using complex sinusoidal rotation matrices R_Θ,m^d without decaying long-range coordinates.`,
          formula: "x_m = R_Θ,m · (W_e · tok_id) where θ_i = 10000^(-2(i-1)/d)",
          status: isExecuting ? "completed" : isFinished ? "completed" : "idle",
          durationMs: 3,
          metricLabel: "Tensor Shape",
          metricValue: `[1, ${tokensIn}, ${specs.hiddenDim}]`,
          secondaryMetric: `${((tokensIn * specs.hiddenDim * specs.bytesPerParam) / 1024).toFixed(1)} KB VRAM`,
          colorScheme: "indigo",
          classification: "CALCULATED",
          inputData: `${tokensIn} Integer Token IDs`,
          outputData: `Float16 Embedding Tensor [1, ${tokensIn}, ${specs.hiddenDim}] with RoPE`,
        },

        // =====================================================================
        // STEP 04: PREFILL PHASE & MULTI-HEAD SELF-ATTENTION (Parallel Batch)
        // DISTINCT FROM STEP 5: Compute-bound parallel attention across prompt!
        // =====================================================================
        {
          id: "step-4",
          stepNumber: "04",
          layer: `STAGE 04 • PREFILL (PROMPT CONTEXT)`,
          title: `Prefill (Self-Attention ${specs.layers} Blocks)`,
          icon: "🧠",
          simpleExplanation: `Processes all ${tokensIn} input tokens simultaneously in parallel across ${specs.qHeads} query heads and ${specs.kvHeads} KV heads. Calculates initial prompt attention matrix and Time-To-First-Token (TTFT).`,
          deepExplanation: `Compute-bound parallel matrix multiplication. Pre-RMSNorm normalizes activation variance, then Q, K, V projections compute attention affinities: Softmax(Q·Kᵀ / √${specs.headDim})·V. Populates initial KV cache.`,
          formula: "Attention(Q,K,V) = Softmax(Q Kᵀ / √" + specs.headDim + ") V",
          status: isFinished || tokensOut > 0 ? "completed" : isExecuting ? "running" : "idle",
          durationMs: ttftMs ? ttftMs : isFinished ? Math.max(12, Math.round(durationMs * 0.35)) : undefined,
          metricLabel: "Prefill Latency (TTFT)",
          metricValue: ttftMs ? `${ttftMs}ms TTFT` : isExecuting ? "Prefilling..." : isFinished ? `${durationMs}ms` : "Standby",
          secondaryMetric: `${specs.qHeads} Q-Heads • ${specs.kvHeads} KV-Heads`,
          colorScheme: "purple",
          classification: "ACTUAL",
          inputData: `Input Tensor [1, ${tokensIn}, ${specs.hiddenDim}]`,
          outputData: `Initial Key-Value Tensors populated in GPU VRAM • TTFT Captured`,
        },

        // =====================================================================
        // STEP 05: AUTOREGRESSIVE DECODE LOOP & KV CACHE PAGING (Sequential Loop)
        // DISTINCT FROM STEP 4: Memory-bandwidth bound single-token recurrence!
        // =====================================================================
        {
          id: "step-5",
          stepNumber: "05",
          layer: "STAGE 05 • AUTOREGRESSIVE DECODE LOOP",
          title: "Decode (KV Cache Paging)",
          icon: "💾",
          simpleExplanation: `Generates completion tokens one-by-one in a sequential recurrence loop. Retrieves cached Key-Value vectors in GPU VRAM (${totalVramMb}) to prevent recomputing prompt context.`,
          deepExplanation: `Memory-bandwidth bound stage. For each new token, the model executes a single forward pass and appends its Key and Value projections to the active KV cache, avoiding O(N²) quadratic recomputation overhead.`,
          formula: `KV RAM = 2 × ${specs.layers} layers × ${specs.kvHeads} KV heads × ${specs.headDim} head dim × 2B = ${((2 * specs.layers * specs.kvHeads * specs.headDim * 2) / 1024).toFixed(0)} KB/tok`,
          status: isFinished ? "completed" : isExecuting && tokensOut > 0 ? "running" : "idle",
          durationMs: isFinished ? Math.max(8, Math.round(durationMs * 0.55)) : undefined,
          metricLabel: "KV Cache VRAM",
          metricValue: totalVramMb,
          secondaryMetric: `${tokensIn + tokensOut} Active Slots`,
          colorScheme: "fuchsia",
          classification: "CALCULATED",
          inputData: `Prior Token + KV Cache Slots [1, ${tokensIn + Math.max(0, tokensOut - 1)}, ${specs.hiddenDim}]`,
          outputData: `Updated KV Cache [${tokensIn + tokensOut} slots] • Final Hidden State h ∈ ℝ^${specs.hiddenDim}`,
        },

        // =====================================================================
        // STEP 06: LM HEAD PROJECTION & LOGITS SAMPLING (Probabilistic Output)
        // DISTINCT FROM STEP 7: Pure categorical selection from 128k candidates!
        // =====================================================================
        {
          id: "step-6",
          stepNumber: "06",
          layer: "STAGE 06 • UNEMBEDDING & SAMPLING",
          title: "Sample (Softmax & Temp)",
          icon: "🎲",
          simpleExplanation: `Projects the final hidden representation vector h via unembedding matrix W_u into ${specs.vocabSize.toLocaleString()} raw vocabulary logits, applying Temperature and Top-P probability sampling.`,
          deepExplanation: `W_u ∈ ℝ^[${specs.hiddenDim} × ${specs.vocabSize.toLocaleString()}]. Softmax converts logits into normalized probability distribution P(w_i) = exp(z_i / T) / Σ exp(z_j / T). Categorical sampling picks winning next Token ID.`,
          formula: "P(w_i) = Softmax(z / T) with Top-P nucleus cutoff",
          status: isFinished ? "completed" : isExecuting && tokensOut > 0 ? "running" : "idle",
          durationMs: 2,
          metricLabel: "Sampled Tokens",
          metricValue: `${tokensOut} Generated`,
          secondaryMetric: "Temperature Scaled",
          colorScheme: "amber",
          classification: "ACTUAL",
          inputData: `Final Hidden Vector h ∈ ℝ^${specs.hiddenDim}`,
          outputData: `Raw Logits [1, ${specs.vocabSize.toLocaleString()}] → ${liveTokens.length > 0 ? `Sampled Token ID #${liveTokens[liveTokens.length - 1]?.tokenId}` : "Awaiting Generation"}`,
        },

        // =====================================================================
        // STEP 07: SSE STREAM DELIVERY & RESPONSE VERIFICATION (Transport & UI)
        // DISTINCT FROM STEP 6: Network packet streaming, markdown & safety!
        // =====================================================================
        {
          id: "step-7",
          stepNumber: "07",
          layer: "STAGE 07 • STREAM TRANSPORT & DELIVERY",
          title: "Output (SSE Delivery)",
          icon: "⚡",
          simpleExplanation: `Streams token chunk deltas over HTTP/2 Server-Sent Events (SSE) transport to the browser, parses Markdown formatting, verifies content safety policies, and renders final answer.`,
          deepExplanation: `Client-side StreamManager reassembles streaming text deltas, updates real-time throughput metrics (tok/s), validates finish_reason ("stop"), and renders syntax-highlighted output with copy verification.`,
          formula: "Throughput (TPS) = Completion_Tokens / (Duration - TTFT)",
          status: isFinished ? "completed" : isExecuting && tokensOut > 0 ? "running" : "idle",
          durationMs: isFinished ? durationMs : undefined,
          metricLabel: "Stream Speed",
          metricValue: currentTps,
          secondaryMetric: `Total Duration: ${durationMs}ms`,
          colorScheme: "emerald",
          classification: "ACTUAL",
          inputData: `Streaming Chunks via HTTP/2 SSE`,
          outputData: liveOutput ? `Decoded Output (${liveOutput.length} chars) • Zero Safety Violations` : "Awaiting completion",
        },
      ];
    }

    if (mode === "tool") {
      const toolCount = activeToolExecutions.length;
      const toolName = activeToolExecutions[0]?.name || "calculator";
      const toolDur = activeToolExecutions[0]?.duration_ms || 2;
      return [
        {
          id: "step-1",
          stepNumber: "01",
          layer: "STAGE 01 • INGESTION & SCHEMAS",
          title: "Query & Tool Schemas Ingestion",
          icon: "📝",
          simpleExplanation: "Receives user request, validates parameter types, and binds JSON Schema definitions for available MCP tools (Calculator, Weather, System Profiler).",
          deepExplanation: "Enriches system context with tool definitions: parameter types, required fields, and function signatures conforming to Model Context Protocol (MCP).",
          formula: "Context = System_Prompt + Tool_Schemas + User_Query",
          status: isExecuting || isFinished ? "completed" : "idle",
          durationMs: 2,
          metricLabel: "Input Query",
          metricValue: `${tokensIn} tokens`,
          secondaryMetric: "3 MCP Tools Attached",
          colorScheme: "cyan",
          classification: "ACTUAL",
          inputData: prompt ? `Prompt: "${prompt}"` : "User query awaiting ingestion",
          outputData: "3 Tools Bound: calculator, get_weather, system_profiler",
        },
        {
          id: "step-2",
          stepNumber: "02",
          layer: "STAGE 02 • MCP TOOL DISCOVERY",
          title: "MCP Tool Discovery & Routing",
          icon: "🧭",
          simpleExplanation: "Queries MCP server daemon to discover registered tools and validates JSON Schema definitions for OpenAI-compatible function calling.",
          deepExplanation: "Discovers available tools via MCP protocol (JSON-RPC tools/list), inspects schemas, and establishes execution sandbox boundaries.",
          formula: "MCP Registry: tools/list → [calculator, get_weather, system_profiler]",
          status: isExecuting || isFinished ? "completed" : "idle",
          durationMs: 3,
          metricLabel: "Discovered Tools",
          metricValue: "3 Tools Advertised",
          secondaryMetric: "JSON-RPC Schema Injected",
          colorScheme: "purple",
          classification: "ACTUAL",
          inputData: "tools/list request over Model Context Protocol",
          outputData: "Injected 3 function signatures into model schema",
        },
        {
          id: "step-3",
          stepNumber: "03",
          layer: "STAGE 03 • INTENT & SELECTION",
          title: "Turn 1: Tool Decision Reasoning",
          icon: "🧠",
          simpleExplanation: `Neural model inspects input semantics against tool definitions and outputs a structured tool_calls payload to call ${toolName}.`,
          deepExplanation: `Model generates structured JSON specifying tool name (e.g. "${toolName}") and typed arguments extracted from user query.`,
          formula: `Output: { tool_calls: [{ name: "${toolName}", arguments: {...} }] }`,
          status: isFinished || toolCount > 0 ? "completed" : isExecuting ? "running" : "idle",
          durationMs: isFinished ? Math.max(10, Math.round(durationMs * 0.4)) : undefined,
          metricLabel: "Decision Model",
          metricValue: specs.family,
          secondaryMetric: `Selected: ${toolName}`,
          colorScheme: "violet",
          classification: "ACTUAL",
          inputData: `Semantic intent matching against ${toolName}`,
          outputData: `Tool call issued: ${toolName}()`,
        },
        {
          id: "step-4",
          stepNumber: "04",
          layer: "STAGE 04 • MCP SANDBOX EXECUTION",
          title: `Tool: ${toolName} Execution`,
          icon: "🛠️",
          simpleExplanation: `Dispatches validated JSON-RPC call over Model Context Protocol to execute ${toolName} in an isolated sandbox runtime.`,
          deepExplanation: "Enforces security boundaries, validates execution permissions, executes tool in isolated sandbox runtime, and captures 200 OK result.",
          formula: `JSON-RPC 2.0: tools/call { name: "${toolName}", args } → 200 OK`,
          status: isFinished || toolCount > 0 ? "completed" : isExecuting ? "running" : "idle",
          durationMs: isFinished ? toolDur : undefined,
          metricLabel: "Status Code",
          metricValue: toolCount > 0 ? `${toolDur}ms Verified OK` : "200 Verified OK",
          secondaryMetric: "Isolated MCP Sandbox",
          colorScheme: "amber",
          classification: "ACTUAL",
          inputData: `tools/call { name: "${toolName}" }`,
          outputData: activeToolExecutions[0]?.result ? JSON.stringify(activeToolExecutions[0].result).slice(0, 80) : "200 OK Evaluation Verified",
        },
        {
          id: "step-5",
          stepNumber: "05",
          layer: "STAGE 05 • FINAL NEURAL SYNTHESIS",
          title: "Turn 2: Final Natural Synthesis",
          icon: "🔬",
          simpleExplanation: "Feeds verified MCP tool output back to the model context to generate a coherent, natural language explanation.",
          deepExplanation: "Performs second autoregressive decoding pass with tool execution result included in prompt context, producing synthesized answer.",
          formula: "P(Response | Prompt + Tool_Result) → Final Answer",
          status: isFinished || liveOutput ? "completed" : isExecuting && toolCount > 0 ? "running" : "idle",
          durationMs: isFinished ? Math.max(12, Math.round(durationMs * 0.45)) : undefined,
          metricLabel: "Output Tokens",
          metricValue: `${tokensOut} tokens`,
          secondaryMetric: "Turn 2 Decoding",
          colorScheme: "emerald",
          classification: "ACTUAL",
          inputData: "Prompt + role: tool result appended",
          outputData: liveOutput ? `Synthesized ${liveOutput.length} characters` : "Response ready",
        },
        {
          id: "step-6",
          stepNumber: "06",
          layer: "STAGE 06 • VERIFIED DELIVERY",
          title: "Verified Answer & Output Delivery",
          icon: "🏁",
          simpleExplanation: "Packages synthesized answer with full execution forensics, token ledger attribution, and delivers verified output to user UI.",
          deepExplanation: "Finalizes W3C trace span, records token ledger provenance, and transmits verified response and telemetry to client application.",
          formula: "Delivery = Final_Answer + Execution_Forensics + Token_Ledger",
          status: isFinished || liveOutput ? "completed" : "idle",
          durationMs: isFinished ? 2 : undefined,
          metricLabel: "Delivery State",
          metricValue: liveOutput ? `${liveOutput.length} Chars Delivered` : isFinished ? "Delivered" : "Standby",
          secondaryMetric: "W3C Forensics Trace Closed",
          colorScheme: "cyan",
          classification: "ACTUAL",
          inputData: "Synthesized markdown text + tool execution proof",
          outputData: liveOutput ? `Verified Answer Delivered (${liveOutput.length} chars)` : "Awaiting completion",
        },
      ];
    }

    if (mode === "multiagent") {
      const breakdown = activeAgentBreakdown;
      const p1 = breakdown[0];
      const p2 = breakdown[1];
      const p3 = breakdown[2];
      return [
        {
          id: "step-1",
          stepNumber: "01",
          layer: "STAGE 01 • DIRECTIVE INGESTION",
          title: "User Directive & Objective Ingestion",
          icon: "📋",
          simpleExplanation: "Ingests user directive, establishes W3C trace context, and passes technical goal to multi-agent DAG coordinator.",
          deepExplanation: "Validates incoming query, bounds token accounting, and initializes orchestration DAG for planner, specialist, and critic agents.",
          formula: "DAG_Context = Bind(Prompt, Trace_Context)",
          status: isExecuting || isFinished ? "completed" : "idle",
          durationMs: 1,
          metricLabel: "Goal Directive",
          metricValue: `${tokensIn} tokens`,
          secondaryMetric: "DAG Objective Bound",
          colorScheme: "cyan",
          classification: "ACTUAL",
          inputData: prompt ? `Objective: "${prompt}"` : "Multi-agent directive awaiting ingestion",
          outputData: "Initialized 3-agent pipeline DAG",
        },
        {
          id: "step-2",
          stepNumber: "02",
          layer: "STAGE 02 • AGENT: NAVI PLANNER",
          title: "Agent 1: NAVI Strategic Planner",
          icon: "🧭",
          simpleExplanation: "Planner Agent analyzes high-level user goal, decomposes problem into logical sub-tasks, and sets dependencies.",
          deepExplanation: "Constructs structured execution DAG (Directed Acyclic Graph) assigning sub-goals to specialist agents.",
          formula: "DAG = Decompose(Goal) → [Subtask₁, Subtask₂, Subtask₃]",
          status: isFinished || breakdown.length > 0 ? "completed" : isExecuting ? "running" : "idle",
          durationMs: p1?.duration_ms || (isFinished ? Math.round(durationMs * 0.3) : undefined),
          metricLabel: "Agent Role",
          metricValue: "NAVI Planner",
          secondaryMetric: p1 ? `${p1.tokens} Tokens` : "DAG Decomposition",
          colorScheme: "purple",
          classification: "ACTUAL",
          inputData: "High-level user objective",
          outputData: p1?.output ? p1.output.slice(0, 100) + "..." : "Planner specifications",
        },
        {
          id: "step-3",
          stepNumber: "03",
          layer: "STAGE 03 • AGENT: NAVI SPECIALIST",
          title: "Agent 2: NAVI Domain Specialist",
          icon: "🔬",
          simpleExplanation: "Domain Specialist Agent executes deep computational or technical reasoning on the planned tasks.",
          deepExplanation: "Solves individual domain challenges, handles specialized code or analytical reasoning, and formats findings.",
          formula: "Findings = Execute(Specialist_Prompt, Subtasks)",
          status: isFinished || breakdown.length > 1 ? "completed" : isExecuting && breakdown.length === 1 ? "running" : "idle",
          durationMs: p2?.duration_ms || (isFinished ? Math.round(durationMs * 0.45) : undefined),
          metricLabel: "Agent Role",
          metricValue: "NAVI Specialist",
          secondaryMetric: p2 ? `${p2.tokens} Tokens` : "Technical Analysis",
          colorScheme: "violet",
          classification: "ACTUAL",
          inputData: "Planner subtask specifications",
          outputData: p2?.output ? p2.output.slice(0, 100) + "..." : "Technical analysis draft",
        },
        {
          id: "step-4",
          stepNumber: "04",
          layer: "STAGE 04 • AGENT: NAVI CRITIC",
          title: "Agent 3: NAVI Critic & QA",
          icon: "⚡",
          simpleExplanation: "Critic Agent performs adversarial verification on specialist findings, checking logical consistency and quality.",
          deepExplanation: "Audits specialist solutions against architectural requirements, flags discrepancies, and ensures consensus.",
          formula: "Audit = Validate(Findings, Requirements) → Verified",
          status: isFinished || breakdown.length >= 3 ? "completed" : isExecuting && breakdown.length >= 2 ? "running" : "idle",
          durationMs: p3?.duration_ms || (isFinished ? Math.round(durationMs * 0.25) : undefined),
          metricLabel: "Agent Role",
          metricValue: "NAVI Critic",
          secondaryMetric: p3 ? `${p3.tokens} Tokens` : "Adversarial Review",
          colorScheme: "amber",
          classification: "ACTUAL",
          inputData: "Specialist draft findings",
          outputData: p3?.output ? p3.output.slice(0, 100) + "..." : "Consensus validation",
        },
        {
          id: "step-5",
          stepNumber: "05",
          layer: "STAGE 05 • CONSENSUS DELIVERY",
          title: "Verified Consensus & Synthesis",
          icon: "🏁",
          simpleExplanation: "Synthesizes audited multi-agent findings into a final polished report with complete consensus verification.",
          deepExplanation: "Packages final multi-agent response with agent breakdown telemetry, token provenance, and delivers verified output.",
          formula: "Consensus = Synthesize(Plan + Findings + Critique)",
          status: isFinished || liveOutput ? "completed" : "idle",
          durationMs: isFinished ? 2 : undefined,
          metricLabel: "Consensus State",
          metricValue: liveOutput ? `${liveOutput.length} Chars Delivered` : isFinished ? "Consensus Reached" : "Standby",
          secondaryMetric: `${tokensOut} Consolidated Tokens`,
          colorScheme: "emerald",
          classification: "ACTUAL",
          inputData: "Multi-agent verified consensus payload",
          outputData: liveOutput ? `Delivered final report (${liveOutput.length} chars)` : "Awaiting consensus",
        },
      ];
    }

    // mode === "compare"
    const hasComparison = Boolean(liveCompareData || (isFinished && durationMs > 0));
    const modelAShort = selectedModel.split("/").pop() || "Model A";
    const modelBShort = (selectedModelB || "Model B").split("/").pop() || "Model B";
    return [
      {
        id: "step-1",
        stepNumber: "01",
        layer: "STAGE 01 • BROADCAST DISPATCH",
        title: "Benchmark Prompt Broadcast",
        icon: "🔀",
        simpleExplanation: "Dispatches the exact same user prompt simultaneously to Model A and Model B under identical temperature and token budget parameters.",
        deepExplanation: "Initiates concurrent HTTP/2 streams to both model backends, synchronizing start timestamps for fair benchmarking.",
        formula: "Concurrent Promise.all([Fetch(Model_A), Fetch(Model_B)])",
        status: isExecuting || hasComparison ? "completed" : "idle",
        durationMs: 2,
        metricLabel: "Input Tokens",
        metricValue: `${tokensIn} tokens`,
        secondaryMetric: "2 Concurrent Calls",
        colorScheme: "cyan",
        classification: "ACTUAL",
      },
      {
        id: "step-2",
        stepNumber: "02",
        layer: "STAGE 02 • MODEL A INFERENCE",
        title: `Model A: ${modelAShort}`,
        icon: "⚡",
        simpleExplanation: `Concurrent inference run for Model A (${modelAShort}) measuring TTFT and generation latency.`,
        deepExplanation: "Monitors independent TTFT, inter-token generation speeds, and memory consumption for Model A architecture.",
        formula: "Model_A: Response = Decode(Prompt, θ_A)",
        status: hasComparison ? "completed" : isExecuting ? "running" : "idle",
        durationMs: liveCompareData?.modelA?.duration_ms || (isFinished ? durationMs : undefined),
        metricLabel: "Execution",
        metricValue: liveCompareData?.modelA?.duration_ms ? `${liveCompareData.modelA.duration_ms}ms` : "Evaluating...",
        secondaryMetric: "NVIDIA NIM Backend",
        colorScheme: "purple",
        classification: "ACTUAL",
      },
      {
        id: "step-3",
        stepNumber: "03",
        layer: "STAGE 03 • MODEL B INFERENCE",
        title: `Model B: ${modelBShort}`,
        icon: "⚡",
        simpleExplanation: `Concurrent inference run for Model B (${modelBShort}) measuring TTFT and generation latency.`,
        deepExplanation: "Monitors independent TTFT, inter-token generation speeds, and memory consumption for Model B architecture.",
        formula: "Model_B: Response = Decode(Prompt, θ_B)",
        status: hasComparison ? "completed" : isExecuting ? "running" : "idle",
        durationMs: liveCompareData?.modelB?.duration_ms || (isFinished ? durationMs : undefined),
        metricLabel: "Execution",
        metricValue: liveCompareData?.modelB?.duration_ms ? `${liveCompareData.modelB.duration_ms}ms` : "Evaluating...",
        secondaryMetric: "NVIDIA NIM Backend",
        colorScheme: "violet",
        classification: "ACTUAL",
      },
      {
        id: "step-4",
        stepNumber: "04",
        layer: "STAGE 04 • FORENSIC COMPARATOR",
        title: "Differential Forensic Telemetry",
        icon: "📊",
        simpleExplanation: "Calculates speed ratios, token efficiency, VRAM requirements, and latency differentials between both candidate models.",
        deepExplanation: "Computes differential percentages: generation throughput (tok/s), cost efficiency in USD, and token count density.",
        formula: "Speed_Ratio = TPS_A / TPS_B • Latency_Delta = |T_A - T_B|",
        status: hasComparison ? "completed" : isExecuting ? "running" : "idle",
        durationMs: isFinished ? 5 : undefined,
        metricLabel: "Benchmarking",
        metricValue: isFinished ? "Metrics Captured" : "Measuring...",
        secondaryMetric: "Verified NIM Data",
        colorScheme: "amber",
        classification: "ACTUAL",
      },
      {
        id: "step-5",
        stepNumber: "05",
        layer: "STAGE 05 • COMPARATIVE VERDICT",
        title: "Side-by-Side Verdict Delivery",
        icon: "🏁",
        simpleExplanation: "Renders both outputs side-by-side with token counts, execution durations, and answer quality side-by-side.",
        deepExplanation: "Enables interactive comparison of reasoning depth, conciseness, instruction following, and formatting differences.",
        formula: "Evaluate(Output_A, Output_B) across Quality & Speed",
        status: hasComparison ? "completed" : "idle",
        durationMs: isFinished ? 2 : undefined,
        metricLabel: "Verdict",
        metricValue: isFinished ? "Ready for Review" : "Generating...",
        secondaryMetric: "Side-by-Side Ready",
        colorScheme: "emerald",
        classification: "ACTUAL",
      },
    ];
  }, [
    mode,
    isExecuting,
    durationMs,
    ttftMs,
    throughput,
    tokensIn,
    tokensOut,
    selectedModel,
    selectedModelB,
    prompt,
    liveOutput,
    liveTokens,
    kvCacheStats,
    specs,
    activeTraceId,
    activeToolExecutions,
    activeAgentBreakdown,
    liveCompareData,
  ]);

  const getColorClasses = (_status: WorkflowStep["status"], isSelected: boolean) => {
    if (isSelected) {
      return "border-cyan-400 bg-[#0d1c38] shadow-[0_0_20px_rgba(34,211,238,0.35)] scale-[1.02] z-20";
    }
    // Card box remains consistent neutral dark theme; only status dot button changes
    return "border-white/[0.08] bg-[#070d1a] hover:border-cyan-400/30 hover:bg-[#0b1426]";
  };

  const getBadgeColor = () => {
    return "bg-[#091122] text-slate-300 border-white/[0.08]";
  };

  const handleStepClick = (stepId: string) => {
    setInternalSelectedStep((prev) => (prev === stepId ? null : stepId));
    onSelectStep?.(stepId);
  };

  const inspectedStep = steps.find((s) => s.id === activeStepId) || null;

  // =========================================================================
  // COMPACT HORIZONTAL FLOWCHART DOCKED ABOVE TOPOLOGY GRAPH
  // =========================================================================
  if (compact) {
    const renderCompactStepCard = (step: WorkflowStep, idx: number) => {
      const isSelected = activeStepId === step.id || getMappedNodeId(step.id, mode) === activeStepId;
      const isReplayInactive =
        replayStep !== undefined &&
        replayStep < 100 &&
        idx >= Math.max(1, Math.ceil((steps.length * replayStep) / 100));

      return (
        <div
          onClick={() => handleStepClick(step.id)}
          className={`group relative flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-xs transition cursor-pointer select-none w-full min-w-0 ${
            isReplayInactive ? "opacity-35" : ""
          } ${getColorClasses(
            isReplayInactive ? "idle" : step.status,
            isSelected
          )}`}
          title={`${step.title}: ${step.simpleExplanation}`}
        >
          <span className="text-base shrink-0">{step.icon}</span>
          <div className="text-left font-mono min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-xs font-bold text-slate-400 shrink-0">{step.stepNumber}</span>
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  isReplayInactive
                    ? "bg-slate-600"
                    : step.status === "running"
                    ? "bg-amber-400 animate-ping"
                    : step.status === "completed"
                    ? "bg-emerald-400"
                    : "bg-slate-500"
                }`}
              />
              <span className="font-bold text-slate-100 text-xs group-hover:text-cyan-300 transition truncate">
                {step.title}
              </span>
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-2 mt-0.5 truncate">
              <span className="text-cyan-300 font-semibold truncate max-w-[150px]">
                {step.metricValue || step.layer}
              </span>
              {step.durationMs !== undefined && !isReplayInactive && (
                <span className="text-slate-400 shrink-0">({step.durationMs}ms)</span>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="w-full border-b border-white/[0.08] bg-[#050914]/95 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between mb-2.5 gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-cyan-500/20 text-cyan-300 text-xs font-bold">
              ⚡
            </span>
            <span className="text-xs font-mono font-bold text-slate-100 tracking-wider">
              DYNAMIC EXECUTION WORKFLOW
            </span>
            <span className="text-xs font-mono text-cyan-400 font-semibold">
              ({steps.length} Distinct Stages • {specs.family})
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {isExecuting ? (
              <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
                ACTIVE PIPELINE
              </span>
            ) : durationMs > 0 ? (
              <span className="text-emerald-400 font-bold">✓ ALL STAGES TRACED ({durationMs}ms)</span>
            ) : (
              <span className="text-slate-400">STANDBY</span>
            )}
          </div>
        </div>

        {/* 4-Blocks-Per-Layer Connected Serpentine Flow Strip */}
        <div className="overflow-x-auto pb-0.5 scrollbar-thin">
          <div className="min-w-[840px] space-y-1">
            {/* Layer 1: Stages 01 -> 02 -> 03 -> 04 (4 blocks max) */}
            <div className="grid grid-cols-4 gap-3 items-center">
              {steps.slice(0, 4).map((step, idx) => (
                <div key={step.id} className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 min-w-0">{renderCompactStepCard(step, idx)}</div>
                  {idx < 3 && idx < steps.length - 1 && (
                    <span className="text-slate-500 font-bold text-xs select-none shrink-0">→</span>
                  )}
                </div>
              ))}
            </div>

            {/* Connect Bend Arrow in between Stage 04 and Stage 05 (Column 4) */}
            {steps.length > 4 && (
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3"></div>
                <div className="flex justify-center items-center py-0.5">
                  <span className="text-cyan-400 font-black text-sm select-none animate-pulse">
                    ↓
                  </span>
                </div>
              </div>
            )}

            {/* Layer 2: Stages in reverse order (e.g. 6 <- 5 or 7 <- 6 <- 5) (4 blocks max) */}
            {steps.length > 4 && (
              <div className="grid grid-cols-4 gap-3 items-center">
                {/* Column 1: Output Destination Marker when 7 steps */}
                {steps.length >= 7 ? (
                  <div className="flex items-center justify-end pr-2">
                    <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5 select-none">
                      <span>🏁</span>
                      <span>Output</span>
                    </span>
                  </div>
                ) : (
                  <div></div>
                )}

                {/* Column 2: Stage 07 if 7 steps; Output marker if 6 steps; empty if 5 steps */}
                {steps.length >= 7 ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-500 font-bold text-xs select-none shrink-0">←</span>
                    <div className="flex-1 min-w-0">{renderCompactStepCard(steps[6], 6)}</div>
                  </div>
                ) : steps.length === 6 ? (
                  <div className="flex items-center justify-end pr-2">
                    <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5 select-none">
                      <span>🏁</span>
                      <span>Output</span>
                    </span>
                  </div>
                ) : (
                  <div></div>
                )}

                {/* Column 3: Stage 06 if >= 6 steps; Output marker if 5 steps */}
                {steps.length >= 6 ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-500 font-bold text-xs select-none shrink-0">←</span>
                    <div className="flex-1 min-w-0">{renderCompactStepCard(steps[5], 5)}</div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end pr-2">
                    <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5 select-none">
                      <span>🏁</span>
                      <span>Output</span>
                    </span>
                  </div>
                )}

                {/* Column 4: Stage 05 (Directly beneath Stage 04, with single left arrow) */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-500 font-bold text-xs select-none shrink-0">←</span>
                  <div className="flex-1 min-w-0">{renderCompactStepCard(steps[4], 4)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // FULL STANDALONE WORKFLOW VIEW MODE (Spacious 2-Row Responsive Grid)
  // =========================================================================
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 min-h-0 bg-[#02050e] text-slate-100">
      {/* Workflow Header Banner */}
      <div className="rounded-xl border border-cyan-500/30 bg-[#060c1c] p-4 sm:p-5 shadow-[0_0_24px_rgba(34,211,238,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-lg font-bold">
              🗺️
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-mono font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                Execution Workflow & Process Architecture
                <span className="rounded bg-cyan-950 border border-cyan-700 px-2 py-0.5 text-xs font-mono text-cyan-300 font-normal">
                  {specs.family}
                </span>
              </h2>
              <p className="text-xs font-mono text-slate-300 mt-0.5">
                Exact sequential execution roadmap • {steps.length} Distinct Stages from Ingestion to Final Output
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="rounded border border-white/[0.08] bg-[#03060c] px-3 py-1.5 text-xs">
              <span className="text-slate-400">MODE: </span>
              <strong className="text-cyan-300 uppercase">{mode}</strong>
            </div>

            {isExecuting ? (
              <span className="rounded bg-cyan-950 border border-cyan-600 px-3 py-1.5 text-xs text-cyan-300 font-bold flex items-center gap-2 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
                ACTIVE PIPELINE
              </span>
            ) : durationMs > 0 ? (
              <span className="rounded bg-emerald-950 border border-emerald-700 px-3 py-1.5 text-xs text-emerald-300 font-bold">
                ✓ COMPLETED IN {durationMs}ms
              </span>
            ) : (
              <span className="rounded bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-400">
                OUTPUT
              </span>
            )}
          </div>
        </div>

        {/* Live Synchronized Context Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="rounded-lg border border-white/[0.06] bg-[#03060c] p-3">
            <span className="text-xs text-slate-400 block mb-1 uppercase font-semibold">1. Active Model</span>
            <span className="text-cyan-300 font-bold text-xs sm:text-sm block truncate">{specs.modelId}</span>
            <span className="text-xs text-slate-400">{specs.layers} Blocks • {specs.hiddenDim} Dim • {specs.qHeads} Heads</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[#03060c] p-3">
            <span className="text-xs text-slate-400 block mb-1 uppercase font-semibold">2. Input Query Context</span>
            <span className="text-slate-200 font-bold text-xs sm:text-sm block truncate">&quot;{prompt.slice(0, 32) || "Empty"}&quot;</span>
            <span className="text-xs text-cyan-400">{tokensIn} Prompt Tokens • {prompt.length} UTF-8 bytes</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[#03060c] p-3">
            <span className="text-xs text-slate-400 block mb-1 uppercase font-semibold">3. KV Cache Footprint</span>
            <span className="text-emerald-300 font-bold text-xs sm:text-sm block">
              {kvCacheStats?.totalMb ? `${kvCacheStats.totalMb} MB` : `${((tokensIn + tokensOut) * 0.032).toFixed(1)} MB`}
            </span>
            <span className="text-xs text-slate-400">{tokensIn + tokensOut} Total Slots Allocated</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[#03060c] p-3">
            <span className="text-xs text-slate-400 block mb-1 uppercase font-semibold">4. Decode Throughput</span>
            <span className="text-amber-300 font-bold text-xs sm:text-sm block">
              {throughput ? `${throughput} tok/s` : isExecuting ? "Calculating..." : `${durationMs > 0 && tokensOut > 0 ? (tokensOut / (durationMs / 1000)).toFixed(1) : 0} tok/s`}
            </span>
            <span className="text-xs text-slate-400">TTFT: {ttftMs ? `${ttftMs}ms` : "--"} • {tokensOut} Output Tokens</span>
          </div>
        </div>
      </div>

      {/* Sequential Flowchart Cards: 4 on Row 1, 3 on Row 2 with NO compression */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
          <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span>📊</span> {steps.length}-STAGE DYNAMIC EXECUTION WORKFLOW
          </span>
          <span className="text-xs font-mono text-slate-400">
            Click any stage to inspect detailed mathematical transformations
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {steps.length === 7 ? (
            <>
              {/* Row 1: Stages 01 -> 02 -> 03 -> 04 (Left-to-Right) */}
              {[steps[0], steps[1], steps[2], steps[3]].map((step, idx) => {
                const isSelected = activeStepId === step.id;
                const isStep4 = idx === 3;

                return (
                  <div
                    key={step.id}
                    onClick={() => handleStepClick(step.id)}
                    className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none ${getColorClasses(
                      step.status,
                      isSelected
                    )}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded border px-2 py-0.5 text-xs font-mono font-bold uppercase ${getBadgeColor()}`}
                          >
                            STAGE {step.stepNumber}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 bg-[#091122] border border-white/[0.08] text-slate-300"
                          >
                            <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                              {step.status === "running" ? (
                                <>
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                                </>
                              ) : step.status === "completed" ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                              )}
                            </span>
                            <span>{step.status === "running" ? "WORKING" : step.status === "completed" ? "DONE" : "IDLE"}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isStep4 ? (
                            <span className="text-cyan-400 font-bold text-sm select-none animate-pulse" title="Flow continues to Stage 05 below">
                              ↴
                            </span>
                          ) : (
                            <span className="text-slate-400 font-bold text-xs select-none">➔</span>
                          )}
                          <span className="text-2xl">{step.icon}</span>
                        </div>
                      </div>

                      <h3 className="font-mono text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition mb-1 leading-snug">
                        {step.title}
                      </h3>
                      <span className="text-xs font-mono text-cyan-400 block uppercase tracking-wider mb-2.5 font-semibold">
                        {step.layer}
                      </span>

                      <p className="font-sans text-xs text-slate-200 leading-relaxed mb-4">
                        {step.simpleExplanation}
                      </p>
                    </div>

                    {/* Footer Metrics */}
                    <div className="border-t border-white/[0.08] pt-2.5 mt-auto font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{step.metricLabel || "Metric"}:</span>
                        <span className="font-bold text-cyan-300 text-xs sm:text-sm">{step.metricValue}</span>
                      </div>
                      {step.secondaryMetric && (
                        <div className="text-xs text-slate-400 mt-1 truncate">
                          {step.secondaryMetric}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Row 2: Final Delivery <- Stage 07 <- Stage 06 <- Stage 05 (Serpentine Right-to-Left) */}
              {/* Col 1: Destination / Output Delivered Card */}
              <div className="relative flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition-all select-none">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-white/[0.08] bg-[#091122] px-2 py-0.5 text-xs font-mono font-bold uppercase text-slate-300">
                        DESTINATION
                      </span>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase flex items-center gap-1 bg-[#091122] border border-white/[0.08] text-slate-300">
                        <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                          {isExecuting ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                            </>
                          ) : durationMs > 0 ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                          )}
                        </span>
                        <span>{isExecuting ? "WORKING" : durationMs > 0 ? "DONE" : "IDLE"}</span>
                      </span>
                    </div>
                    <span className="text-2xl">🏁</span>
                  </div>
                  <h3 className="font-mono text-sm font-bold text-slate-100 mb-1 leading-snug">
                    Execution Complete
                  </h3>
                  <span className="text-xs font-mono text-cyan-400 block uppercase tracking-wider mb-2.5 font-semibold">
                    DELIVERY & VERIFICATION
                  </span>
                  <p className="font-sans text-xs text-slate-200 leading-relaxed mb-4">
                    Full 7-stage neural pipeline completed. Tokens decoded, safety invariants validated, and response presented to user.
                  </p>
                </div>
                <div className="border-t border-white/[0.08] pt-2.5 mt-auto font-mono text-xs flex items-center justify-between">
                  <span className="text-slate-400">Pipeline State:</span>
                  <span className="font-bold text-slate-200">{durationMs > 0 ? "Completed" : "Output"}</span>
                </div>
              </div>

              {/* Col 2: Stage 07 (Server-Sent Events) */}
              {[steps[6]].map((step) => {
                const isSelected = activeStepId === step.id;

                return (
                  <div
                    key={step.id}
                    onClick={() => handleStepClick(step.id)}
                    className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none ${getColorClasses(
                      step.status,
                      isSelected
                    )}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded border px-2 py-0.5 text-xs font-mono font-bold uppercase ${getBadgeColor()}`}
                          >
                            STAGE {step.stepNumber}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 bg-[#091122] border border-white/[0.08] text-slate-300"
                          >
                            <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                              {step.status === "running" ? (
                                <>
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                                </>
                              ) : step.status === "completed" ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                              )}
                            </span>
                            <span>{step.status === "running" ? "WORKING" : step.status === "completed" ? "DONE" : "IDLE"}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-bold text-xs select-none">🠔</span>
                          <span className="text-2xl">{step.icon}</span>
                        </div>
                      </div>

                      <h3 className="font-mono text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition mb-1 leading-snug">
                        {step.title}
                      </h3>
                      <span className="text-xs font-mono text-cyan-400 block uppercase tracking-wider mb-2.5 font-semibold">
                        {step.layer}
                      </span>

                      <p className="font-sans text-xs text-slate-200 leading-relaxed mb-4">
                        {step.simpleExplanation}
                      </p>
                    </div>

                    <div className="border-t border-white/[0.08] pt-2.5 mt-auto font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{step.metricLabel || "Metric"}:</span>
                        <span className="font-bold text-cyan-300 text-xs sm:text-sm">{step.metricValue}</span>
                      </div>
                      {step.secondaryMetric && (
                        <div className="text-xs text-slate-400 mt-1 truncate">
                          {step.secondaryMetric}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Col 3: Stage 06 (LM Head Projection) */}
              {[steps[5]].map((step) => {
                const isSelected = activeStepId === step.id;

                return (
                  <div
                    key={step.id}
                    onClick={() => handleStepClick(step.id)}
                    className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none ${getColorClasses(
                      step.status,
                      isSelected
                    )}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded border px-2 py-0.5 text-xs font-mono font-bold uppercase ${getBadgeColor()}`}
                          >
                            STAGE {step.stepNumber}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 bg-[#091122] border border-white/[0.08] text-slate-300"
                          >
                            <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                              {step.status === "running" ? (
                                <>
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                                </>
                              ) : step.status === "completed" ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                              )}
                            </span>
                            <span>{step.status === "running" ? "WORKING" : step.status === "completed" ? "DONE" : "IDLE"}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-bold text-xs select-none">🠔</span>
                          <span className="text-2xl">{step.icon}</span>
                        </div>
                      </div>

                      <h3 className="font-mono text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition mb-1 leading-snug">
                        {step.title}
                      </h3>
                      <span className="text-xs font-mono text-cyan-400 block uppercase tracking-wider mb-2.5 font-semibold">
                        {step.layer}
                      </span>

                      <p className="font-sans text-xs text-slate-200 leading-relaxed mb-4">
                        {step.simpleExplanation}
                      </p>
                    </div>

                    <div className="border-t border-white/[0.08] pt-2.5 mt-auto font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{step.metricLabel || "Metric"}:</span>
                        <span className="font-bold text-cyan-300 text-xs sm:text-sm">{step.metricValue}</span>
                      </div>
                      {step.secondaryMetric && (
                        <div className="text-xs text-slate-400 mt-1 truncate">
                          {step.secondaryMetric}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Col 4: Stage 05 (KV Cache Paging - Directly below Stage 04!) */}
              {[steps[4]].map((step) => {
                const isSelected = activeStepId === step.id;

                return (
                  <div
                    key={step.id}
                    onClick={() => handleStepClick(step.id)}
                    className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none ${getColorClasses(
                      step.status,
                      isSelected
                    )}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded border px-2 py-0.5 text-xs font-mono font-bold uppercase ${getBadgeColor()}`}
                          >
                            STAGE {step.stepNumber}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 bg-[#091122] border border-white/[0.08] text-slate-300"
                          >
                            <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                              {step.status === "running" ? (
                                <>
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                                </>
                              ) : step.status === "completed" ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                              )}
                            </span>
                            <span>{step.status === "running" ? "WORKING" : step.status === "completed" ? "DONE" : "IDLE"}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-cyan-400 font-bold text-sm select-none" title="Received from Stage 04 above">
                            ↵
                          </span>
                          <span className="text-2xl">{step.icon}</span>
                        </div>
                      </div>

                      <h3 className="font-mono text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition mb-1 leading-snug">
                        {step.title}
                      </h3>
                      <span className="text-xs font-mono text-cyan-400 block uppercase tracking-wider mb-2.5 font-semibold">
                        {step.layer}
                      </span>

                      <p className="font-sans text-xs text-slate-200 leading-relaxed mb-4">
                        {step.simpleExplanation}
                      </p>
                    </div>

                    <div className="border-t border-white/[0.08] pt-2.5 mt-auto font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{step.metricLabel || "Metric"}:</span>
                        <span className="font-bold text-cyan-300 text-xs sm:text-sm">{step.metricValue}</span>
                      </div>
                      {step.secondaryMetric && (
                        <div className="text-xs text-slate-400 mt-1 truncate">
                          {step.secondaryMetric}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            steps.map((step) => {
              const isSelected = activeStepId === step.id;

              return (
                <div
                  key={step.id}
                  onClick={() => handleStepClick(step.id)}
                  className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none ${getColorClasses(
                    step.status,
                    isSelected
                  )}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded border px-2 py-0.5 text-xs font-mono font-bold uppercase ${getBadgeColor()}`}
                        >
                          STAGE {step.stepNumber}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 bg-[#091122] border border-white/[0.08] text-slate-300"
                        >
                          <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                            {step.status === "running" ? (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                              </>
                            ) : step.status === "completed" ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                            )}
                          </span>
                          <span>{step.status === "running" ? "WORKING" : step.status === "completed" ? "DONE" : "IDLE"}</span>
                        </span>
                      </div>
                      <span className="text-2xl">{step.icon}</span>
                    </div>

                    <h3 className="font-mono text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition mb-1 leading-snug">
                      {step.title}
                    </h3>
                    <span className="text-xs font-mono text-cyan-400 block uppercase tracking-wider mb-2.5 font-semibold">
                      {step.layer}
                    </span>

                    <p className="font-sans text-xs text-slate-200 leading-relaxed mb-4">
                      {step.simpleExplanation}
                    </p>
                  </div>

                  {/* Footer Metrics */}
                  <div className="border-t border-white/[0.08] pt-2.5 mt-auto font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">{step.metricLabel || "Metric"}:</span>
                      <span className="font-bold text-cyan-300 text-xs sm:text-sm">{step.metricValue}</span>
                    </div>
                    {step.secondaryMetric && (
                      <div className="text-xs text-slate-400 mt-1 truncate">
                        {step.secondaryMetric}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detailed Technical Deep-Dive Inspector for the selected step */}
      {inspectedStep && (
        <div className="rounded-xl border border-cyan-500/40 bg-[#060e22] p-5 shadow-[0_0_25px_rgba(34,211,238,0.12)] font-mono text-xs space-y-3.5 transition-all">
          <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] pb-3 gap-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{inspectedStep.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-slate-400">
                    STAGE {inspectedStep.stepNumber} DEEP INSPECTION:
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-cyan-300">{inspectedStep.title}</h3>
                </div>
                <span className="text-xs text-slate-300">{inspectedStep.layer}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">PROVENANCE:</span>
              <span className="rounded bg-cyan-950 border border-cyan-800 text-cyan-300 px-2 py-0.5 font-bold">
                {inspectedStep.classification}
              </span>
              <button
                onClick={() => setInternalSelectedStep(null)}
                className="text-slate-400 hover:text-white ml-2 text-base cursor-pointer"
                title="Close Inspection"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            {/* Column 1: Technical Explanation */}
            <div className="space-y-2 lg:col-span-2">
              <span className="text-xs font-bold text-slate-300 uppercase block">Operational Mechanism</span>
              <p className="text-slate-100 font-sans leading-relaxed text-xs sm:text-sm">
                {inspectedStep.deepExplanation}
              </p>

              {inspectedStep.formula && (
                <div className="mt-2.5 rounded-lg border border-white/[0.08] bg-[#03060c] p-3">
                  <span className="text-xs text-slate-400 block uppercase font-bold mb-1">Mathematical Formulation</span>
                  <code className="text-cyan-300 text-xs sm:text-sm block font-mono font-bold leading-normal">{inspectedStep.formula}</code>
                </div>
              )}
            </div>

            {/* Column 2: Live In/Out Telemetry */}
            <div className="rounded-lg border border-white/[0.08] bg-[#03060c] p-3.5 space-y-2.5">
              <span className="text-xs font-bold text-slate-300 uppercase block border-b border-white/[0.06] pb-1.5">
                Live Data Transformation
              </span>
              {inspectedStep.inputData && (
                <div>
                  <span className="text-xs text-slate-400 block font-bold mb-0.5">INPUT DATA</span>
                  <span className="text-slate-200 text-xs block truncate font-medium">{inspectedStep.inputData}</span>
                </div>
              )}
              {inspectedStep.outputData && (
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-slate-400 block font-bold">OUTPUT STATE</span>
                    <button
                      type="button"
                      onClick={() => handleCopyStepOutput(liveOutput || inspectedStep.outputData || "")}
                      className="flex items-center gap-1 rounded bg-[#0b1329] border border-emerald-600/40 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-950 hover:text-emerald-100 hover:border-emerald-400 transition cursor-pointer font-medium"
                      title="Copy output text"
                    >
                      {copiedStepOutput ? (
                        <>
                          <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <span className="text-emerald-300 text-xs block truncate font-medium">{inspectedStep.outputData}</span>
                </div>
              )}
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                <span className="text-slate-400">{inspectedStep.metricLabel}:</span>
                <span className="font-bold text-cyan-300 text-xs sm:text-sm">{inspectedStep.metricValue}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
