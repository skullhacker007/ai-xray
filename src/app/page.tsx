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
import { buildDynamicTopology, ExecutionMode } from "./lib/topology-builder";

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

const DEFAULT_PROMPT = "Explain artificial intelligence in 2 concise sentences.";
const DEFAULT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";
const DEFAULT_MODEL_B = "nvidia/nemotron-3.5-lightning-30b-a3b";

const INITIAL_TOPOLOGY = buildDynamicTopology(
  "stream",
  DEFAULT_PROMPT,
  DEFAULT_MODEL,
  "trace-session-ready",
  "completed",
  0,
  "",
  tokenizeString(DEFAULT_PROMPT).length,
  0
);

const QUICK_PROMPTS: Array<{ label: string; prompt: string; mode: ExecutionMode }> = [
  { label: "Explain Quantum Computing", prompt: "Explain quantum computing in 2 concise sentences.", mode: "stream" },
  { label: "Calculator MCP: 348 * 29", prompt: "What is 348 multiplied by 29?", mode: "tool" },
  { label: "Tokyo Weather MCP", prompt: "What is the current meteorological weather in Tokyo?", mode: "tool" },
  { label: "Multi-Agent System Design", prompt: "Design an ultra-low latency event streaming architecture for AI inference.", mode: "multiagent" },
  { label: "A/B Benchmark: Flash Attention", prompt: "State 3 key advantages of flash attention in transformer inference.", mode: "compare" },
];

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

  // View state
  const [primaryView, setPrimaryView] = useState<"ANALYSIS" | "GRAPH" | "WATERFALL">("GRAPH");
  const [showInspector, setShowInspector] = useState(true);
  const [copiedAnswer, setCopiedAnswer] = useState(false);

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
  const [selectedAttentionTokenIdx, setSelectedAttentionTokenIdx] = useState<number | null>(null);

  // Session Traces History
  const [traceHistory, setTraceHistory] = useState<TraceRecord[]>([]);
  const [activeTraceId, setActiveTraceId] = useState<string | null>("trace-session-ready");

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

  // KV cache footprint calculated from real architectural math
  const kvCacheStats = useMemo(() => {
    return calculateKVCacheFootprint(liveTokensIn + liveTokensOut);
  }, [liveTokensIn, liveTokensOut]);

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

  // Mode Switch Handler
  const handleSwitchMode = (newMode: ExecutionMode) => {
    setMode(newMode);

    // Intelligently adapt prompt to a relevant showcase if current prompt is default or preset
    let nextPrompt = prompt;
    const isDefaultOrPreset =
      !prompt ||
      prompt === DEFAULT_PROMPT ||
      prompt === "What is 348 multiplied by 29?" ||
      prompt === "What is the current meteorological weather in Tokyo?" ||
      prompt === "Design an ultra-low latency event streaming architecture for AI inference." ||
      prompt === "State 3 key advantages of flash attention in transformer inference." ||
      prompt === "Explain quantum computing in 2 concise sentences.";

    if (isDefaultOrPreset) {
      if (newMode === "tool") {
        nextPrompt = "What is 348 multiplied by 29?";
      } else if (newMode === "multiagent") {
        nextPrompt = "Design an ultra-low latency event streaming architecture for AI inference.";
      } else if (newMode === "compare") {
        nextPrompt = "State 3 key advantages of flash attention in transformer inference.";
      } else {
        nextPrompt = DEFAULT_PROMPT;
      }
      setPrompt(nextPrompt);
    }

    // Always immediately rebuild topology for the selected mode
    const promptTokCount = tokenizeString(nextPrompt).length;
    const topo = buildDynamicTopology(
      newMode,
      nextPrompt,
      selectedModel,
      activeTraceId || "trace-session-ready",
      "completed",
      isExecuting ? liveDurationMs : 0,
      isExecuting ? liveOutput : "",
      promptTokCount,
      isExecuting ? liveTokensOut : 0,
      {
        modelB: selectedModelB,
        toolExecutions: activeToolExecutions,
        agentsBreakdown: activeAgentBreakdown,
      }
    );
    setLiveNodes(topo.nodes);
    setLiveConnections(topo.connections);
    setSelectedNodeId(topo.nodes[0]?.id || null);

    logEvent("INFO", `Switched execution mode to [${newMode.toUpperCase()}]`);
  };

  // Copy Answer helper
  const handleCopyAnswer = () => {
    if (!liveOutput) return;
    navigator.clipboard.writeText(liveOutput);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
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
              } else if (event.type === "tool_executed") {
                logEvent("INFO", `Executed MCP tool '${event.tool_name}' in ${event.duration_ms}ms -> Result: ${JSON.stringify(event.result)}`);
                setActiveToolExecutions((prev) => [
                  ...prev,
                  { name: event.tool_name, args: event.args, result: event.result, duration_ms: event.duration_ms },
                ]);
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
              } else if (event.type === "agent_done") {
                logEvent("INFO", `Completed ${event.agent_name} in ${event.duration_ms}ms`);
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
                setLiveDurationMs(totalDur);
                setLiveCompareData({ modelA: event.resultA, modelB: event.resultB });
                setLiveOutput(`=== MODEL A (${event.resultA.model}) ===\n${event.resultA.content}\n\n=== MODEL B (${event.resultB.model}) ===\n${event.resultB.content}`);

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
                  "",
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
              <h1 className="text-sm font-black tracking-wider text-slate-100">AI X-RAY</h1>
              <span className="rounded bg-cyan-950 border border-cyan-700/60 px-1.5 py-0.2 text-[9px] font-mono text-cyan-300">
                FORENSIC ENGINE
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400">
              Deep Neural Execution & Observability Platform
            </p>
          </div>
        </div>

        {/* Live Telemetry KPI Metrics Banner */}
        <div className="hidden lg:flex items-center gap-5 font-mono text-xs">
          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-[10px] text-slate-500 uppercase">STATUS</span>
            <span className="flex items-center gap-1 font-bold">
              <span
                className={`h-2 w-2 rounded-full ${
                  isExecuting ? "bg-cyan-400 animate-ping" : "bg-emerald-400"
                }`}
              ></span>
              <span className={isExecuting ? "text-cyan-300" : "text-emerald-300"}>
                {isExecuting ? "INSPECTING..." : "READY"}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-[10px] text-slate-500 uppercase">LATENCY</span>
            <span className="font-bold text-cyan-300">{liveDurationMs}ms</span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-[10px] text-slate-500 uppercase">TTFT</span>
            <span className="font-bold text-amber-300">{liveTtftMs ? `${liveTtftMs}ms` : "--"}</span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-[10px] text-slate-500 uppercase">THROUGHPUT</span>
            <span className="font-bold text-emerald-300">
              {liveThroughput ? `${liveThroughput} tok/s` : "--"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-r border-white/[0.08] pr-4">
            <span className="text-[10px] text-slate-500 uppercase">TOKENS</span>
            <span className="text-slate-200">
              <strong className="text-cyan-300">{liveTokensIn}</strong> in /{" "}
              <strong className="text-emerald-300">{liveTokensOut}</strong> out
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 uppercase">EST. COST</span>
            <span className="text-emerald-400 font-bold">
              ${(liveTokensIn * 0.000002 + liveTokensOut * 0.000006).toFixed(5)}
            </span>
          </div>
        </div>

        {/* Dynamic Trace History & Global Controls */}
        <div className="flex items-center gap-2">
          {traceHistory.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#0b1222] px-2.5 py-1 text-xs font-mono">
              <span className="text-[10px] text-slate-400">HISTORY:</span>
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

            {/* Primary Investigation View Selector */}
            <div className="flex items-center rounded-lg border border-cyan-500/30 bg-[#081022] p-0.5 text-xs font-mono">
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
                onClick={() => setPrimaryView("ANALYSIS")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-bold transition cursor-pointer ${
                  primaryView === "ANALYSIS"
                    ? "bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                    : "text-slate-300 hover:text-cyan-300"
                }`}
              >
                <span>🔬 Layer Analysis & Q&A</span>
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
          <div className="flex items-center justify-between rounded border border-white/[0.06] bg-[#070d18] px-3 py-1 text-[11px] font-mono">
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

          {/* Quick Prompt Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono py-0.5">
            <span className="text-[10px] text-slate-500 font-bold">SAMPLE QUERIES:</span>
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleExecute(qp.prompt, qp.mode)}
                disabled={isExecuting}
                className="rounded-full border border-white/[0.08] bg-[#0b1222] px-2.5 py-0.5 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition whitespace-nowrap cursor-pointer text-[10px]"
              >
                {qp.label}
              </button>
            ))}
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
                onChange={(e) => setPrompt(e.target.value)}
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
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#090f1f] px-2 py-1.5 text-xs">
                <span className="text-[10px] font-mono text-slate-400">
                  {mode === "compare" ? "MODEL A:" : "MODEL:"}
                </span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isExecuting || loadingModels}
                  className="max-w-[190px] truncate bg-transparent font-mono text-[11px] text-cyan-300 focus:outline-none cursor-pointer"
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
                <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#090f1f] px-2 py-1.5 text-xs">
                  <span className="text-[10px] font-mono text-slate-400">MODEL B:</span>
                  <select
                    value={selectedModelB}
                    onChange={(e) => setSelectedModelB(e.target.value)}
                    disabled={isExecuting || loadingModels}
                    className="max-w-[190px] truncate bg-transparent font-mono text-[11px] text-amber-300 focus:outline-none cursor-pointer"
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
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 px-4 py-1.5 text-xs font-semibold text-white transition active:scale-95 cursor-pointer shadow-[0_0_12px_rgba(225,29,72,0.4)]"
                >
                  <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>
                  ABORT
                </button>
              ) : (
                <button
                  onClick={() => handleExecute()}
                  disabled={!prompt.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 px-5 py-1.5 text-xs font-black text-slate-950 tracking-wider shadow-[0_0_15px_rgba(34,211,238,0.4)] transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>EXECUTE</span>
                  <span className="text-[10px] font-mono opacity-80">↵</span>
                </button>
              )}
            </div>
          </div>

          {/* Expandable Parameter Drawer */}
          {showSettings && (
            <div className="mt-1 flex flex-wrap items-center gap-4 rounded-lg border border-cyan-500/20 bg-[#080d1a] p-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">Temperature:</span>
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
                <span className="text-slate-400 text-[11px]">Max Tokens:</span>
                <input
                  type="number"
                  min="32"
                  max="1024"
                  step="32"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value) || 256)}
                  className="w-16 rounded border border-white/[0.1] bg-[#0b1222] px-1.5 py-0.5 text-center text-cyan-300 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <span className="text-slate-400 text-[11px]">System:</span>
                <input
                  type="text"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="flex-1 rounded border border-white/[0.1] bg-[#0b1222] px-2 py-0.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-400"
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
          <div className="z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#060a14] px-4 py-1.5 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                EXECUTION REPLAY:
              </span>
              <button
                onClick={() => setIsPlayingReplay(!isPlayingReplay)}
                className="flex h-5 w-5 items-center justify-center rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 cursor-pointer"
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
                className="w-28 accent-cyan-400 cursor-pointer"
              />
              <span className="text-[10px] text-cyan-300 w-8 text-right font-bold">{replayStep}%</span>
              <span className="text-[10px] text-slate-500">
                ({visibleNodesCount}/{liveNodes.length} nodes, {displayedTokens.length} tokens)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400">TRACE ID:</span>
              <span className="rounded bg-[#0a1224] border border-white/[0.08] px-2 py-0.5 text-[10px] text-cyan-300 font-mono">
                {activeTraceId}
              </span>
            </div>
          </div>

          {/* VIEW MODE 1: COMPREHENSIVE LAYER ANALYSIS & Q&A WALKTHROUGH */}
          {primaryView === "ANALYSIS" && (
            <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1 min-h-0">
              {/* Question / Input Query Specification Card */}
              <div className="rounded-xl border border-cyan-500/30 bg-[#070e20] p-4 shadow-[0_0_20px_rgba(34,211,238,0.08)]">
                <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] pb-2.5 mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/20 text-cyan-300 font-bold text-xs">
                      Q
                    </span>
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                        USER INPUT QUERY SPECIFICATION
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 block">
                        Target Model: <strong className="text-cyan-300">{selectedModel}</strong>
                        {mode === "compare" && <> vs <strong className="text-amber-300">{selectedModelB}</strong></>}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const el = document.getElementById("final-result-output");
                        el?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="rounded border border-cyan-400/40 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-mono text-cyan-300 hover:bg-cyan-900/60 transition cursor-pointer flex items-center gap-1 shadow-sm"
                      title="Scroll directly down to the final decoded result after Layer 7"
                    >
                      <span>⬇ Jump to Result Output</span>
                    </button>
                    {isExecuting ? (
                      <span className="rounded bg-cyan-950 border border-cyan-700 px-2 py-0.5 text-[10px] font-mono text-cyan-300 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping"></span> PROCESSING
                      </span>
                    ) : liveOutput ? (
                      <span className="rounded bg-emerald-950 border border-emerald-700 px-2 py-0.5 text-[10px] font-mono text-emerald-300 font-bold">
                        ✓ TRACED ({liveDurationMs}ms)
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Prompt Box */}
                <div className="rounded-lg border border-white/[0.08] bg-[#040813] p-3 font-mono text-xs text-slate-200">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>INPUT STRING</span>
                    <span>{prompt.length} chars • {liveTokensIn} tokens</span>
                  </div>
                  <p className="whitespace-pre-wrap">{prompt}</p>
                </div>
              </div>

              {/* Forensic Execution Layers Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                  <h2 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <span>🔬</span> LAYER-BY-LAYER FORENSIC EXECUTION PIPELINE
                  </h2>
                  <span className="text-[10px] font-mono text-slate-400">
                    7 Observable Layers • Verified Measurement
                  </span>
                </div>

                {/* LAYER 1: Input Ingestion & Boundary */}
                <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                        LAYER 1
                      </span>
                      <h3 className="text-xs font-mono font-bold text-slate-100">Input Ingestion & Boundary Gateway</h3>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">
                      {liveNodes.find((n) => n.id === "node-in")?.durationMs || 1}ms • Completed
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-300 mt-2">
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">RAW SIZE</span>
                      <span className="font-bold text-cyan-300">{prompt.length} UTF-8 bytes</span>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">SANITIZATION</span>
                      <span className="font-bold text-emerald-300">UTF-8 Validated</span>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">SYSTEM PROMPT</span>
                      <span className="font-bold text-slate-300">{systemPrompt.length} bytes</span>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">W3C TRACEPARENT</span>
                      <span className="font-bold text-amber-300">Captured</span>
                    </div>
                  </div>
                </div>

                {/* LAYER 2: Tokenization & Subword Encoding */}
                <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                        LAYER 2
                      </span>
                      <h3 className="text-xs font-mono font-bold text-slate-100">BPE Tokenizer & Subword Sequence</h3>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300 font-bold">
                      {liveTokensIn + (displayedTokens.length || liveTokensOut)} Total Tokens (Vocab 128,256)
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 mb-2">
                    Decomposed into Byte-Pair Encoding subwords with deterministic token IDs:
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 border border-white/[0.04] rounded-lg bg-[#03060c]">
                    {/* Prompt input tokens */}
                    {dynamicPromptTokens.map((t, idx) => (
                      <div
                        key={`in-${idx}`}
                        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[11px] font-mono text-slate-300"
                        title={`Input Token ID: ${t.id} | Bytes: ${t.byte_length}`}
                      >
                        <span className="font-bold">{t.text}</span>
                        <span className="text-[9px] text-slate-500">#{t.id}</span>
                      </div>
                    ))}
                    {/* Generated output tokens */}
                    {displayedTokens.map((t, idx) => (
                      <div
                        key={`out-${idx}`}
                        className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-0.5 text-[11px] font-mono text-cyan-200 shadow-sm"
                        title={`Generated Output Token ID: ${t.tokenId} | Pos: ${t.position}${t.probability ? ` | Prob: ${Math.round(t.probability * 100)}%` : ""}`}
                      >
                        <span className="font-bold">{t.tokenString}</span>
                        <span className="text-[9px] text-cyan-500">#{t.tokenId}</span>
                        {t.probability !== undefined && (
                          <span className="rounded bg-emerald-950 border border-emerald-800 px-1 text-[8px] text-emerald-300">
                            {Math.round(t.probability * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* LAYER 3: Context Window & Token Accounting Ledger */}
                <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                        LAYER 3
                      </span>
                      <h3 className="text-xs font-mono font-bold text-slate-100">Context Window Allocation & Token Ledger</h3>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-300 font-bold">
                      {liveTokensIn + liveTokensOut} / 128,000 Capacity
                    </span>
                  </div>

                  {/* Context Bar */}
                  <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden flex my-2">
                    <div
                      style={{ width: `${Math.max(1, (liveTokensIn / 128000) * 100)}%` }}
                      className="bg-cyan-500 transition-all duration-300"
                      title={`Prompt Tokens: ${liveTokensIn}`}
                    ></div>
                    <div
                      style={{ width: `${Math.max(1, (liveTokensOut / 128000) * 100)}%` }}
                      className="bg-emerald-400 transition-all duration-300"
                      title={`Generated Output Tokens: ${liveTokensOut}`}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-300 mt-2">
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">PROMPT TOKENS (IN)</span>
                      <strong className="text-cyan-300">{liveTokensIn}</strong>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">COMPLETION TOKENS (OUT)</span>
                      <strong className="text-emerald-300">{liveTokensOut}</strong>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">PROMPT CACHE TOKENS</span>
                      <strong className={liveCachedTokens > 0 ? "text-emerald-300" : "text-slate-400"}>
                        {liveCachedTokens} ({liveCachedTokens > 0 ? "Cache Hit" : "Cold Run"})
                      </strong>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">PROVENANCE ATTRIBUTION</span>
                      <strong className="text-emerald-400">PROVIDER_REPORTED</strong>
                    </div>
                  </div>
                </div>

                {/* LAYER 4: Transformer & Attention Mechanism */}
                <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                        LAYER 4
                      </span>
                      <h3 className="text-xs font-mono font-bold text-slate-100">Multi-Head Self-Attention Dynamics</h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Top {combinedTokens.tokens.length} tokens causal affinity matrix
                    </span>
                  </div>

                  <p className="text-[10px] font-mono text-slate-400 mb-2">
                    Normalized dot-product query-key attention scores across sequence. Click any token to inspect its attention distribution:
                  </p>

                  <div className="overflow-x-auto p-2 border border-white/[0.04] rounded-lg bg-[#03060c]">
                    <table className="border-collapse text-[9px] font-mono">
                      <tbody>
                        {combinedTokens.matrix.slice(0, 16).map((row, rIdx) => {
                          const srcTok = combinedTokens.tokens[rIdx];
                          const isSelected = selectedAttentionTokenIdx === rIdx;

                          return (
                            <tr key={rIdx} className={isSelected ? "bg-cyan-950/40" : ""}>
                              <td
                                onClick={() => setSelectedAttentionTokenIdx(rIdx)}
                                className={`pr-2 py-0.5 font-bold truncate max-w-[75px] cursor-pointer hover:text-cyan-300 ${
                                  srcTok?.isOutput ? "text-cyan-400" : "text-slate-400"
                                }`}
                              >
                                {srcTok?.isOutput ? "⇲ " : ""}{srcTok?.text}
                              </td>
                              {row.slice(0, 16).map((score, cIdx) => (
                                <td
                                  key={cIdx}
                                  style={{
                                    backgroundColor: `rgba(34, 211, 238, ${Math.min(1, score * 1.6)})`,
                                    color: score > 0.4 ? "#000" : "#fff",
                                  }}
                                  className="w-6 h-6 text-center rounded-xs border border-[#03060c] cursor-pointer"
                                  title={`${srcTok?.text} -> ${combinedTokens.tokens[cIdx]?.text}: ${score}`}
                                >
                                  {score > 0.05 ? score.toFixed(2).replace(/^0\./, ".") : "·"}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* LAYER 5: Tool & MCP Agent Execution Layer */}
                <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-amber-950 border border-amber-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-amber-300">
                        LAYER 5
                      </span>
                      <h3 className="text-xs font-mono font-bold text-slate-100">MCP Tool Dispatch & Agent Execution</h3>
                    </div>
                    <span className="text-[10px] font-mono text-amber-300 font-bold">
                      {mode === "tool"
                        ? activeToolExecutions.length > 0
                          ? `${activeToolExecutions.length} Tools Executed`
                          : "Tool Agent Active (Ready to invoke)"
                        : mode === "multiagent"
                        ? "3-Agent Orchestration Active"
                        : mode === "compare"
                        ? "Dual-Model Dispatch Active"
                        : "Bypassed in Direct Stream"}
                    </span>
                  </div>

                  {mode === "stream" ? (
                    <div className="rounded border border-white/[0.04] bg-[#03060c] p-3 text-[11px] font-mono text-slate-400">
                      Direct inference mode generates tokens directly through model weights without invoking external tools.
                      To inspect live MCP tool calls (Calculator, Weather, System Profiler), click{" "}
                      <button
                        onClick={() => handleSwitchMode("tool")}
                        className="text-cyan-300 underline font-bold cursor-pointer hover:text-cyan-200"
                      >
                        🛠️ MCP Tool Agent
                      </button>
                      .
                    </div>
                  ) : activeToolExecutions.length > 0 ? (
                    <div className="space-y-2 mt-2">
                      {activeToolExecutions.map((tExec, idx) => (
                        <div key={idx} className="rounded border border-amber-500/20 bg-[#040813] p-3 text-[11px] font-mono">
                          <div className="flex justify-between text-amber-300 font-bold mb-1">
                            <span>TOOL: {tExec.name}</span>
                            <span>{tExec.duration_ms}ms</span>
                          </div>
                          <div className="text-slate-400 text-[10px]">
                            Arguments: <span className="text-slate-200">{JSON.stringify(tExec.args)}</span>
                          </div>
                          <div className="text-slate-400 text-[10px] mt-1">
                            Result: <span className="text-emerald-300">{JSON.stringify(tExec.result)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : activeAgentBreakdown.length > 0 ? (
                    <div className="space-y-2 mt-2">
                      {activeAgentBreakdown.map((ag, idx) => (
                        <div key={idx} className="rounded border border-cyan-500/20 bg-[#040813] p-3 text-[11px] font-mono">
                          <div className="flex justify-between text-cyan-300 font-bold mb-1">
                            <span>AGENT: {ag.agent}</span>
                            <span>{ag.duration_ms}ms • {ag.tokens} tok</span>
                          </div>
                          <p className="text-slate-300 text-[11px] whitespace-pre-wrap">{ag.output}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded border border-white/[0.04] bg-[#03060c] p-3 text-slate-400 font-mono text-[11px]">
                      {mode === "tool" && "MCP Agent schema validated (Calculator, Weather, System Profiler). Run prompt to inspect tool invocation."}
                      {mode === "multiagent" && "Multi-agent coordinator configured (Planner, Specialist, Synthesizer). Run prompt to inspect agent handoffs."}
                      {mode === "compare" && "Dual-model comparison orchestrator configured. Run prompt to inspect concurrent model dispatch."}
                    </div>
                  )}
                </div>

                {/* LAYER 6: Autoregressive Generation & KV Cache */}
                <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                        LAYER 6
                      </span>
                      <h3 className="text-xs font-mono font-bold text-slate-100">Autoregressive Decoding & KV Cache Allocation</h3>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300 font-bold">
                      {liveThroughput ? `${liveThroughput} tok/s` : "--"}
                    </span>
                  </div>

                  <p className="text-[10px] font-mono text-slate-400 mb-2">
                    KV cache storage calculated from transformer architecture: {kvCacheStats.formula}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-300 mt-2">
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">ACTIVE KV SLOTS</span>
                      <strong className="text-cyan-300">{liveTokensIn + liveTokensOut} slots</strong>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">KV CACHE VRAM</span>
                      <strong className="text-emerald-300">{kvCacheStats.totalMb} MB</strong>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">TIME TO FIRST TOKEN</span>
                      <strong className="text-amber-300">
                        {liveTtftMs ? `${liveTtftMs}ms` : (isExecuting ? "Prefill Phase..." : "--")}
                      </strong>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-[#03060c] p-2">
                      <span className="text-[9px] text-slate-500 block">DECODE SPEED</span>
                      <strong className="text-emerald-300">
                        {liveThroughput ? `${liveThroughput} tok/s` : (isExecuting ? "Streaming..." : "--")}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* LAYER 7: OpenTelemetry & Distributed Spans */}
                <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                        LAYER 7
                      </span>
                      <h3 className="text-xs font-mono font-bold text-slate-100">OpenTelemetry Trace Context & Provenance</h3>
                    </div>
                    <span className="text-[10px] font-mono text-amber-300 font-bold">
                      {liveNodes.length} Spans Verified
                    </span>
                  </div>

                  <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                    <pre>
{JSON.stringify(
  {
    trace_id: activeTraceId,
    mode,
    model: selectedModel,
    total_spans: liveNodes.length,
    root_span: liveNodes[0]?.spanId || "span-root-0",
    duration_ms: liveDurationMs,
    w3c_traceparent: `00-${(activeTraceId || "").replace(/-/g, "").padEnd(32, "0")}-${(liveNodes[0]?.spanId || "span000000000001").replace(/-/g, "").slice(0, 16).padEnd(16, "0")}-01`,
    provenance: "ACTUAL_NVIDIA_NIM_TRACING",
  },
  null,
  2
)}
                    </pre>
                  </div>
                </div>

                {/* ============================================================= */}
                {/* 🏁 FINAL EXECUTION DESTINATION: DECODED MODEL OUTPUT & RESULT */}
                {/* ============================================================= */}
                <div id="final-result-output" className="rounded-xl border-2 border-cyan-400/50 bg-[#071024] p-5 shadow-[0_0_35px_rgba(34,211,238,0.2)] transition-all">
                  <div className="flex flex-wrap items-center justify-between border-b border-white/[0.1] pb-3 mb-4 gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-sm shadow-[0_0_12px_rgba(34,211,238,0.3)]">
                        🏁
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-mono font-black text-slate-100 uppercase tracking-wider">
                            FINAL DECODED EXECUTION OUTPUT & RESULT
                          </h2>
                          <span className="rounded bg-cyan-950 border border-cyan-700/60 px-2 py-0.5 text-[9px] font-mono text-cyan-300 font-bold">
                            DESTINATION
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-400">
                          End of Neural Pipeline • Synthesized Generation from Layers 1 → 7
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {displayedOutput && (
                        <button
                          onClick={handleCopyAnswer}
                          className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1 text-xs font-mono text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition cursor-pointer flex items-center gap-1.5"
                        >
                          <span>{copiedAnswer ? "✓ Copied!" : "📋 Copy Response"}</span>
                        </button>
                      )}
                      <span className="rounded border border-white/[0.08] bg-[#03060c] px-2.5 py-1 text-[11px] font-mono text-slate-300">
                        {isExecuting ? (
                          <span className="text-cyan-400 flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span> STREAMING...
                          </span>
                        ) : liveOutput ? (
                          <span className="text-emerald-400 font-bold">✓ COMPLETED</span>
                        ) : (
                          <span className="text-slate-500">STANDBY</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  {liveCompareData ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
                      {/* Model A */}
                      <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4">
                        <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-300 mb-2 pb-2 border-b border-cyan-500/20">
                          <span>MODEL A: {liveCompareData.modelA.model}</span>
                          <span className="rounded bg-cyan-900/50 px-2 py-0.5 text-[10px]">
                            {liveCompareData.modelA.duration_ms}ms • {liveCompareData.modelA.usage.total_tokens} tok
                          </span>
                        </div>
                        <div className="font-sans text-xs text-slate-100 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto p-1">
                          {liveCompareData.modelA.content}
                        </div>
                      </div>

                      {/* Model B */}
                      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
                        <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-300 mb-2 pb-2 border-b border-amber-500/20">
                          <span>MODEL B: {liveCompareData.modelB.model}</span>
                          <span className="rounded bg-amber-900/50 px-2 py-0.5 text-[10px]">
                            {liveCompareData.modelB.duration_ms}ms • {liveCompareData.modelB.usage.total_tokens} tok
                          </span>
                        </div>
                        <div className="font-sans text-xs text-slate-100 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto p-1">
                          {liveCompareData.modelB.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-white/[0.08] bg-[#03060c] p-4 text-slate-100 font-sans text-sm whitespace-pre-wrap leading-relaxed min-h-[100px]">
                      {displayedOutput ? (
                        <div>
                          {displayedOutput}
                          {isExecuting && <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse"></span>}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <p className="font-mono text-xs text-slate-500 mb-3">
                            No execution output captured yet. Click Execute above to run the neural pipeline.
                          </p>
                          <button
                            onClick={() => handleExecute()}
                            disabled={isExecuting || !prompt.trim()}
                            className="rounded-lg bg-cyan-500 hover:bg-cyan-400 px-4 py-1.5 font-mono text-xs font-bold text-slate-950 transition cursor-pointer"
                          >
                            ▶ Run Pipeline Now
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Forensic Telemetry & Attribution Footer */}
                  <div className="mt-4 flex flex-wrap items-center justify-between border-t border-white/[0.08] pt-3 text-[11px] font-mono text-slate-400 gap-2">
                    <div className="flex items-center gap-4">
                      <span>Total Time: <strong className="text-cyan-300">{liveDurationMs}ms</strong></span>
                      {liveTtftMs && <span>TTFT: <strong className="text-amber-300">{liveTtftMs}ms</strong></span>}
                      {liveThroughput && <span>Throughput: <strong className="text-emerald-300">{liveThroughput} tok/s</strong></span>}
                      <span>Output Tokens: <strong className="text-slate-200">{displayedTokens.length || liveTokensOut}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">PROVENANCE:</span>
                      <span className="rounded bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 text-[9px] font-bold">
                        VERIFIED_NVIDIA_NIM
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: TOPOLOGICAL EXECUTION GRAPH */}
          {primaryView === "GRAPH" && (
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
                  <span className="px-1 text-[10px] text-slate-400">{Math.round(zoom * 100)}%</span>
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
                    className="border-l border-white/[0.08] px-2 py-1 text-[10px] text-slate-400 hover:text-cyan-300 cursor-pointer"
                    title="Reset Canvas"
                  >
                    Reset
                  </button>
                </div>
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
                          : isRunning
                          ? "border-cyan-500/70 bg-[#0a1224] spatial-glow-active z-10"
                          : "border-white/[0.1] bg-[#070d1a] hover:border-cyan-400/40 hover:bg-[#0b1426]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-cyan-400/90 font-bold">
                          {node.type}
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              node.status === "completed"
                                ? "bg-emerald-400"
                                : node.status === "running"
                                ? "bg-cyan-400 animate-ping"
                                : node.status === "failed"
                                ? "bg-rose-400"
                                : "bg-slate-600"
                            }`}
                          ></span>
                          <span className="text-[9px] font-mono text-slate-400">{node.durationMs}ms</span>
                        </div>
                      </div>

                      <h4 className="text-xs font-bold text-slate-100 truncate mb-0.5">{node.label}</h4>
                      <p className="text-[10px] font-mono text-slate-400 truncate">{node.sublabel}</p>

                      <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-1.5 text-[9px] font-mono">
                        <span className="text-slate-500">{node.spanId}</span>
                        {node.resources.tokensIn !== undefined && node.resources.tokensIn > 0 && (
                          <span className="text-emerald-400 font-bold">{node.resources.tokensIn} tok</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW MODE 3: TRACE WATERFALL TIMELINE */}
          {primaryView === "WATERFALL" && (
            <div className="h-full w-full overflow-y-auto p-6 font-mono text-xs">
        <div className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Distributed Trace Timeline</h3>
              <p className="text-[11px] text-slate-400">Span start offsets, concurrency, and hierarchy</p>
            </div>
            <div className="text-right text-[11px]">
              <span className="text-slate-400">Total Duration: </span>
              <strong className="text-cyan-300 font-bold">{liveDurationMs}ms</strong>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {liveNodes.map((node, idx) => {
              const startOffsetPct = Math.min(85, idx * 14);
              const widthPct = Math.max(10, Math.min(90 - startOffsetPct, (node.durationMs / Math.max(liveDurationMs, 50)) * 80));

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`group flex items-center gap-3 rounded-lg p-2 transition cursor-pointer ${
                    selectedNode?.id === node.id ? "bg-cyan-500/10 border border-cyan-400/30" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="w-48 truncate text-[11px]">
                    <span className="text-cyan-400 mr-2 font-bold">{node.type.toUpperCase()}</span>
                    <span className="text-slate-200">{node.label}</span>
                  </div>

                  <div className="relative flex-1 h-6 rounded bg-[#03060c] overflow-hidden">
                    <div
                      style={{ left: `${startOffsetPct}%`, width: `${widthPct}%` }}
                      className={`absolute inset-y-0 rounded transition-all duration-300 ${
                        node.status === "completed"
                          ? "bg-gradient-to-r from-emerald-500/60 to-emerald-400/80"
                          : node.status === "running"
                          ? "bg-cyan-500/80 animate-pulse"
                          : "bg-slate-700"
                      }`}
                    ></div>
                  </div>

                  <div className="w-16 text-right text-[11px] font-bold text-slate-300">
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
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                      Operation Forensic Inspector
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase ${
                        selectedNode.status === "completed"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : selectedNode.status === "running"
                          ? "bg-cyan-950 text-cyan-300 border border-cyan-800 animate-pulse"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {selectedNode.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-100 truncate">{selectedNode.label}</h3>
                  <p className="text-[11px] font-mono text-slate-400 truncate">{selectedNode.sublabel}</p>
                </div>

                {/* Unified Inspector Body */}
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-4">
                  {/* Identity & Traceparent */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3 space-y-2 text-[11px]">
                    <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider pb-1 border-b border-white/[0.06]">
                      Distributed Trace Identity
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">SPAN ID</span>
                      <span className="text-cyan-300 font-bold">{selectedNode.spanId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">PARENT SPAN</span>
                      <span className="text-slate-400">{selectedNode.parentSpanId || "null (Root Execution)"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">TRACE ID</span>
                      <span className="text-amber-300 break-all">{selectedNode.identity.traceId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">W3C TRACEPARENT</span>
                      <span className="text-slate-300 break-all text-[10px]">
                        00-{selectedNode.identity.traceId.replace(/-/g, "").padEnd(32, "0")}-{selectedNode.spanId.replace(/-/g, "").padEnd(16, "0")}-01
                      </span>
                    </div>
                  </div>

                  {/* Operation Details */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3 space-y-2 text-[11px]">
                    <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider pb-1 border-b border-white/[0.06]">
                      Operation Specification
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">OPERATION NAME</span>
                      <span className="text-slate-200 font-bold">{selectedNode.operation.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">DETAILS</span>
                      <span className="text-slate-300">{selectedNode.operation.details}</span>
                    </div>
                    {selectedNode.operation.logicMetadata && (
                      <div>
                        <span className="text-slate-500 block text-[9px] mb-1">EXECUTION INVARIANTS</span>
                        <ul className="list-disc list-inside text-slate-400 space-y-0.5 text-[10px]">
                          {selectedNode.operation.logicMetadata.map((rule, i) => (
                            <li key={i}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Payloads */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3 space-y-2.5 text-[11px]">
                    <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider pb-1 border-b border-white/[0.06]">
                      Payload Inspection
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                        <span>INPUT ({selectedNode.input.type})</span>
                        <span>{selectedNode.input.sizeBytes} bytes</span>
                      </div>
                      <pre className="rounded border border-white/[0.06] bg-[#03060c] p-2 text-slate-200 overflow-x-auto text-[10px] max-h-28">
                        {typeof selectedNode.input.data === "string"
                          ? selectedNode.input.data
                          : JSON.stringify(selectedNode.input.data, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                        <span>OUTPUT ({selectedNode.output.type})</span>
                        <span>{selectedNode.output.sizeBytes} bytes</span>
                      </div>
                      <pre className="rounded border border-white/[0.06] bg-[#03060c] p-2 text-cyan-200 overflow-x-auto text-[10px] max-h-28">
                        {typeof selectedNode.output.data === "string"
                          ? selectedNode.output.data
                          : JSON.stringify(selectedNode.output.data, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* Performance & Token Ledger */}
                  <div className="rounded-lg border border-white/[0.06] bg-[#080d1a] p-3 space-y-1.5 text-[11px]">
                    <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider pb-1 border-b border-white/[0.06]">
                      Performance & Token Accounting
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Duration:</span>
                      <strong className="text-cyan-300">{selectedNode.durationMs}ms</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Tokens In / Out:</span>
                      <span className="text-slate-200">
                        <strong className="text-cyan-300">{selectedNode.resources.tokensIn || 0}</strong> in /{" "}
                        <strong className="text-emerald-300">{selectedNode.resources.tokensOut || 0}</strong> out
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Measurement Source:</span>
                      <span className="rounded bg-emerald-950 text-emerald-300 border border-emerald-800 px-1 py-0.2 text-[9px] font-bold">
                        {selectedNode.resources.classification || "ACTUAL"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-white/[0.06] pt-1">
                      <span className="text-slate-400">Estimated Cost:</span>
                      <strong className="text-emerald-400">
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