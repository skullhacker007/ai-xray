"use client";

import { useState, useEffect, useRef, useMemo, useCallback, MouseEvent as ReactMouseEvent } from "react";
import {
  SpatialNode,
  SpatialConnection,
  TokenSequenceItem,
} from "./lib/observatory-types";
import {
  tokenizeString,
  computeUnifiedAttention,
  calculateKVCacheFootprint,
} from "./lib/tokenizer";
import { buildDynamicTopology, ExecutionMode, getMappedNodeId } from "./lib/topology-builder";
import WorkflowFlowchart from "@/src/components/flow/WorkflowFlowchart";
import LayerAnalyticsPipeline from "@/src/components/analytics/LayerAnalyticsPipeline";
import { getModelArchitectureSpecs } from "./lib/model-specs";

type ModelOption = {
  id: string;
  ownedBy: string;
  isFeatured: boolean;
};

type TraceRecord = {
  traceId: string;
  mode: ExecutionMode;
  prompt: string;
  model: string;
  modelB?: string;
  timestamp: string;
  durationMs: number;
  ttftMs?: number;
  tokensPerSec?: number;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  costUsd: number;
  outputText: string;
  tokens: TokenSequenceItem[];
  nodes: SpatialNode[];
  connections: SpatialConnection[];
  logs: Array<{ time: string; level: "INFO" | "WARN" | "ERROR"; spanId?: string; message: string }>;
  compareData?: {
    modelA: { model: string; duration_ms: number; content: string; usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number } };
    modelB: { model: string; duration_ms: number; content: string; usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number } };
  };
};

function generateTraceId(): string {
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Helpers for clean CamelCase / TitleCase stage naming without 'span-' prefixes
function getNodeStageName(node: SpatialNode): string {
  const id = node.id.toLowerCase();
  const spanId = (node.spanId || "").replace(/^span-/, "").toLowerCase();
  if (id.includes("in") || spanId.startsWith("input") || spanId === "in") return "Input";
  if (id.includes("tok") || spanId.startsWith("tok")) return "Tokenize";
  if (id.includes("embed") || spanId.startsWith("embed")) return "Embedding";
  if (id.includes("prefill") || spanId.startsWith("prefill")) return "Prefill";
  if (id.includes("decode") || spanId.startsWith("decode")) return "Decode";
  if (id.includes("sample") || spanId.startsWith("sample")) return "Sample";
  if (id.includes("out") || spanId.startsWith("out")) return "Output";
  if (spanId.startsWith("disc")) return "Discovery";
  if (spanId.startsWith("turn1")) return "Decision";
  if (spanId.startsWith("exec")) return "Execution";
  if (spanId.startsWith("synth")) return "Synthesis";
  if (spanId.startsWith("plan")) return "Planner";
  if (spanId.startsWith("spec")) return "Specialist";
  if (spanId.startsWith("modela")) return "Model A";
  if (spanId.startsWith("modelb")) return "Model B";
  if (spanId.startsWith("verdict")) return "Verdict";
  return spanId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getNodeCategoryName(node: SpatialNode): string {
  const id = node.id.toLowerCase();
  const type = node.type.toLowerCase();
  if (id.includes("prefill")) return "Prefill";
  if (id.includes("embed")) return "Embedding";
  if (id.includes("decode") || type === "cache") return "Decode";
  if (id.includes("sample")) return "Sample";
  if (id.includes("in") || type === "input") return "Input";
  if (id.includes("tok") || type === "tokenizer") return "Tokenize";
  if (id.includes("out") || type === "output") return "Output";
  if (type === "router") return "Router";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

const DEFAULT_PROMPT = "Explain artificial intelligence in 2 concise sentences.";
const DEFAULT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";
const DEFAULT_MODEL_B = "poolside/laguna-xs-2.1";

const INITIAL_TOPOLOGY = buildDynamicTopology(
  "stream",
  DEFAULT_PROMPT,
  DEFAULT_MODEL,
  "trace-session-ready",
  "idle",
  0,
  "",
  tokenizeString(DEFAULT_PROMPT).length,
  0
);

interface ModeTraceState {
  hasExecuted: boolean;
  nodes: SpatialNode[];
  connections: SpatialConnection[];
  tokens: TokenSequenceItem[];
  output: string;
  durationMs: number;
  ttftMs?: number;
  throughput?: number;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  traceId: string;
  logs: Array<{ time: string; level: "INFO" | "WARN" | "ERROR"; spanId?: string; message: string }>;
  compareData?: TraceRecord["compareData"];
  toolExecutions?: Array<{ name: string; args: unknown; result: unknown; duration_ms: number }>;
  agentsBreakdown?: Array<{ agent: string; duration_ms: number; tokens: number; output: string }>;
}

export default function Home() {
  // Mode & Query State
  const [mode, setMode] = useState<ExecutionMode>("stream");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [selectedModelB, setSelectedModelB] = useState(DEFAULT_MODEL_B);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Advanced Settings Drawer
  const [showSettings, setShowSettings] = useState(false);
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(256);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are an AI inspected by AI X-RAY neural instrumentation. Provide a clear, precise response."
  );

  // View state: Layer Analytics is default and first in series
  const [primaryView, setPrimaryView] = useState<"ANALYSIS" | "GRAPH" | "WORKFLOW" | "WATERFALL">("ANALYSIS");
  const [showWorkflowOverlay, setShowWorkflowOverlay] = useState<boolean>(true);
  const [showInspector, setShowInspector] = useState(true);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedInspectorOutput, setCopiedInspectorOutput] = useState(false);
  const [copiedInspectorInput, setCopiedInspectorInput] = useState(false);

  // Replay
  const [replayStep, setReplayStep] = useState<number>(100);
  const [isPlayingReplay, setIsPlayingReplay] = useState<boolean>(false);

  // Spatial Pan & Zoom
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [zoom, setZoom] = useState(1);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Session Traces History
  const [traceHistory, setTraceHistory] = useState<TraceRecord[]>([]);
  const [activeTraceId, setActiveTraceId] = useState<string | null>("trace-session-ready");

  // Per-mode state persistence store: isolates each tab strictly to its own execution
  const modeStoreRef = useRef<Record<ExecutionMode, ModeTraceState>>({
    stream: {
      hasExecuted: false,
      nodes: INITIAL_TOPOLOGY.nodes,
      connections: INITIAL_TOPOLOGY.connections,
      tokens: [],
      output: "",
      durationMs: 0,
      tokensIn: tokenizeString(DEFAULT_PROMPT).length,
      tokensOut: 0,
      cachedTokens: 0,
      traceId: "trace-session-ready",
      logs: [{ time: "00:00:00", level: "INFO", message: "AI X-RAY Direct Stream ready" }],
    },
    tool: {
      hasExecuted: false,
      nodes: buildDynamicTopology("tool", DEFAULT_PROMPT, DEFAULT_MODEL, "trace-session-ready", "idle", 0, "", tokenizeString(DEFAULT_PROMPT).length, 0).nodes,
      connections: buildDynamicTopology("tool", DEFAULT_PROMPT, DEFAULT_MODEL, "trace-session-ready", "idle", 0, "", tokenizeString(DEFAULT_PROMPT).length, 0).connections,
      tokens: [],
      output: "",
      durationMs: 0,
      tokensIn: tokenizeString(DEFAULT_PROMPT).length,
      tokensOut: 0,
      cachedTokens: 0,
      traceId: "trace-session-ready",
      logs: [{ time: "00:00:00", level: "INFO", message: "AI X-RAY MCP Tool Agent ready" }],
      toolExecutions: [],
    },
    multiagent: {
      hasExecuted: false,
      nodes: buildDynamicTopology("multiagent", DEFAULT_PROMPT, DEFAULT_MODEL, "trace-session-ready", "idle", 0, "", tokenizeString(DEFAULT_PROMPT).length, 0).nodes,
      connections: buildDynamicTopology("multiagent", DEFAULT_PROMPT, DEFAULT_MODEL, "trace-session-ready", "idle", 0, "", tokenizeString(DEFAULT_PROMPT).length, 0).connections,
      tokens: [],
      output: "",
      durationMs: 0,
      tokensIn: tokenizeString(DEFAULT_PROMPT).length,
      tokensOut: 0,
      cachedTokens: 0,
      traceId: "trace-session-ready",
      logs: [{ time: "00:00:00", level: "INFO", message: "AI X-RAY Multi-Agent Pipeline ready" }],
      agentsBreakdown: [],
    },
    compare: {
      hasExecuted: false,
      nodes: buildDynamicTopology("compare", DEFAULT_PROMPT, DEFAULT_MODEL, "trace-session-ready", "idle", 0, "", tokenizeString(DEFAULT_PROMPT).length, 0, { modelB: DEFAULT_MODEL_B }).nodes,
      connections: buildDynamicTopology("compare", DEFAULT_PROMPT, DEFAULT_MODEL, "trace-session-ready", "idle", 0, "", tokenizeString(DEFAULT_PROMPT).length, 0, { modelB: DEFAULT_MODEL_B }).connections,
      tokens: [],
      output: "",
      durationMs: 0,
      tokensIn: tokenizeString(DEFAULT_PROMPT).length,
      tokensOut: 0,
      cachedTokens: 0,
      traceId: "trace-session-ready",
      logs: [{ time: "00:00:00", level: "INFO", message: "AI X-RAY A/B Benchmark ready" }],
      compareData: undefined,
    },
  });

  // Live in-progress trace state
  const [liveNodes, setLiveNodes] = useState<SpatialNode[]>(INITIAL_TOPOLOGY.nodes);
  const [liveConnections, setLiveConnections] = useState<SpatialConnection[]>(INITIAL_TOPOLOGY.connections);
  const [liveTokens, setLiveTokens] = useState<TokenSequenceItem[]>([]);
  const [liveOutput, setLiveOutput] = useState("");
  const [liveDurationMs, setLiveDurationMs] = useState(0);
  const [liveTtftMs, setLiveTtftMs] = useState<number | undefined>(undefined);
  const [liveThroughput, setLiveThroughput] = useState<number | undefined>(undefined);
  const [liveTokensIn, setLiveTokensIn] = useState(tokenizeString(DEFAULT_PROMPT).length);
  const [liveTokensOut, setLiveTokensOut] = useState(0);
  const [liveCachedTokens, setLiveCachedTokens] = useState(0);
  const [liveLogs, setLiveLogs] = useState<Array<{ time: string; level: "INFO" | "WARN" | "ERROR"; spanId?: string; message: string }>>([
    { time: "00:00:00", level: "INFO", message: "AI X-RAY Observatory ready for dynamic execution" },
  ]);
  const [liveCompareData, setLiveCompareData] = useState<TraceRecord["compareData"]>(undefined);
  const [activeToolExecutions, setActiveToolExecutions] = useState<Array<{ name: string; args: unknown; result: unknown; duration_ms: number }>>([]);
  const [activeAgentBreakdown, setActiveAgentBreakdown] = useState<Array<{ agent: string; duration_ms: number; tokens: number; output: string }>>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Dynamic tokenization computed from current prompt
  const dynamicPromptTokens = useMemo(() => tokenizeString(prompt), [prompt]);

  // Combined tokens for unified attention & token sequence
  const combinedTokens = useMemo(() => {
    const inputItems = dynamicPromptTokens.map((t) => ({ text: t.text, id: t.id }));
    const outputItems = (liveTokens.length > 0 ? liveTokens : []).map((t) => ({ text: t.tokenString, id: t.tokenId }));
    return computeUnifiedAttention(inputItems, outputItems);
  }, [dynamicPromptTokens, liveTokens]);

  // Dynamic model architecture specifications
  const modelSpecs = useMemo(() => getModelArchitectureSpecs(selectedModel), [selectedModel]);

  // KV cache footprint calculated from real architectural math
  const kvCacheStats = useMemo(() => {
    return calculateKVCacheFootprint(
      liveTokensIn + liveTokensOut,
      modelSpecs.layers,
      modelSpecs.kvHeads,
      modelSpecs.headDim,
      modelSpecs.bytesPerParam
    );
  }, [liveTokensIn, liveTokensOut, modelSpecs]);

  // Load real models from NVIDIA NIM on mount
  useEffect(() => {
    async function loadModels() {
      try {
        setLoadingModels(true);
        const res = await fetch("/api/nvidia/models");
        const data = await res.json();
        if (data.success && data.models?.length > 0) {
          setModels(data.models);
          if (data.defaultModel) {
            setSelectedModel(data.defaultModel);
          }
          if (data.models[1]?.id) {
            setSelectedModelB(data.models[1].id);
          }
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Error contacting NVIDIA models API");
      } finally {
        setLoadingModels(false);
      }
    }
    loadModels();
  }, []);

  // Helper to add live logs
  const logEvent = useCallback((level: "INFO" | "WARN" | "ERROR", message: string, spanId?: string) => {
    const time = new Date().toLocaleTimeString();
    setLiveLogs((prev) => [...prev, { time, level, spanId, message }]);
  }, []);

  // Synchronize dynamic topology and tokensIn with model/prompt changes when idle
  const syncIdleTopology = useCallback(
    (
      newPrompt: string,
      newModel: string,
      newModelB: string,
      newMode: ExecutionMode
    ) => {
      const promptTokCount = tokenizeString(newPrompt).length;
      setLiveTokensIn(promptTokCount);
      const isExecuted = Boolean(modeStoreRef.current[newMode]?.hasExecuted);
      const targetState = modeStoreRef.current[newMode];
      const topo = buildDynamicTopology(
        newMode,
        newPrompt,
        newModel,
        activeTraceId || "trace-session-ready",
        isExecuted ? "completed" : "idle",
        isExecuted ? (targetState?.durationMs || liveDurationMs) : 0,
        isExecuted ? (targetState?.output || liveOutput) : "",
        promptTokCount,
        isExecuted ? (targetState?.tokensOut || liveTokensOut) : 0,
        {
          modelB: newModelB,
          toolExecutions: newMode === "tool" ? activeToolExecutions : undefined,
          agentsBreakdown: newMode === "multiagent" ? activeAgentBreakdown : undefined,
          compareA: newMode === "compare" ? liveCompareData?.modelA : undefined,
          compareB: newMode === "compare" ? liveCompareData?.modelB : undefined,
        }
      );
      setLiveNodes(topo.nodes);
      setLiveConnections(topo.connections);
    },
    [activeTraceId, liveDurationMs, liveOutput, liveTokensOut, activeToolExecutions, activeAgentBreakdown, liveCompareData]
  );

  const handlePromptChange = (newPrompt: string) => {
    setPrompt(newPrompt);
    if (!isExecuting) {
      syncIdleTopology(newPrompt, selectedModel, selectedModelB, mode);
    }
  };

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    if (!isExecuting) {
      syncIdleTopology(prompt, newModel, selectedModelB, mode);
    }
  };

  const handleModelBChange = (newModelB: string) => {
    setSelectedModelB(newModelB);
    if (!isExecuting) {
      syncIdleTopology(prompt, selectedModel, newModelB, mode);
    }
  };

  // Mode Switch Handler: Strictly isolates state so each tab works ONLY on its specific task
  const handleSwitchMode = (newMode: ExecutionMode) => {
    if (newMode === mode) return;

    // Save current active mode state before switching
    modeStoreRef.current[mode] = {
      hasExecuted: Boolean(modeStoreRef.current[mode]?.hasExecuted || liveDurationMs > 0),
      nodes: liveNodes,
      connections: liveConnections,
      tokens: liveTokens,
      output: liveOutput,
      durationMs: liveDurationMs,
      ttftMs: liveTtftMs,
      throughput: liveThroughput,
      tokensIn: liveTokensIn,
      tokensOut: liveTokensOut,
      cachedTokens: liveCachedTokens,
      traceId: activeTraceId || "trace-session-ready",
      logs: liveLogs,
      compareData: mode === "compare" ? liveCompareData : undefined,
      toolExecutions: mode === "tool" ? activeToolExecutions : [],
      agentsBreakdown: mode === "multiagent" ? activeAgentBreakdown : [],
    };

    setMode(newMode);

    const target = modeStoreRef.current[newMode];
    const promptTokCount = tokenizeString(prompt).length;

    if (target && target.hasExecuted) {
      // Restore previously executed results for this specific mode
      setActiveTraceId(target.traceId);
      setLiveOutput(target.output);
      setLiveTokens(target.tokens);
      setLiveDurationMs(target.durationMs);
      setLiveTtftMs(target.ttftMs);
      setLiveThroughput(target.throughput);
      setLiveTokensIn(target.tokensIn);
      setLiveTokensOut(target.tokensOut);
      setLiveCachedTokens(target.cachedTokens);
      setLiveLogs(target.logs);
      setLiveCompareData(newMode === "compare" ? target.compareData : undefined);
      setActiveToolExecutions(newMode === "tool" ? (target.toolExecutions || []) : []);
      setActiveAgentBreakdown(newMode === "multiagent" ? (target.agentsBreakdown || []) : []);
      setLiveNodes(target.nodes);
      setLiveConnections(target.connections);
      setSelectedNodeId(target.nodes[0]?.id || null);
    } else {
      // Clean idle state for unexecuted mode: 0ms, ash dots, no cross-mode data
      setActiveTraceId("trace-session-ready");
      setLiveOutput("");
      setLiveTokens([]);
      setLiveDurationMs(0);
      setLiveTtftMs(undefined);
      setLiveThroughput(undefined);
      setLiveTokensIn(promptTokCount);
      setLiveTokensOut(0);
      setLiveCachedTokens(0);
      setLiveLogs(target?.logs || [{ time: "00:00:00", level: "INFO", message: `AI X-RAY [${newMode.toUpperCase()}] mode ready` }]);
      setLiveCompareData(undefined);
      setActiveToolExecutions([]);
      setActiveAgentBreakdown([]);

      const idleTopo = buildDynamicTopology(
        newMode,
        prompt,
        selectedModel,
        "trace-session-ready",
        "idle",
        0,
        "",
        promptTokCount,
        0,
        { modelB: selectedModelB }
      );
      setLiveNodes(idleTopo.nodes);
      setLiveConnections(idleTopo.connections);
      setSelectedNodeId(idleTopo.nodes[0]?.id || null);
    }

    logEvent("INFO", `Switched execution mode to [${newMode.toUpperCase()}]`);
  };

  // Copy Answer helper
  const handleCopyAnswer = () => {
    if (!liveOutput) return;
    navigator.clipboard.writeText(liveOutput);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  // Copy Inspector output / input helpers
  const handleCopyInspectorOutput = () => {
    if (!selectedNode) return;
    const textToCopy =
      typeof selectedNode.output.data === "string"
        ? selectedNode.output.data
        : JSON.stringify(selectedNode.output.data, null, 2);
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedInspectorOutput(true);
    setTimeout(() => setCopiedInspectorOutput(false), 2000);
  };

  const handleCopyInspectorInput = () => {
    if (!selectedNode) return;
    const textToCopy =
      typeof selectedNode.input.data === "string"
        ? selectedNode.input.data
        : JSON.stringify(selectedNode.input.data, null, 2);
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedInspectorInput(true);
    setTimeout(() => setCopiedInspectorInput(false), 2000);
  };

  // Execute Dynamic Trace
  const handleExecute = async (overridePrompt?: string, overrideMode?: ExecutionMode) => {
    const targetPrompt = (overridePrompt ?? prompt).trim();
    const targetMode = overrideMode ?? mode;
    if (isExecuting || !targetPrompt) return;

    if (overridePrompt) setPrompt(overridePrompt);
    if (overrideMode) setMode(overrideMode);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsExecuting(true);
    setErrorMessage(null);
    setLiveOutput("");
    setLiveTokens([]);
    setLiveDurationMs(0);
    setLiveTtftMs(undefined);
    setLiveThroughput(undefined);
    setLiveLogs([]);
    setLiveCompareData(undefined);
    setActiveToolExecutions([]);
    setActiveAgentBreakdown([]);
    setReplayStep(100);
    setLiveCachedTokens(0);

    const initialTokensIn = tokenizeString(targetPrompt).length;
    setLiveTokensIn(initialTokensIn);
    setLiveTokensOut(0);

    const generatedTraceId = generateTraceId();
    setActiveTraceId(generatedTraceId);

    // Initial Running Topology
    const initialTopo = buildDynamicTopology(
      targetMode,
      targetPrompt,
      selectedModel,
      generatedTraceId,
      "running",
      0,
      "",
      initialTokensIn,
      0,
      { modelB: selectedModelB }
    );
    setLiveNodes(initialTopo.nodes);
    setLiveConnections(initialTopo.connections);

    logEvent("INFO", `Started dynamic execution [mode: ${targetMode.toUpperCase()}] trace: ${generatedTraceId}`);

    try {
      if (targetMode === "stream") {
        // STREAMING MODE
        const res = await fetch("/api/nvidia/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: targetPrompt,
            model: selectedModel,
            systemPrompt,
            temperature,
            maxTokens,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`NVIDIA Stream API Error (${res.status}): ${err}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No readable stream response body");
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        const accumulatedTokens: TokenSequenceItem[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.replace(/^data:\s*/, "");
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "init") {
                logEvent("INFO", `Initialized BPE Tokenizer: ${event.input_tokens?.length} tokens encoded`);
              } else if (event.type === "token") {
                accumulatedText += event.token;
                setLiveOutput(accumulatedText);

                const item: TokenSequenceItem = {
                  position: event.step_index,
                  tokenId: event.token_id,
                  tokenString: event.token,
                  type: "subword",
                  classification: "output",
                  timestampMs: event.elapsed_ms,
                  probability: event.probability,
                  topAlternatives: event.top_candidates,
                  provenance: "ACTUAL",
                };
                accumulatedTokens.push(item);
                setLiveTokens([...accumulatedTokens]);
                setLiveDurationMs(event.elapsed_ms);
                setLiveTokensOut(accumulatedTokens.length);

                const currentTopo = buildDynamicTopology(
                  "stream",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "running",
                  event.elapsed_ms,
                  accumulatedText,
                  initialTokensIn,
                  accumulatedTokens.length
                );
                setLiveNodes(currentTopo.nodes);
                setLiveConnections(currentTopo.connections);
              } else if (event.type === "done") {
                setLiveDurationMs(event.total_duration_ms);
                setLiveTtftMs(event.ttft_ms);
                setLiveThroughput(event.tokens_per_second);
                if (event.usage?.prompt_tokens) {
                  setLiveTokensIn(event.usage.prompt_tokens);
                }
                if (event.usage?.prompt_tokens_details?.cached_tokens !== undefined) {
                  setLiveCachedTokens(event.usage.prompt_tokens_details.cached_tokens);
                }

                logEvent("INFO", `Completed generation: ${accumulatedTokens.length} tokens in ${event.total_duration_ms}ms (${event.tokens_per_second} tok/s)`);

                const finalTopo = buildDynamicTopology(
                  "stream",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "completed",
                  event.total_duration_ms,
                  accumulatedText,
                  event.usage?.prompt_tokens || initialTokensIn,
                  accumulatedTokens.length
                );
                setLiveNodes(finalTopo.nodes);
                setLiveConnections(finalTopo.connections);

                const rec: TraceRecord = {
                  traceId: generatedTraceId,
                  mode: "stream",
                  prompt: targetPrompt,
                  model: selectedModel,
                  timestamp: new Date().toISOString(),
                  durationMs: event.total_duration_ms,
                  ttftMs: event.ttft_ms,
                  tokensPerSec: event.tokens_per_second,
                  tokensIn: event.usage?.prompt_tokens || initialTokensIn,
                  tokensOut: accumulatedTokens.length,
                  cachedTokens: event.usage?.prompt_tokens_details?.cached_tokens || 0,
                  costUsd: ((event.usage?.prompt_tokens || initialTokensIn) * 0.000002 + accumulatedTokens.length * 0.000006),
                  outputText: accumulatedText,
                  tokens: accumulatedTokens,
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  logs: [...liveLogs],
                };
                modeStoreRef.current.stream = {
                  hasExecuted: true,
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  tokens: accumulatedTokens,
                  output: accumulatedText,
                  durationMs: event.total_duration_ms,
                  ttftMs: event.ttft_ms,
                  throughput: event.tokens_per_second,
                  tokensIn: event.usage?.prompt_tokens || initialTokensIn,
                  tokensOut: accumulatedTokens.length,
                  cachedTokens: event.usage?.prompt_tokens_details?.cached_tokens || 0,
                  traceId: generatedTraceId,
                  logs: [...liveLogs],
                };
                setTraceHistory((prev) => [rec, ...prev.slice(0, 19)]);
              } else if (event.type === "error") {
                setErrorMessage(event.error);
                logEvent("ERROR", `Stream error: ${event.error}`);
              }
            } catch {
              // Partial JSON buffer
            }
          }
        }
      } else if (targetMode === "tool") {
        // TOOL AGENT MODE
        const res = await fetch("/api/nvidia/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: targetPrompt, model: selectedModel }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Agent API Error: ${err}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No readable response body");
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.replace(/^data:\s*/, "");
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "turn1_done") {
                logEvent("INFO", `Turn 1 completed: ${event.has_tool_call ? "Issued Tool Call" : "Direct response"}`);
                const interTopo = buildDynamicTopology(
                  "tool",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "running",
                  event.duration_ms,
                  "",
                  event.usage?.prompt_tokens,
                  event.usage?.completion_tokens,
                  { toolCalls: event.tool_calls }
                );
                setLiveNodes(interTopo.nodes);
                setLiveConnections(interTopo.connections);
              } else if (event.type === "tool_executed") {
                logEvent("INFO", `Executed MCP tool '${event.tool_name}' in ${event.duration_ms}ms -> Result: ${JSON.stringify(event.result)}`);
                setActiveToolExecutions((prev) => {
                  const updated = [
                    ...prev,
                    { name: event.tool_name, args: event.args, result: event.result, duration_ms: event.duration_ms },
                  ];
                  const interTopo = buildDynamicTopology(
                    "tool",
                    targetPrompt,
                    selectedModel,
                    generatedTraceId,
                    "running",
                    undefined,
                    "",
                    undefined,
                    undefined,
                    { toolExecutions: updated }
                  );
                  setLiveNodes(interTopo.nodes);
                  setLiveConnections(interTopo.connections);
                  return updated;
                });
              } else if (event.type === "final_output") {
                setLiveOutput(event.content);
                setLiveDurationMs(event.total_duration_ms);
                setLiveTokensIn(event.prompt_tokens);
                setLiveTokensOut(event.completion_tokens);
                if (event.tool_executions) {
                  setActiveToolExecutions(event.tool_executions);
                }

                const finalTopo = buildDynamicTopology(
                  "tool",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "completed",
                  event.total_duration_ms,
                  event.content,
                  event.prompt_tokens,
                  event.completion_tokens,
                  { toolExecutions: event.tool_executions }
                );
                setLiveNodes(finalTopo.nodes);
                setLiveConnections(finalTopo.connections);

                const rec: TraceRecord = {
                  traceId: generatedTraceId,
                  mode: "tool",
                  prompt: targetPrompt,
                  model: selectedModel,
                  timestamp: new Date().toISOString(),
                  durationMs: event.total_duration_ms,
                  tokensIn: event.prompt_tokens,
                  tokensOut: event.completion_tokens,
                  cachedTokens: 0,
                  costUsd: (event.prompt_tokens * 0.000002 + event.completion_tokens * 0.000006),
                  outputText: event.content,
                  tokens: tokenizeString(event.content).map((t, idx) => ({
                    position: idx,
                    tokenId: t.id,
                    tokenString: t.text,
                    type: "subword",
                    classification: "output",
                    timestampMs: idx * 4,
                    provenance: "ACTUAL",
                  })),
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  logs: [...liveLogs],
                };
                modeStoreRef.current.tool = {
                  hasExecuted: true,
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  tokens: rec.tokens,
                  output: event.content,
                  durationMs: event.total_duration_ms,
                  tokensIn: event.prompt_tokens,
                  tokensOut: event.completion_tokens,
                  cachedTokens: 0,
                  traceId: generatedTraceId,
                  logs: [...liveLogs],
                  toolExecutions: event.tool_executions,
                };
                setTraceHistory((prev) => [rec, ...prev.slice(0, 19)]);
              } else if (event.type === "error") {
                setErrorMessage(event.error);
                logEvent("ERROR", `Agent error: ${event.error}`);
              }
            } catch {
              // Partial JSON
            }
          }
        }
      } else if (targetMode === "multiagent") {
        // MULTI-AGENT PIPELINE MODE
        const res = await fetch("/api/nvidia/multiagent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: targetPrompt, model: selectedModel }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Multi-agent API Error: ${err}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No readable response body");
        const decoder = new TextDecoder();
        let buffer = "";
        let runningAgentsBreakdown: Array<{ agent: string; duration_ms: number; tokens: number; output: string }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.replace(/^data:\s*/, "");
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "agent_start") {
                logEvent("INFO", `Started ${event.agent_name}`);
                const interTopo = buildDynamicTopology(
                  "multiagent",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "running",
                  undefined,
                  "",
                  undefined,
                  undefined,
                  { agentsBreakdown: runningAgentsBreakdown }
                );
                setLiveNodes(interTopo.nodes);
                setLiveConnections(interTopo.connections);
              } else if (event.type === "agent_done") {
                logEvent("INFO", `Completed ${event.agent_name} in ${event.duration_ms}ms`);
                runningAgentsBreakdown = [
                  ...runningAgentsBreakdown,
                  {
                    agent: event.agent_name,
                    duration_ms: event.duration_ms,
                    tokens: event.usage?.total_tokens || 50,
                    output: event.output,
                  },
                ];
                setActiveAgentBreakdown(runningAgentsBreakdown);
                const interTopo = buildDynamicTopology(
                  "multiagent",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "running",
                  undefined,
                  "",
                  undefined,
                  undefined,
                  { agentsBreakdown: runningAgentsBreakdown }
                );
                setLiveNodes(interTopo.nodes);
                setLiveConnections(interTopo.connections);
              } else if (event.type === "final_output") {
                setLiveOutput(event.content);
                setLiveDurationMs(event.total_duration_ms);
                setLiveTokensIn(event.prompt_tokens);
                setLiveTokensOut(event.completion_tokens);
                if (event.breakdown) {
                  setActiveAgentBreakdown(event.breakdown);
                }

                const finalTopo = buildDynamicTopology(
                  "multiagent",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "completed",
                  event.total_duration_ms,
                  event.content,
                  event.prompt_tokens,
                  event.completion_tokens,
                  { agentsBreakdown: event.breakdown }
                );
                setLiveNodes(finalTopo.nodes);
                setLiveConnections(finalTopo.connections);

                const rec: TraceRecord = {
                  traceId: generatedTraceId,
                  mode: "multiagent",
                  prompt: targetPrompt,
                  model: selectedModel,
                  timestamp: new Date().toISOString(),
                  durationMs: event.total_duration_ms,
                  tokensIn: event.prompt_tokens,
                  tokensOut: event.completion_tokens,
                  cachedTokens: 0,
                  costUsd: (event.prompt_tokens * 0.000002 + event.completion_tokens * 0.000006),
                  outputText: event.content,
                  tokens: tokenizeString(event.content).map((t, idx) => ({
                    position: idx,
                    tokenId: t.id,
                    tokenString: t.text,
                    type: "subword",
                    classification: "output",
                    timestampMs: idx * 4,
                    provenance: "ACTUAL",
                  })),
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  logs: [...liveLogs],
                };
                modeStoreRef.current.multiagent = {
                  hasExecuted: true,
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  tokens: rec.tokens,
                  output: event.content,
                  durationMs: event.total_duration_ms,
                  tokensIn: event.prompt_tokens,
                  tokensOut: event.completion_tokens,
                  cachedTokens: 0,
                  traceId: generatedTraceId,
                  logs: [...liveLogs],
                  agentsBreakdown: event.breakdown,
                };
                setTraceHistory((prev) => [rec, ...prev.slice(0, 19)]);
              } else if (event.type === "error") {
                setErrorMessage(event.error);
                logEvent("ERROR", `Multi-agent error: ${event.error}`);
              }
            } catch {
              // Partial JSON
            }
          }
        }
      } else if (targetMode === "compare") {
        // A/B BENCHMARK MODE
        const res = await fetch("/api/nvidia/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: targetPrompt, modelA: selectedModel, modelB: selectedModelB }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Compare API Error: ${err}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No readable response body");
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.replace(/^data:\s*/, "");
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "compare_done") {
                const totalDur = Math.max(event.resultA.duration_ms, event.resultB.duration_ms);
                const compareText = `=== MODEL A (${event.resultA.model}) ===\n${event.resultA.content}\n\n=== MODEL B (${event.resultB.model}) ===\n${event.resultB.content}`;
                setLiveDurationMs(totalDur);
                setLiveCompareData({ modelA: event.resultA, modelB: event.resultB });
                setLiveOutput(compareText);

                const totalIn = (event.resultA.usage?.prompt_tokens || 0) + (event.resultB.usage?.prompt_tokens || 0);
                const totalOut = (event.resultA.usage?.completion_tokens || 0) + (event.resultB.usage?.completion_tokens || 0);
                setLiveTokensIn(totalIn);
                setLiveTokensOut(totalOut);

                logEvent("INFO", `Completed A/B benchmark: Model A in ${event.resultA.duration_ms}ms, Model B in ${event.resultB.duration_ms}ms`);

                const finalTopo = buildDynamicTopology(
                  "compare",
                  targetPrompt,
                  selectedModel,
                  generatedTraceId,
                  "completed",
                  totalDur,
                  compareText,
                  totalIn,
                  totalOut,
                  { compareA: event.resultA, compareB: event.resultB, modelB: selectedModelB }
                );
                setLiveNodes(finalTopo.nodes);
                setLiveConnections(finalTopo.connections);

                const rec: TraceRecord = {
                  traceId: generatedTraceId,
                  mode: "compare",
                  prompt: targetPrompt,
                  model: selectedModel,
                  modelB: selectedModelB,
                  timestamp: new Date().toISOString(),
                  durationMs: totalDur,
                  tokensIn: totalIn,
                  tokensOut: totalOut,
                  cachedTokens: 0,
                  costUsd: (totalIn * 0.000002 + totalOut * 0.000006),
                  outputText: `MODEL A: ${event.resultA.content}\n\nMODEL B: ${event.resultB.content}`,
                  tokens: tokenizeString(event.resultA.content).map((t, idx) => ({
                    position: idx,
                    tokenId: t.id,
                    tokenString: t.text,
                    type: "subword",
                    classification: "output",
                    timestampMs: idx * 4,
                    provenance: "ACTUAL",
                  })),
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  logs: [...liveLogs],
                  compareData: { modelA: event.resultA, modelB: event.resultB },
                };
                modeStoreRef.current.compare = {
                  hasExecuted: true,
                  nodes: finalTopo.nodes,
                  connections: finalTopo.connections,
                  tokens: rec.tokens,
                  output: compareText,
                  durationMs: totalDur,
                  tokensIn: totalIn,
                  tokensOut: totalOut,
                  cachedTokens: 0,
                  traceId: generatedTraceId,
                  logs: [...liveLogs],
                  compareData: { modelA: event.resultA, modelB: event.resultB },
                };
                setTraceHistory((prev) => [rec, ...prev.slice(0, 19)]);
              } else if (event.type === "error") {
                setErrorMessage(event.error);
                logEvent("ERROR", `Comparison error: ${event.error}`);
              }
            } catch {
              // Partial JSON
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setErrorMessage((err as Error)?.message || "Execution failed");
        logEvent("ERROR", (err as Error)?.message || "Execution failed");
      }
    } finally {
      setIsExecuting(false);
    }
  };

  // Replay animation effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlayingReplay) {
      interval = setInterval(() => {
        setReplayStep((prev) => {
          if (prev >= 100) {
            setIsPlayingReplay(false);
            return 100;
          }
          return prev + 5;
        });
      }, 200);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingReplay]);

  // Load past trace from history
  const handleSelectPastTrace = (rec: TraceRecord) => {
    setActiveTraceId(rec.traceId);
    setMode(rec.mode);
    setPrompt(rec.prompt);
    setSelectedModel(rec.model);
    if (rec.modelB) setSelectedModelB(rec.modelB);
    setLiveNodes(rec.nodes);
    setLiveConnections(rec.connections);
    setLiveOutput(rec.outputText);
    setLiveTokens(rec.tokens);
    setLiveDurationMs(rec.durationMs);
    setLiveTtftMs(rec.ttftMs);
    setLiveThroughput(rec.tokensPerSec);
    setLiveTokensIn(rec.tokensIn);
    setLiveTokensOut(rec.tokensOut);
    setLiveCachedTokens(rec.cachedTokens || 0);
    setLiveLogs(rec.logs);
    setLiveCompareData(rec.compareData);
    setReplayStep(100);
    setSelectedNodeId(null);
  };

  // Canvas Pan Interaction
  const handleMouseDownCanvas = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest(".spatial-node-element")) return;
    setIsDraggingCanvas(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMoveCanvas = (e: ReactMouseEvent) => {
    if (!isDraggingCanvas) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUpCanvas = () => {
    setIsDraggingCanvas(false);
  };

  // Filter visible nodes by replay percentage
  const visibleNodesCount = Math.max(1, Math.ceil((liveNodes.length * replayStep) / 100));
  const activeNodes = liveNodes.slice(0, visibleNodesCount);
  const selectedNode: SpatialNode | undefined = liveNodes.find((n) => n.id === selectedNodeId) || liveNodes[0];

  // Replay slice of tokens and output
  const replayTokensCount = Math.max(0, Math.ceil((liveTokens.length * replayStep) / 100));
  const displayedTokens = replayStep === 100 ? liveTokens : liveTokens.slice(0, replayTokensCount);
  const displayedOutput = replayStep === 100 ? liveOutput : liveOutput.slice(0, Math.ceil((liveOutput.length * replayStep) / 100));

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-[#03060c] text-slate-100 select-none font-sans">
      {/* ============================================================= */}
      {/* 1. TOP GLOBAL APPLICATION HEADER & LIVE TELEMETRY RIBBON      */}
      {/* ============================================================= */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#070c18] px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-500/10 font-mono text-sm font-black text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.25)]">
            AI
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-wider text-slate-100">AI X-RAY</h1>
              <span className="rounded bg-cyan-950 border border-cyan-700/60 px-2 py-0.5 text-xs font-mono text-cyan-300 font-semibold">
                FORENSIC ENGINE
              </span>
            </div>
            <p className="text-xs font-mono text-slate-300 mt-0.5">
              Deep Neural Execution & Observability Platform
            </p>
          </div>
        </div>

        {/* Live Telemetry KPI Metrics Banner */}
        <div className="hidden lg:flex items-center gap-5 font-mono text-xs">
          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-xs text-slate-400 uppercase font-semibold">STATUS</span>
            <span className="flex items-center gap-1.5 font-bold">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isExecuting ? "bg-cyan-400 animate-ping" : "bg-emerald-400"
                }`}
              ></span>
              <span className={isExecuting ? "text-cyan-300" : "text-emerald-300"}>
                {isExecuting ? "INSPECTING..." : "READY"}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-xs text-slate-400 uppercase font-semibold">LATENCY</span>
            <span className="font-bold text-cyan-300 text-xs sm:text-sm">{liveDurationMs}ms</span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-xs text-slate-400 uppercase font-semibold">TTFT</span>
            <span className="font-bold text-amber-300 text-xs sm:text-sm">{liveTtftMs ? `${liveTtftMs}ms` : "--"}</span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-xs text-slate-400 uppercase font-semibold">THROUGHPUT</span>
            <span className="font-bold text-emerald-300 text-xs sm:text-sm">
              {liveThroughput ? `${liveThroughput} tok/s` : "--"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-xs text-slate-400 uppercase font-semibold">TOKENS</span>
            <span className="text-slate-200 text-xs">
              <strong className="text-cyan-300">{liveTokensIn}</strong> in /{" "}
              <strong className="text-emerald-300">{liveTokensOut}</strong> out
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 uppercase font-semibold">EST. COST</span>
            <span className="text-emerald-400 font-bold text-xs sm:text-sm">
              ${(liveTokensIn * 0.000002 + liveTokensOut * 0.000006).toFixed(5)}
            </span>
          </div>
        </div>

        {/* Dynamic Trace History & Global Controls */}
        <div className="flex items-center gap-2">
          {traceHistory.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#0b1222] px-3 py-1.5 text-xs font-mono">
              <span className="text-xs text-slate-300 font-medium">HISTORY:</span>
              <select
                value={activeTraceId || ""}
                onChange={(e) => {
                  const found = traceHistory.find((t) => t.traceId === e.target.value);
                  if (found) handleSelectPastTrace(found);
                }}
                className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer text-xs max-w-[150px] truncate"
              >
                {traceHistory.map((th, idx) => (
                  <option key={th.traceId} value={th.traceId} className="bg-[#0b1222] text-slate-200">
                    Run #{traceHistory.length - idx}: {th.prompt.slice(0, 18)}... ({th.durationMs}ms)
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowInspector(!showInspector)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-mono transition ${
              showInspector
                ? "border-cyan-400/60 bg-cyan-950/50 text-cyan-300"
                : "border-white/[0.1] bg-[#0b1222] text-slate-400 hover:text-slate-200"
            }`}
            title="Toggle Forensic Node Inspector"
          >
            Inspector {showInspector ? "▶" : "◀"}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-mono transition ${
              showSettings
                ? "border-cyan-400/60 bg-cyan-950/50 text-cyan-300"
                : "border-white/[0.1] bg-[#0b1222] text-slate-400 hover:text-slate-200"
            }`}
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      {/* ============================================================= */}
      {/* 2. DYNAMIC EXECUTION CONTROL & PROMPT BAR                     */}
      {/* ============================================================= */}
      <section className="shrink-0 border-b border-white/[0.08] bg-[#060a14] px-4 py-2.5 sm:px-6">
        <div className="flex flex-col gap-2.5">
          {/* Top row: Mode Selection & View Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Execution Modes */}
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#080e1d] p-0.5 text-xs font-mono">
              <button
                onClick={() => handleSwitchMode("stream")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition cursor-pointer ${
                  mode === "stream" ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(34,211,238,0.4)]" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>⚡ Direct Stream</span>
              </button>
              <button
                onClick={() => handleSwitchMode("tool")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition cursor-pointer ${
                  mode === "tool" ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(34,211,238,0.4)]" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>🛠️ MCP Tool Agent</span>
              </button>
              <button
                onClick={() => handleSwitchMode("multiagent")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition cursor-pointer ${
                  mode === "multiagent" ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(34,211,238,0.4)]" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>🤖 Multi-Agent Pipeline</span>
              </button>
              <button
                onClick={() => handleSwitchMode("compare")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition cursor-pointer ${
                  mode === "compare" ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(34,211,238,0.4)]" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>⚖️ A/B Benchmark</span>
              </button>
            </div>

            {/* Primary Investigation View Selector - Layer Analytics is first in series */}
            <div className="flex items-center rounded-lg border border-cyan-500/30 bg-[#081022] p-0.5 text-xs font-mono">
              <button
                onClick={() => setPrimaryView("ANALYSIS")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-bold transition cursor-pointer ${
                  primaryView === "ANALYSIS"
                    ? "bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                    : "text-slate-300 hover:text-cyan-300"
                }`}
              >
                <span>🔬 Layer Analytics</span>
              </button>
              <button
                onClick={() => setPrimaryView("GRAPH")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-bold transition cursor-pointer ${
                  primaryView === "GRAPH"
                    ? "bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                    : "text-slate-300 hover:text-cyan-300"
                }`}
              >
                <span>🌐 Topology Graph</span>
              </button>
              <button
                onClick={() => setPrimaryView("WORKFLOW")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-bold transition cursor-pointer ${
                  primaryView === "WORKFLOW"
                    ? "bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                    : "text-slate-300 hover:text-cyan-300"
                }`}
              >
                <span>📊 Step-by-Step Workflow</span>
              </button>
              <button
                onClick={() => setPrimaryView("WATERFALL")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-bold transition cursor-pointer ${
                  primaryView === "WATERFALL"
                    ? "bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                    : "text-slate-300 hover:text-cyan-300"
                }`}
              >
                <span>⏱️ Trace Waterfall</span>
              </button>
            </div>
          </div>

          {/* Active Mode Explanation Ribbon */}
          <div className="flex items-center justify-between rounded border border-white/[0.06] bg-[#070d18] px-3.5 py-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold uppercase">
                {mode === "stream" && "⚡ Direct Stream Mode:"}
                {mode === "tool" && "🛠️ MCP Tool Agent Mode:"}
                {mode === "multiagent" && "🤖 Multi-Agent Pipeline Mode:"}
                {mode === "compare" && "⚖️ A/B Comparative Benchmark:"}
              </span>
              <span className="text-slate-300">
                {mode === "stream" && "Real-time SSE token stream with inter-token timing and KV cache tracking via /api/nvidia/stream"}
                {mode === "tool" && "Autonomous agent with live MCP tools (Calculator, Tokyo Weather, System Profiler) via /api/nvidia/agent"}
                {mode === "multiagent" && "3-stage pipeline (Planner Agent → Specialist Agent → Synthesizer) via /api/nvidia/multiagent"}
                {mode === "compare" && "Parallel dual-model execution comparing latency, tokens, and output via /api/nvidia/compare"}
              </span>
            </div>
            <button
              onClick={() => handleExecute()}
              disabled={isExecuting || !prompt.trim()}
              className="text-cyan-300 hover:text-cyan-200 underline font-bold cursor-pointer whitespace-nowrap ml-2"
            >
              Run {mode.toUpperCase()} ↵
            </button>
          </div>

          {/* Bottom row: Prompt Input, Model Selector, Run Button */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            {/* Prompt Input */}
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 font-mono text-cyan-400 font-bold text-xs">
                &gt;
              </span>
              <input
                type="text"
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="Ask any question to observe execution, layer-by-layer neural processing, and tokens..."
                disabled={isExecuting}
                className="w-full rounded-lg border border-white/[0.12] bg-[#090f1f] py-2 pl-7 pr-3 text-xs text-slate-100 placeholder-slate-500 transition focus:border-cyan-400 focus:bg-[#0c152c] focus:outline-none focus:ring-1 focus:ring-cyan-400 font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    handleExecute();
                  }
                }}
              />
            </div>

            {/* Model Selector A */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#090f1f] px-2.5 py-1.5 text-xs">
                <span className="text-xs font-mono text-slate-300 font-medium">
                  {mode === "compare" ? "MODEL A:" : "MODEL:"}
                </span>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={isExecuting || loadingModels}
                  className="max-w-[210px] truncate bg-transparent font-mono text-xs text-cyan-300 focus:outline-none cursor-pointer font-medium"
                >
                  {loadingModels ? (
                    <option>Loading models...</option>
                  ) : (
                    models.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#0b1222] text-slate-200">
                        {m.isFeatured ? "★ " : ""}{m.id}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Model Selector B (Only in compare mode) */}
              {mode === "compare" && (
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#090f1f] px-2.5 py-1.5 text-xs">
                  <span className="text-xs font-mono text-slate-300 font-medium">MODEL B:</span>
                  <select
                    value={selectedModelB}
                    onChange={(e) => handleModelBChange(e.target.value)}
                    disabled={isExecuting || loadingModels}
                    className="max-w-[210px] truncate bg-transparent font-mono text-xs text-amber-300 focus:outline-none cursor-pointer font-medium"
                  >
                    {models.map((m) => (
                      <option key={`b-${m.id}`} value={m.id} className="bg-[#0b1222] text-slate-200">
                        {m.isFeatured ? "★ " : ""}{m.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              {isExecuting ? (
                <button
                  onClick={() => abortControllerRef.current?.abort()}
                  className="flex items-center gap-2 rounded-lg bg-rose-600/80 hover:bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition active:scale-95 cursor-pointer shadow-[0_0_12px_rgba(225,29,72,0.4)]"
                >
                  <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>
                  ABORT
                </button>
              ) : (
                <button
                  onClick={() => handleExecute()}
                  disabled={!prompt.trim()}
                  className="flex items-center gap-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 px-5 py-2 text-xs font-black text-slate-950 tracking-wider shadow-[0_0_15px_rgba(34,211,238,0.4)] transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>EXECUTE</span>
                  <span className="text-xs font-mono opacity-80">↵</span>
                </button>
              )}
            </div>
          </div>

          {/* Expandable Parameter Drawer */}
          {showSettings && (
            <div className="mt-1 flex flex-wrap items-center gap-4 rounded-lg border border-cyan-500/20 bg-[#080d1a] p-3.5 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-300 text-xs font-medium">Temperature:</span>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="accent-cyan-400 cursor-pointer w-24"
                />
                <span className="text-cyan-300 font-bold">{temperature.toFixed(2)}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-300 text-xs font-medium">Max Tokens:</span>
                <input
                  type="number"
                  min="32"
                  max="1024"
                  step="32"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value) || 256)}
                  className="w-20 rounded border border-white/[0.1] bg-[#0b1222] px-2 py-1 text-center text-cyan-300 focus:outline-none text-xs font-semibold"
                />
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <span className="text-slate-300 text-xs font-medium">System:</span>
                <input
                  type="text"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="flex-1 rounded border border-white/[0.1] bg-[#0b1222] px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="rounded border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-mono text-rose-300 flex items-center justify-between">
              <span>⚠️ {errorMessage}</span>
              <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold ml-2">✕</button>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================= */}
      {/* 3. CORE OBSERVATORY WORKSPACE                                 */}
      {/* ============================================================= */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Main Content Area */}
        <section className="relative flex flex-1 flex-col overflow-hidden bg-[#03060c]">
          {/* Replay Control Floating Bar (Available across views) */}
          <div className="z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#060a14] px-4 py-2 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300 uppercase font-bold tracking-wider">
                EXECUTION REPLAY:
              </span>
              <button
                onClick={() => setIsPlayingReplay(!isPlayingReplay)}
                className="flex h-6 w-6 items-center justify-center rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 cursor-pointer font-bold text-xs"
                title={isPlayingReplay ? "Pause" : "Play Execution Replay"}
              >
                {isPlayingReplay ? "❚❚" : "▶"}
              </button>
              <input
                type="range"
                min="10"
                max="100"
                value={replayStep}
                onChange={(e) => {
                  setReplayStep(parseInt(e.target.value));
                  setIsPlayingReplay(false);
                }}
                className="w-32 accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs text-cyan-300 w-10 text-right font-bold">{replayStep}%</span>
              <span className="text-xs text-slate-400">
                ({visibleNodesCount}/{liveNodes.length} nodes, {displayedTokens.length} tokens)
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs text-slate-400 font-medium">TRACE ID:</span>
              <span className="rounded bg-[#0a1224] border border-white/[0.08] px-2.5 py-0.5 text-xs text-cyan-300 font-mono font-medium">
                {activeTraceId}
              </span>
            </div>
          </div>

          {/* VIEW: COMPREHENSIVE 13-ZONE LAYER ANALYTICS & FORENSIC PIPELINE */}
          {primaryView === "ANALYSIS" && (
            <LayerAnalyticsPipeline
              prompt={prompt}
              setPrompt={setPrompt}
              mode={mode}
              onSwitchMode={handleSwitchMode}
              isExecuting={isExecuting}
              selectedModel={selectedModel}
              selectedModelB={selectedModelB}
              systemPrompt={systemPrompt}
              temperature={temperature}
              maxTokens={maxTokens}
              liveDurationMs={liveDurationMs}
              liveTtftMs={liveTtftMs}
              liveThroughput={liveThroughput}
              liveTokensIn={liveTokensIn}
              liveTokensOut={displayedTokens.length || liveTokensOut}
              liveCachedTokens={liveCachedTokens}
              liveOutput={displayedOutput}
              liveTokens={displayedTokens.length > 0 ? displayedTokens : liveTokens}
              dynamicPromptTokens={dynamicPromptTokens}
              combinedTokens={combinedTokens}
              kvCacheStats={kvCacheStats}
              activeTraceId={activeTraceId}
              liveNodes={liveNodes}
              liveConnections={liveConnections}
              liveLogs={liveLogs}
              activeToolExecutions={mode === "tool" ? activeToolExecutions : []}
              activeAgentBreakdown={mode === "multiagent" ? activeAgentBreakdown : []}
              liveCompareData={mode === "compare" ? liveCompareData : undefined}
              onExecute={() => handleExecute()}
              onCopyAnswer={handleCopyAnswer}
              copiedAnswer={copiedAnswer}
            />
          )}

          {/* VIEW: VISUAL STEP-BY-STEP WORKFLOW FLOWCHART */}
          {primaryView === "WORKFLOW" && (
            <WorkflowFlowchart
              mode={mode}
              isExecuting={isExecuting}
              durationMs={liveDurationMs}
              ttftMs={liveTtftMs}
              throughput={liveThroughput}
              tokensIn={liveTokensIn}
              tokensOut={displayedTokens.length || liveTokensOut}
              selectedModel={selectedModel}
              selectedModelB={selectedModelB}
              prompt={prompt}
              liveOutput={displayedOutput}
              liveTokens={displayedTokens.length > 0 ? displayedTokens : liveTokens}
              kvCacheStats={kvCacheStats}
              modelSpecs={modelSpecs}
              activeTraceId={activeTraceId}
              activeToolExecutions={mode === "tool" ? activeToolExecutions : []}
              activeAgentBreakdown={mode === "multiagent" ? activeAgentBreakdown : []}
              liveCompareData={mode === "compare" ? liveCompareData : undefined}
              selectedStepId={selectedNodeId}
              replayStep={replayStep}
              onSelectStep={(stepId) => {
                const mappedNodeId = getMappedNodeId(stepId, mode);
                setSelectedNodeId(mappedNodeId);
                setShowInspector(true);
              }}
            />
          )}

          {/* VIEW MODE 2: TOPOLOGICAL EXECUTION GRAPH */}
          {primaryView === "GRAPH" && (
            <div className="relative flex flex-1 flex-col overflow-hidden h-full w-full">
              {/* Optional Flowchart Banner docked above the Topology Canvas */}
              {showWorkflowOverlay && (
                <WorkflowFlowchart
                  mode={mode}
                  compact={true}
                  isExecuting={isExecuting}
                  durationMs={liveDurationMs}
                  ttftMs={liveTtftMs}
                  throughput={liveThroughput}
                  tokensIn={liveTokensIn}
                  tokensOut={displayedTokens.length || liveTokensOut}
                  selectedModel={selectedModel}
                  selectedModelB={selectedModelB}
                  prompt={prompt}
                  liveOutput={displayedOutput}
                  liveTokens={displayedTokens.length > 0 ? displayedTokens : liveTokens}
                  kvCacheStats={kvCacheStats}
                  modelSpecs={modelSpecs}
                  activeTraceId={activeTraceId}
                  activeToolExecutions={mode === "tool" ? activeToolExecutions : []}
                  activeAgentBreakdown={mode === "multiagent" ? activeAgentBreakdown : []}
                  liveCompareData={mode === "compare" ? liveCompareData : undefined}
                  selectedStepId={selectedNodeId}
                  replayStep={replayStep}
                  onSelectStep={(stepId) => {
                    const mappedNodeId = getMappedNodeId(stepId, mode);
                    setSelectedNodeId(mappedNodeId);
                    setShowInspector(true);
                  }}
                />
              )}

              <div
                className="relative flex flex-1 flex-col overflow-hidden bg-[#03060c] cursor-grab active:cursor-grabbing select-none h-full w-full"
                onMouseDown={handleMouseDownCanvas}
                onMouseMove={handleMouseMoveCanvas}
                onMouseUp={handleMouseUpCanvas}
              >
                {/* Canvas Controls */}
                <div className="absolute top-3 left-4 z-20 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#070c18]/90 p-0.5 backdrop-blur-sm text-xs font-mono text-slate-300">
                    <button
                      onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                      className="px-2 py-1 hover:text-cyan-300 transition cursor-pointer"
                      title="Zoom Out"
                    >
                      -
                    </button>
                    <span className="px-1 text-xs text-slate-300 font-medium">{Math.round(zoom * 100)}%</span>
                    <button
                      onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))}
                      className="px-2 py-1 hover:text-cyan-300 transition cursor-pointer"
                      title="Zoom In"
                    >
                      +
                    </button>
                    <button
                      onClick={() => {
                        setPan({ x: 40, y: 30 });
                        setZoom(1);
                      }}
                      className="border-l border-white/[0.08] px-2.5 py-1 text-xs text-slate-300 hover:text-cyan-300 cursor-pointer font-medium"
                      title="Reset Canvas"
                    >
                      Reset
                    </button>
                  </div>

                  <button
                    onClick={() => setShowWorkflowOverlay((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono backdrop-blur-sm transition cursor-pointer font-medium ${
                      showWorkflowOverlay
                        ? "border-cyan-400/50 bg-cyan-950/70 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                        : "border-white/[0.08] bg-[#070c18]/90 text-slate-300 hover:text-white"
                    }`}
                    title="Toggle Workflow Flowchart Banner"
                  >
                    <span>📊 Flowchart Strip</span>
                    <span className="text-xs">{showWorkflowOverlay ? "▲" : "▼"}</span>
                  </button>
                </div>

              {/* Dynamic SVG Connections & Spatial Nodes */}
              <div
                className="h-full w-full spatial-canvas-grid relative"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                }}
              >
                <svg className="pointer-events-none absolute inset-0 h-[2000px] w-[3000px] overflow-visible">
                  <defs>
                    <linearGradient id="edge-grad-active" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="1" />
                    </linearGradient>
                  </defs>

                  {liveConnections.map((conn) => {
                    const sourceNode = liveNodes.find((n) => n.id === conn.source);
                    const targetNode = liveNodes.find((n) => n.id === conn.target);
                    if (!sourceNode || !targetNode) return null;

                    const sx = sourceNode.x + 160;
                    const sy = sourceNode.y + 40;
                    const tx = targetNode.x;
                    const ty = targetNode.y + 40;
                    const dx = tx - sx;
                    const path = `M ${sx} ${sy} C ${sx + dx * 0.4} ${sy}, ${tx - dx * 0.4} ${ty}, ${tx} ${ty}`;

                    const isActive = conn.status === "active" || isExecuting;

                    return (
                      <g key={conn.id}>
                        <path
                          d={path}
                          fill="none"
                          stroke={isActive ? "url(#edge-grad-active)" : "#1e293b"}
                          strokeWidth={isActive ? 2.5 : 1.5}
                          strokeOpacity={isActive ? 0.8 : 0.6}
                        />
                        {isActive && (
                          <path
                            d={path}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth={3}
                            className="animate-data-flow"
                            filter="drop-shadow(0 0 4px #22d3ee)"
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>

                {activeNodes.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  const isRunning = node.status === "running";
                  const isCompleted = node.status === "completed";
                  const isFailed = node.status === "failed";

                  return (
                    <div
                      key={node.id}
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        if (!showInspector) setShowInspector(true);
                      }}
                      style={{ left: `${node.x}px`, top: `${node.y}px` }}
                      className={`spatial-node-element absolute w-[160px] cursor-pointer rounded-xl border p-3 transition-all duration-150 ${
                        isSelected
                          ? "border-cyan-400 bg-[#0d1629] shadow-[0_0_25px_rgba(34,211,238,0.35)] scale-105 z-20"
                          : "border-white/[0.1] bg-[#070d1a] hover:border-cyan-400/40 hover:bg-[#0b1426]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-mono font-bold tracking-wide text-cyan-300">
                          {getNodeCategoryName(node)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0"
                            title={`Status: ${node.status}`}
                          >
                            {isCompleted ? (
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                            ) : isRunning ? (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                              </>
                            ) : isFailed ? (
                              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                            ) : (
                              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                            )}
                          </span>
                          <span className="text-xs font-mono font-medium text-slate-300">
                            {node.durationMs}ms
                          </span>
                        </div>
                      </div>

                      <h4 className="text-xs font-bold truncate mb-0.5 text-slate-100">
                        {node.label}
                      </h4>
                      <p className="text-xs font-mono truncate text-slate-400">
                        {node.sublabel}
                      </p>

                      <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-1.5 text-xs font-mono">
                        <span className="text-slate-300 font-medium">
                          {getNodeStageName(node)}
                        </span>
                        {node.resources.tokensIn !== undefined && node.resources.tokensIn > 0 && (
                          <span className="text-emerald-400 font-bold">
                            {node.resources.tokensIn} tok
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* VIEW MODE 3: TRACE WATERFALL TIMELINE */}
          {primaryView === "WATERFALL" && (
            <div className="h-full w-full overflow-y-auto p-6 font-mono text-xs">
        <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100">Distributed Trace Timeline</h3>
              <p className="text-xs text-slate-300 mt-0.5">Span start offsets, concurrency, and hierarchy</p>
            </div>
            <div className="text-right text-xs">
              <span className="text-slate-400">Total Duration: </span>
              <strong className="text-cyan-300 font-bold text-sm">{liveDurationMs}ms</strong>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {liveNodes.map((node, idx) => {
              const totalTimelineDur = Math.max(liveDurationMs, liveNodes.reduce((sum, n) => sum + (n.durationMs || 0), 0), 1);
              const cumulativePrevDur = liveNodes.slice(0, idx).reduce((sum, n) => sum + (n.durationMs || 0), 0);
              const startOffsetPct = Math.min(88, (cumulativePrevDur / totalTimelineDur) * 90);
              const widthPct = Math.max(6, Math.min(100 - startOffsetPct, ((node.durationMs || 1) / totalTimelineDur) * 90));

              return (
                <div
                  key={node.id}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    if (!showInspector) setShowInspector(true);
                  }}
                  className={`group flex items-center gap-3 rounded-lg p-2.5 transition cursor-pointer ${
                    selectedNode?.id === node.id ? "bg-cyan-500/10 border border-cyan-400/30" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="w-52 truncate text-xs flex items-center gap-2">
                    <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                      {node.status === "completed" ? (
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      ) : node.status === "running" ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                        </>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-slate-500" />
                      )}
                    </span>
                    <span className="text-cyan-400 font-bold shrink-0">{node.type.toUpperCase()}</span>
                    <span className="text-slate-200 font-medium truncate">{node.label}</span>
                  </div>

                  <div className="relative flex-1 h-6 rounded bg-[#03060c] overflow-hidden">
                    <div
                      style={{ left: `${startOffsetPct}%`, width: `${widthPct}%` }}
                      className={`absolute inset-y-0 rounded transition-all duration-300 ${
                        node.status === "completed"
                          ? "bg-gradient-to-r from-emerald-500/80 to-emerald-400/90 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                          : node.status === "running"
                          ? "bg-amber-400 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.85)]"
                          : node.status === "failed"
                          ? "bg-rose-500/80"
                          : "bg-slate-700/60"
                      }`}
                    ></div>
                  </div>

                  <div className="w-16 text-right text-xs font-bold text-slate-200">
                    {node.durationMs}ms
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}
        </section>

        {/* ============================================================= */}
        {/* 4. RIGHT-SIDE DEEP FORENSIC INSPECTOR PANEL                   */}
        {/* ============================================================= */}
        {showInspector && (
          <aside className="z-20 w-80 lg:w-96 shrink-0 border-l border-white/[0.08] bg-[#060a14] flex flex-col overflow-hidden">
            {selectedNode ? (
              <>
                {/* Inspector Header */}
                <div className="border-b border-white/[0.08] p-4 bg-[#080d1a]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold">
                      Operation Forensic Inspector
                    </span>
                    <span className="rounded px-2 py-0.5 text-xs font-mono font-bold uppercase flex items-center gap-1.5 bg-slate-900 border border-slate-700 text-slate-300">
                      <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                        {selectedNode.status === "completed" ? (
                          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                        ) : selectedNode.status === "running" ? (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                          </>
                        ) : selectedNode.status === "failed" ? (
                          <span className="h-2 w-2 rounded-full bg-rose-400" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-slate-500" />
                        )}
                      </span>
                      <span>{selectedNode.status}</span>
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-100 truncate">{selectedNode.label}</h3>
                  <p className="text-xs font-mono text-slate-300 truncate mt-0.5">{selectedNode.sublabel}</p>
                </div>

                {/* Unified Inspector Body */}
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-4">
                  {/* Identity & Traceparent */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3.5 space-y-2 text-xs">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider pb-1.5 border-b border-white/[0.06]">
                      Distributed Trace Identity
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs font-semibold mb-0.5">STAGE & IDENTIFIER</span>
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-300 font-bold text-xs">{getNodeStageName(selectedNode)}</span>
                        <span className="text-slate-400 text-xs">({selectedNode.spanId.replace(/^span-/, "")})</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs font-semibold mb-0.5">PARENT SPAN</span>
                      <span className="text-slate-300 text-xs">{selectedNode.parentSpanId || "null (Root Execution)"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs font-semibold mb-0.5">TRACE ID</span>
                      <span className="text-amber-300 break-all text-xs font-medium">{selectedNode.identity.traceId}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs font-semibold mb-0.5">W3C TRACEPARENT</span>
                      <span className="text-slate-200 break-all text-xs font-mono">
                        00-{selectedNode.identity.traceId.replace(/-/g, "").padEnd(32, "0")}-{selectedNode.spanId.replace(/-/g, "").padEnd(16, "0")}-01
                      </span>
                    </div>
                  </div>

                  {/* Operation Details */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3.5 space-y-2 text-xs">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider pb-1.5 border-b border-white/[0.06]">
                      Operation Specification
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs font-semibold mb-0.5">OPERATION NAME</span>
                      <span className="text-slate-100 font-bold text-xs">{selectedNode.operation.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs font-semibold mb-0.5">DETAILS</span>
                      <span className="text-slate-300 text-xs leading-relaxed">{selectedNode.operation.details}</span>
                    </div>
                    {selectedNode.operation.logicMetadata && (
                      <div>
                        <span className="text-slate-400 block text-xs font-semibold mb-1">EXECUTION INVARIANTS</span>
                        <ul className="list-disc list-inside text-slate-300 space-y-1 text-xs">
                          {selectedNode.operation.logicMetadata.map((rule, i) => (
                            <li key={i}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Payloads */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3.5 space-y-3 text-xs">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider pb-1.5 border-b border-white/[0.06]">
                      Payload Inspection
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
                        <span>INPUT ({selectedNode.input.type})</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyInspectorInput}
                            className="flex items-center gap-1 rounded bg-[#0b1329] border border-cyan-700/50 px-2 py-0.5 text-[11px] font-mono text-cyan-300 hover:bg-cyan-900/60 hover:text-cyan-100 hover:border-cyan-400 transition cursor-pointer font-medium"
                            title="Copy input payload"
                          >
                            {copiedInspectorInput ? (
                              <>
                                <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-emerald-400 font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <span className="text-cyan-400 font-semibold">{selectedNode.input.sizeBytes} bytes</span>
                        </div>
                      </div>
                      <pre className="rounded border border-white/[0.06] bg-[#03060c] p-2.5 text-slate-200 overflow-x-auto text-xs max-h-40 whitespace-pre-wrap break-words leading-relaxed font-mono">
                        {typeof selectedNode.input.data === "string"
                          ? selectedNode.input.data || "(No input data)"
                          : JSON.stringify(selectedNode.input.data, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
                        <span>OUTPUT ({selectedNode.output.type})</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyInspectorOutput}
                            className="flex items-center gap-1 rounded bg-[#0b1329] border border-emerald-600/60 px-2 py-0.5 text-[11px] font-mono text-emerald-300 hover:bg-emerald-900/60 hover:text-emerald-100 hover:border-emerald-400 transition cursor-pointer font-medium shadow-sm"
                            title="Copy output text to clipboard"
                          >
                            {copiedInspectorOutput ? (
                              <>
                                <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-emerald-400 font-semibold">Copied!</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span>Copy Output</span>
                              </>
                            )}
                          </button>
                          <span className="text-emerald-400 font-semibold">{selectedNode.output.sizeBytes} bytes</span>
                        </div>
                      </div>
                      <div className="relative group">
                        <pre className="rounded border border-white/[0.06] bg-[#03060c] p-2.5 text-cyan-200 overflow-x-auto text-xs max-h-56 whitespace-pre-wrap break-words leading-relaxed font-mono pr-10">
                          {typeof selectedNode.output.data === "string"
                            ? selectedNode.output.data || "(No output data)"
                            : JSON.stringify(selectedNode.output.data, null, 2)}
                        </pre>
                        {Boolean(selectedNode.output.data) && (
                          <button
                            type="button"
                            onClick={handleCopyInspectorOutput}
                            className="absolute top-2 right-2 p-1.5 rounded bg-[#091122]/90 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-950 hover:text-white hover:border-emerald-300 transition cursor-pointer shadow opacity-80 group-hover:opacity-100"
                            title="Copy output text"
                          >
                            {copiedInspectorOutput ? (
                              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Performance & Token Ledger */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3.5 space-y-2 text-xs">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider pb-1.5 border-b border-white/[0.06]">
                      Performance & Token Accounting
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Duration:</span>
                      <strong className="text-cyan-300 font-bold text-xs">{selectedNode.durationMs}ms</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Tokens In / Out:</span>
                      <span className="text-slate-200 text-xs">
                        <strong className="text-cyan-300">{selectedNode.resources.tokensIn || 0}</strong> in /{" "}
                        <strong className="text-emerald-300">{selectedNode.resources.tokensOut || 0}</strong> out
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Measurement Source:</span>
                      <span className="rounded bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 text-xs font-bold">
                        {selectedNode.resources.classification || "ACTUAL"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-white/[0.06] pt-1.5">
                      <span className="text-slate-400">Estimated Cost:</span>
                      <strong className="text-emerald-400 font-bold text-xs">
                        ${(((selectedNode.resources.tokensIn || 0) * 0.000002 + (selectedNode.resources.tokensOut || 0) * 0.000006)).toFixed(6)}
                      </strong>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 text-slate-500 font-mono text-xs">No node selected.</div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}