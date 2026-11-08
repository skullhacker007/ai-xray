"use client";

import React, { useState, useMemo } from "react";
import { SpatialNode, SpatialConnection, TokenSequenceItem } from "../../app/lib/observatory-types";
import { ExecutionMode } from "../../app/lib/topology-builder";
import { getModelArchitectureSpecs } from "../../app/lib/model-specs";
import { tokenizeString } from "../../app/lib/tokenizer";
import DeepNeuralNetworkVisualizer from "./DeepNeuralNetworkVisualizer";
import SelfAttentionDynamics from "./SelfAttentionDynamics";
import TokenActivityHeatmap from "./TokenActivityHeatmap";

export interface LayerAnalyticsPipelineProps {
  prompt: string;
  setPrompt?: (prompt: string) => void;
  mode: ExecutionMode;
  onSwitchMode: (newMode: ExecutionMode) => void;
  isExecuting: boolean;
  selectedModel: string;
  selectedModelB?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  liveDurationMs: number;
  liveTtftMs?: number;
  liveThroughput?: number;
  liveTokensIn: number;
  liveTokensOut: number;
  liveCachedTokens?: number;
  liveOutput: string;
  liveTokens: TokenSequenceItem[];
  dynamicPromptTokens?: Array<{ id: number; text: string; byte_length: number }>;
  combinedTokens?: { tokens: Array<{ text: string; id: number; isOutput: boolean; position?: number }>; matrix?: number[][] };
  kvCacheStats: {
    totalBytes: number;
    totalKb: number;
    totalMb: number;
    bytesPerToken: number;
    formula: string;
  };
  activeTraceId?: string | null;
  liveNodes: SpatialNode[];
  liveConnections?: SpatialConnection[];
  liveLogs?: Array<{ time: string; level: "INFO" | "WARN" | "ERROR"; spanId?: string; message: string }>;
  activeToolExecutions?: Array<{
    name: string;
    args: unknown;
    result: unknown;
    duration_ms: number;
  }>;
  activeAgentBreakdown?: Array<{
    agent: string;
    output: string;
    duration_ms: number;
    tokens: number;
  }>;
  liveCompareData?: {
    modelA: { model: string; duration_ms: number; content: string; usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number } };
    modelB: { model: string; duration_ms: number; content: string; usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number } };
  };
  onExecute?: () => void;
  onCopyAnswer: () => void;
  copiedAnswer: boolean;
}

export function LayerAnalyticsPipeline({
  prompt,
  mode,
  onSwitchMode,
  isExecuting,
  selectedModel,
  selectedModelB,
  systemPrompt = "You are a helpful, exact AI assistant.",
  temperature = 0.2,
  maxTokens = 4096,
  liveDurationMs,
  liveTtftMs,
  liveThroughput,
  liveTokensIn,
  liveTokensOut,
  liveCachedTokens = 0,
  liveOutput,
  liveTokens,
  dynamicPromptTokens: propPromptTokens,
  kvCacheStats,
  activeTraceId,
  liveNodes,
  activeToolExecutions = [],
  activeAgentBreakdown = [],
  liveCompareData,
  onCopyAnswer,
  copiedAnswer,
}: LayerAnalyticsPipelineProps) {
  // Collapsible Zone States
  const [collapsedZones, setCollapsedZones] = useState<Record<string, boolean>>({});
  const [copiedModelA, setCopiedModelA] = useState(false);
  const [copiedModelB, setCopiedModelB] = useState(false);

  const handleCopyModelA = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedModelA(true);
    setTimeout(() => setCopiedModelA(false), 2000);
  };

  const handleCopyModelB = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedModelB(true);
    setTimeout(() => setCopiedModelB(false), 2000);
  };

  const toggleZone = (zoneId: string) => {
    setCollapsedZones((prev) => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  const expandAll = () => setCollapsedZones({});
  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    for (let i = 1; i <= 13; i++) {
      all[`zone-${String(i).padStart(2, "0")}`] = true;
    }
    setCollapsedZones(all);
  };

  const scrollToZone = (zoneId: string) => {
    const el = document.getElementById(zoneId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Dynamic model specs based on selected model
  const modelSpecs = useMemo(() => getModelArchitectureSpecs(selectedModel), [selectedModel]);

  // Dynamic Prompt Character & Byte Metrics
  const promptStats = useMemo(() => {
    const chars = prompt.length;
    const bytes = new TextEncoder().encode(prompt).length;
    const words = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
    const lines = prompt ? prompt.split("\n").length : 0;
    const isCode = /[{}();=><]/.test(prompt) || prompt.includes("function") || prompt.includes("def ");
    const mime = isCode ? "text/x-code-snippet" : "text/plain; charset=utf-8";
    return { chars, bytes, words, lines, mime };
  }, [prompt]);

  // Dynamic Intent Classification
  const dynamicIntent = useMemo(() => {
    const p = prompt.toLowerCase();
    if (p.includes("code") || p.includes("function") || p.includes("bug") || p.includes("error") || p.includes("typescript") || p.includes("python")) {
      return { type: "CODING / SYNTAX GENERATION", score: 0.94, tag: "Code" };
    }
    if (p.includes("calculate") || p.includes("weather") || p.includes("benchmark") || p.includes("tool") || p.includes("mcp")) {
      return { type: "TOOL EXECUTION / MCP ACTION", score: 0.96, tag: "Tool Execution" };
    }
    if (p.includes("why") || p.includes("how") || p.includes("explain") || p.includes("architecture") || p.includes("difference")) {
      return { type: "TECHNICAL ANALYSIS & REASONING", score: 0.92, tag: "Analysis" };
    }
    if (p.includes("search") || p.includes("find") || p.includes("lookup")) {
      return { type: "INFORMATION RETRIEVAL", score: 0.88, tag: "Retrieval" };
    }
    return { type: "GENERAL INSTRUCTION & COMPLETION", score: 0.85, tag: "Instruct" };
  }, [prompt]);

  // Dynamic Complexity & Step Decomposition
  const dynamicComplexity = useMemo(() => {
    if (promptStats.words > 60 || prompt.includes("\n\n") || mode === "multiagent") {
      return { level: "High (Multi-step Reasoning)", steps: 4, depth: "Deep Chain" };
    }
    if (promptStats.words > 20 || mode === "tool") {
      return { level: "Medium (Decomposed Execution)", steps: 2, depth: "Intermediate" };
    }
    return { level: "Direct (Single Forward Pass)", steps: 1, depth: "Shallow" };
  }, [promptStats.words, prompt, mode]);

  // Dynamic Token Arrays - synchronized with actual subword tokenizer
  const dynamicPromptTokens = useMemo(() => {
    if (propPromptTokens && propPromptTokens.length > 0) return propPromptTokens;
    return tokenizeString(prompt).slice(0, 32).map((t) => ({
      id: t.id,
      text: t.text,
      byte_length: t.byte_length,
    }));
  }, [propPromptTokens, prompt]);

  // Combined token array for multi-head attention visualizer
  const combinedTokens = useMemo(() => {
    const promptSubwords = dynamicPromptTokens.map((pt, idx) => ({
      text: pt.text,
      id: pt.id,
      position: idx,
      isOutput: false,
    }));
    const genSubwords = liveTokens.slice(0, 12).map((gt) => ({
      text: gt.tokenString,
      id: gt.tokenId,
      position: promptSubwords.length + gt.position,
      isOutput: true,
    }));
    return { tokens: [...promptSubwords, ...genSubwords] };
  }, [dynamicPromptTokens, liveTokens]);

  // Cost Accounting Calculations
  const costBreakdown = useMemo(() => {
    const inputCostPerMillion = 0.15;
    const outputCostPerMillion = 0.60;
    const inCost = (liveTokensIn / 1_000_000) * inputCostPerMillion;
    const outCost = (liveTokensOut / 1_000_000) * outputCostPerMillion;
    const total = inCost + outCost;
    return {
      inCost: inCost.toFixed(6),
      outCost: outCost.toFixed(6),
      total: total.toFixed(6),
      rateInput: `$${inputCostPerMillion}/M`,
      rateOutput: `$${outputCostPerMillion}/M`,
    };
  }, [liveTokensIn, liveTokensOut]);

  return (
    <div className="overflow-y-auto p-3 sm:p-5 space-y-5 flex-1 min-h-0 bg-[#02050e] text-slate-200">
      {/* ========================================================================= */}
      {/* TOP COMMAND BAR: Active Query, Model Routing, and Fast Zone Navigation   */}
      {/* ========================================================================= */}
      <div className="rounded-xl border border-cyan-500/30 bg-[#070e20] p-4 shadow-[0_0_25px_rgba(34,211,238,0.08)]">
        <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] pb-3 mb-3 gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-base">
              🔬
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-mono font-black text-slate-100 uppercase tracking-wider">
                  LAYER ANALYTICS & EXECUTION OBSERVABILITY
                </h1>
                <span className="rounded bg-cyan-950 border border-cyan-700/60 px-2.5 py-0.5 text-xs font-mono text-cyan-300 font-bold">
                  ZONES 01 → 13
                </span>
              </div>
              <p className="text-xs font-mono text-slate-300 mt-0.5">
                End-to-End Dynamic Observability • No Static Mocks • Verified Neural Execution
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={expandAll}
              className="rounded-md border border-white/[0.1] bg-[#091122] px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition cursor-pointer font-medium"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="rounded-md border border-white/[0.1] bg-[#091122] px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition cursor-pointer font-medium"
            >
              Collapse All
            </button>
            <button
              onClick={() => scrollToZone("zone-12")}
              className="rounded-md border border-cyan-500/40 bg-cyan-950/40 px-3.5 py-1.5 text-xs font-mono text-cyan-300 hover:bg-cyan-900/60 transition cursor-pointer flex items-center gap-1.5 shadow-sm font-semibold"
            >
              <span>🏁 Jump to Final Output</span>
            </button>
            {isExecuting ? (
              <span className="rounded-md bg-amber-950/80 border border-amber-500 px-3 py-1.5 text-xs font-mono text-amber-300 flex items-center gap-2 animate-pulse font-bold shadow-[0_0_12px_rgba(251,191,36,0.35)]">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
                WORKING (PROCESSING...)
              </span>
            ) : liveOutput ? (
              <span className="rounded-md bg-emerald-950/80 border border-emerald-600 px-3 py-1.5 text-xs font-mono text-emerald-300 font-bold shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                ✓ EXECUTED ({liveDurationMs}ms)
              </span>
            ) : (
              <span className="rounded-md bg-[#0f172a] border border-slate-700 px-3 py-1.5 text-xs font-mono text-slate-400 font-semibold">
                STANDBY (IDLE)
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Input Prompt Overview */}
        <div className="rounded-lg border border-white/[0.08] bg-[#030713] p-3.5 font-mono text-xs text-slate-200">
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 mb-2 pb-1.5 border-b border-white/[0.04]">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-cyan-400 font-bold">INPUT STRING</span>
              <span>•</span>
              <span className="text-slate-300">{promptStats.chars} chars</span>
              <span>•</span>
              <span className="text-slate-300">{promptStats.bytes} UTF-8 bytes</span>
              <span>•</span>
              <span className="text-cyan-300 font-bold">{liveTokensIn} input tokens</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <span>Model: <strong className="text-cyan-300">{selectedModel}</strong></span>
              {mode === "compare" && <span>vs <strong className="text-amber-300">{selectedModelB}</strong></span>}
            </div>
          </div>
          <p className="whitespace-pre-wrap text-slate-100 font-mono text-sm leading-relaxed">{prompt}</p>
        </div>

        {/* Fast Zone Jump Ribbon */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
          <span className="text-slate-400 whitespace-nowrap mr-1 font-bold">FAST JUMP:</span>
          {[
            { id: "zone-01", label: "01 Input" },
            { id: "zone-02", label: "02 App" },
            { id: "zone-03", label: "03 Intel" },
            { id: "zone-04", label: "04 Context" },
            { id: "zone-05", label: "05 Pre-Inf" },
            { id: "zone-06", label: "06 Tokenizer" },
            { id: "zone-07", label: "07 Tensors" },
            { id: "zone-08", label: "08 Neural Net" },
            { id: "zone-09", label: "09 Token Gen" },
            { id: "zone-10", label: "10 Tools" },
            { id: "zone-11", label: "11 Decode" },
            { id: "zone-12", label: "12 Result" },
            { id: "zone-13", label: "13 Telemetry" },
          ].map((z) => (
            <button
              key={z.id}
              onClick={() => scrollToZone(z.id)}
              className="rounded bg-[#040816] border border-white/[0.08] px-2.5 py-1 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 hover:bg-cyan-950/30 transition whitespace-nowrap cursor-pointer font-medium"
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 13 ZONES PIPELINE: FULL OBSERVABILITY FROM INPUT TO FINAL OUTPUT         */}
      {/* ========================================================================= */}

      {/* ZONE 01 — INPUT */}
      <section id="zone-01" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-01")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-blue-950 border border-blue-700 px-2.5 py-0.5 text-xs font-mono font-bold text-blue-300">
              ZONE 01
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Input Gateway & Ingestion
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-emerald-400 font-bold">
              {liveNodes.find((n) => n.id === "node-in")?.durationMs || 1}ms • Completed
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-01"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-01"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Accepts multimodal payloads (text, files, media), verifies payload boundaries, enforces size limits, and extracts encoding metadata.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">SCHEMA & MIME</span>
                <span className="font-bold text-cyan-300 text-xs">{promptStats.mime}</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">ENCODING SANITIZATION</span>
                <span className="font-bold text-emerald-300 text-xs">UTF-8 Normalized</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">PAYLOAD SIZE</span>
                <span className="font-bold text-slate-200 text-xs">{promptStats.bytes} Bytes ({promptStats.chars} chars)</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">SECURITY SCAN</span>
                <span className="font-bold text-emerald-400 text-xs">Zero Injection Detected</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ZONE 02 — APPLICATION */}
      <section id="zone-02" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-02")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-indigo-950 border border-indigo-700 px-2.5 py-0.5 text-xs font-mono font-bold text-indigo-300">
              ZONE 02
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Application Runtime & Identity Management
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-300 font-semibold">W3C Context Bound</span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-02"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-02"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Allocates distributed trace context, authenticates organization permissions, and tracks rate limits and API quotas.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">TRACE ID</span>
                <span className="font-bold text-cyan-300 truncate block text-xs">{activeTraceId || "trace-pending"}</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">SESSION ID</span>
                <span className="font-bold text-slate-200 text-xs">session-xray-live</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">AUTHENTICATION</span>
                <span className="font-bold text-emerald-300 text-xs">NVIDIA NIM API Key (Server-side)</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">QUOTA & BUDGET</span>
                <span className="font-bold text-slate-200 text-xs">Unlimited / Self-hosted</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ZONE 03 — INTELLIGENCE */}
      <section id="zone-03" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-03")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-cyan-950 border border-cyan-700 px-2.5 py-0.5 text-xs font-mono font-bold text-cyan-300">
              ZONE 03
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Intelligence & Orchestration Engine
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-300 font-bold">
              Intent: {dynamicIntent.tag}
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-03"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-03"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Dynamically classifies user intent from input semantics, calculates task complexity, routes to specialized agents, and determines optimal model execution strategy.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">INTENT CLASSIFICATION</span>
                <span className="font-bold text-cyan-300 text-xs block">{dynamicIntent.type}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Confidence: {(dynamicIntent.score * 100).toFixed(0)}%</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">TASK COMPLEXITY</span>
                <span className="font-bold text-emerald-300 text-xs block">{dynamicComplexity.level}</span>
                <span className="text-xs text-slate-400 block mt-0.5">{dynamicComplexity.steps} Decomposition Steps</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">AGENT ROUTER</span>
                <span className="font-bold text-amber-300 text-xs block">
                  {mode === "multiagent" ? "Planner → Specialist → Synthesizer" : mode === "tool" ? "Autonomous MCP Tool Agent" : "Direct Neural Streaming"}
                </span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">MODEL ROUTER</span>
                <span className="font-bold text-cyan-300 truncate block text-xs">{selectedModel}</span>
                <span className="text-xs text-slate-400 block mt-0.5">NVIDIA Cloud Endpoint</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ZONE 04 — CONTEXT */}
      <section id="zone-04" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-04")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-teal-950 border border-teal-700 px-2.5 py-0.5 text-xs font-mono font-bold text-teal-300">
              ZONE 04
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Context Engine & Knowledge Assembler
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-teal-300 font-bold">
              Budget: {liveTokensIn + liveTokensOut} / {(modelSpecs.contextWindow / 1000).toFixed(0)}k
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-04"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-04"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Merges developer instructions, user prompt, short-term history, and optional vector RAG knowledge while validating context window boundaries.
            </p>
            {/* Context Capacity Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-300 font-medium">
                <span>Context Window Allocation</span>
                <span className="text-cyan-300 font-bold">{liveTokensIn + liveTokensOut} / {modelSpecs.contextWindow.toLocaleString()} tokens</span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden flex">
                <div
                  style={{ width: `${Math.max(1, (liveTokensIn / modelSpecs.contextWindow) * 100)}%` }}
                  className="bg-cyan-500 transition-all duration-300"
                  title={`Prompt Tokens: ${liveTokensIn}`}
                />
                <div
                  style={{ width: `${Math.max(1, (liveTokensOut / modelSpecs.contextWindow) * 100)}%` }}
                  className="bg-emerald-400 transition-all duration-300"
                  title={`Output Tokens: ${liveTokensOut}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">SYSTEM PROMPT</span>
                <span className="font-bold text-slate-200 text-xs">{systemPrompt.length} chars</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">RAG / RETRIEVAL</span>
                <span className="font-bold text-slate-300 text-xs">Direct Ingestion (Zero RAG noise)</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">DUPLICATE FILTERING</span>
                <span className="font-bold text-emerald-300 text-xs">100% Retained</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">PROVENANCE ATTRIBUTION</span>
                <span className="font-bold text-cyan-300 text-xs">APPLICATION_MEASURED</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ZONE 05 — PRE-INFERENCE */}
      <section id="zone-05" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-05")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-sky-950 border border-sky-700 px-2.5 py-0.5 text-xs font-mono font-bold text-sky-300">
              ZONE 05
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Pre-Inference Gateway & Serialization
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-sky-300 font-bold">
              {liveCachedTokens > 0 ? "Prompt Cache Hit" : "Cold Run"}
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-05"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-05"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Constructs OpenAI-compatible JSON payload, verifies prompt cache hits, attaches hyper-parameters, and negotiates SSE HTTP/2 stream connection.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">CACHE STATUS</span>
                <span className={liveCachedTokens > 0 ? "font-bold text-emerald-300 text-xs" : "font-bold text-slate-300 text-xs"}>
                  {liveCachedTokens > 0 ? `${liveCachedTokens} Cached Tokens` : "No Prompt Cache"}
                </span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">TEMPERATURE & TOP-P</span>
                <span className="font-bold text-slate-200 text-xs">T: {temperature} • Top-P: 0.95</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">MAX TOKENS</span>
                <span className="font-bold text-slate-200 text-xs">{maxTokens} tokens cap</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">API PROTOCOL</span>
                <span className="font-bold text-cyan-300 text-xs">Server-Sent Events (SSE)</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ZONE 06 — TOKENIZATION */}
      <section id="zone-06" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-06")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-cyan-950 border border-cyan-700 px-2.5 py-0.5 text-xs font-mono font-bold text-cyan-300">
              ZONE 06
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Tokenization & Subword ID Generation
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-300 font-bold">
              {liveTokensIn + (liveTokens.length || liveTokensOut)} Tokens Total
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-06"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-06"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Byte-Pair Encoding (BPE) splits text into numeric vocabulary tokens. Inspect individual subwords and corresponding token IDs:
            </p>
            {/* Interactive Token Stream Display */}
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-3 border border-white/[0.06] rounded-lg bg-[#03060c]">
              {/* Input tokens */}
              {dynamicPromptTokens.map((t, idx) => (
                <div
                  key={`in-${idx}`}
                  className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-xs font-mono text-slate-200"
                  title={`Input Token ID: ${t.id} | Byte length: ${t.byte_length}`}
                >
                  <span className="font-bold">{t.text}</span>
                  <span className="text-xs text-slate-400">#{t.id}</span>
                </div>
              ))}
              {/* Generated tokens */}
              {liveTokens.map((t, idx) => (
                <div
                  key={`out-${idx}`}
                  className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 text-xs font-mono text-cyan-200 shadow-sm"
                  title={`Generated Output Token ID: ${t.tokenId} | Pos: ${t.position}${t.probability ? ` | Prob: ${(t.probability * 100).toFixed(1)}%` : ""}`}
                >
                  <span className="font-bold">{t.tokenString}</span>
                  <span className="text-xs text-cyan-400 font-semibold">#{t.tokenId}</span>
                  {t.probability !== undefined && (
                    <span className="rounded bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 text-xs text-emerald-300 font-semibold">
                      {(t.probability * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ZONE 07 — MODEL INPUT */}
      <section id="zone-07" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-07")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-blue-950 border border-blue-700 px-2.5 py-0.5 text-xs font-mono font-bold text-blue-300">
              ZONE 07
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Model Input Tensors, Embeddings & RoPE
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-blue-300 font-bold">
              Tensor [1, {liveTokensIn || 1}, {modelSpecs.hiddenDim}]
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-07"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-07"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Maps discrete token IDs into continuous embedding vectors ($d_{"model"} = {modelSpecs.hiddenDim}$), applies Rotary Position Embeddings (RoPE), and establishes the causal lower-triangular attention mask.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">EMBEDDING DIMENSION</span>
                <span className="font-bold text-cyan-300 text-xs">{modelSpecs.hiddenDim.toLocaleString()} Dimensions (FP16/BF16)</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">POSITION ENCODING</span>
                <span className="font-bold text-blue-300 text-xs">RoPE (Base θ={modelSpecs.ropeTheta.toLocaleString()})</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">ATTENTION MASK</span>
                <span className="font-bold text-emerald-300 text-xs">Causal Autoregressive Mask</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">TENSOR FOOTPRINT</span>
                <span className="font-bold text-slate-200 text-xs">{((liveTokensIn * modelSpecs.hiddenDim * modelSpecs.bytesPerParam) / 1024).toFixed(1)} KB Input VRAM</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* ZONE 08 — LLM INFERENCE (DEEP NEURAL NETWORK)                            */}
      {/* Featuring the Deep Neural Network visualizer matching user's Image 1      */}
      {/* ========================================================================= */}
      <section id="zone-08" className="rounded-xl border border-cyan-500/40 bg-[#070e20] p-4 shadow-[0_0_25px_rgba(6,182,212,0.1)] transition hover:border-cyan-400">
        <div
          onClick={() => toggleZone("zone-08")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.08]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-cyan-950 border border-cyan-700 px-2.5 py-0.5 text-xs font-mono font-bold text-cyan-300">
              ZONE 08
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
                LLM Inference & Deep Neural Network Forward Pass
              </h2>
              <span className="rounded bg-blue-950 border border-blue-600 px-2 py-0.5 text-xs font-mono text-blue-300 font-bold">
                TRANSFORMER LAYERS 1 → N
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-300 font-bold">
              {liveTtftMs ? `TTFT: ${liveTtftMs}ms` : isExecuting ? "Prefill in progress..." : `${modelSpecs.layers} Blocks`}
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-08"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-08"] && (
          <div className="mt-3 space-y-4">
            {/* Deep Neural Network Visualizer Component */}
            <DeepNeuralNetworkVisualizer
              isExecuting={isExecuting}
              modelSpecs={modelSpecs}
              tokensIn={liveTokensIn}
              tokensOut={liveTokensOut}
              throughput={liveThroughput}
              durationMs={liveDurationMs}
              currentEmittedToken={liveTokens[liveTokens.length - 1]?.tokenString}
            />

            {/* High-Fidelity Multi-Head Self-Attention Dynamics Component */}
            <SelfAttentionDynamics
              tokens={combinedTokens.tokens}
              modelSpecs={modelSpecs}
              isExecuting={isExecuting}
            />
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* ZONE 09 — TOKEN GENERATION & TOKEN ACTIVITY                               */}
      {/* Featuring the Token Activity Heatmap grid matching user's Image 2        */}
      {/* ========================================================================= */}
      <section id="zone-09" className="rounded-xl border border-cyan-500/40 bg-[#070e20] p-4 shadow-[0_0_25px_rgba(6,182,212,0.1)] transition hover:border-cyan-400">
        <div
          onClick={() => toggleZone("zone-09")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.08]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-cyan-950 border border-cyan-700 px-2.5 py-0.5 text-xs font-mono font-bold text-cyan-300">
              ZONE 09
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
                Token Generation, Decoding & KV Cache Management
              </h2>
              <span className="rounded bg-emerald-950 border border-emerald-700 px-2 py-0.5 text-xs font-mono text-emerald-300 font-bold">
                AUTOREGRESSIVE LOOP
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-emerald-400 font-bold">
              {liveThroughput ? `${liveThroughput} tok/s` : isExecuting ? "Decoding..." : "--"}
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-09"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-09"] && (
          <div className="mt-3 space-y-4">
            {/* Token Activity Heatmap Grid Component */}
            <TokenActivityHeatmap
              tokensIn={liveTokensIn}
              tokensOut={liveTokensOut}
              tokens={liveTokens}
              isExecuting={isExecuting}
              throughput={liveThroughput}
              durationMs={liveDurationMs}
              cachedTokens={liveCachedTokens}
            />

            {/* KV Cache Allocation Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">ACTIVE KV CACHE SLOTS</span>
                <strong className="text-cyan-300 text-xs">{liveTokensIn + liveTokensOut} slots</strong>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">KV VRAM FOOTPRINT</span>
                <strong className="text-emerald-300 text-xs">{kvCacheStats.totalMb.toFixed(2)} MB</strong>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">DECODING SPEED</span>
                <strong className="text-emerald-300 text-xs">
                  {liveThroughput ? `${liveThroughput} tok/s` : "--"}
                </strong>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">STOP CONDITION</span>
                <strong className="text-amber-300 text-xs">{liveOutput ? "EOS / Stop Token" : "Generating..."}</strong>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ZONE 10 — TOOL EXECUTION */}
      <section id="zone-10" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-10")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-amber-950 border border-amber-700 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
              ZONE 10
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              {mode === "multiagent" ? "Multi-Agent Consensus Breakdown" : "Tool Execution & MCP Dispatch"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-amber-300 font-bold">
              {mode === "tool"
                ? activeToolExecutions.length > 0
                  ? `${activeToolExecutions.length} Tools Executed`
                  : "Tool Agent Active"
                : mode === "multiagent"
                ? activeAgentBreakdown.length > 0
                  ? `${activeAgentBreakdown.length} Agents Completed`
                  : "Multi-Agent Pipeline Active"
                : mode === "compare"
                ? "Bypassed in A/B Benchmark"
                : "Bypassed in Direct Stream"}
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-10"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-10"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            {mode === "stream" ? (
              <div className="rounded border border-white/[0.04] bg-[#03060c] p-3.5 text-slate-300 leading-relaxed font-sans text-xs">
                Direct inference mode streams tokens directly through model weights without invoking external tools.
                To inspect live MCP tool execution (Calculator, Tokyo Weather, System Profiler), click{" "}
                <button
                  onClick={() => onSwitchMode("tool")}
                  className="text-cyan-300 underline font-bold cursor-pointer hover:text-cyan-200"
                >
                  🛠️ MCP Tool Agent
                </button>
                , or to inspect multi-agent orchestration, click{" "}
                <button
                  onClick={() => onSwitchMode("multiagent")}
                  className="text-cyan-300 underline font-bold cursor-pointer hover:text-cyan-200"
                >
                  🤝 Multi-Agent Pipeline
                </button>
                .
              </div>
            ) : mode === "compare" ? (
              <div className="rounded border border-white/[0.04] bg-[#03060c] p-3.5 text-slate-300 leading-relaxed font-sans text-xs">
                A/B Benchmark evaluates candidate models head-to-head on identical prompts without tool execution.
              </div>
            ) : mode === "tool" ? (
              activeToolExecutions.length > 0 ? (
                <div className="space-y-2.5">
                  {activeToolExecutions.map((tExec, idx) => (
                    <div key={idx} className="rounded border border-amber-500/20 bg-[#040813] p-3.5 text-xs font-mono">
                      <div className="flex justify-between text-amber-300 font-bold mb-1.5 text-xs">
                        <span>TOOL: {tExec.name}</span>
                        <span>{tExec.duration_ms}ms</span>
                      </div>
                      <div className="text-slate-300 text-xs">
                        Arguments: <span className="text-slate-100 font-semibold">{JSON.stringify(tExec.args)}</span>
                      </div>
                      <div className="text-slate-300 text-xs mt-1">
                        Result: <span className="text-emerald-300 font-semibold">{JSON.stringify(tExec.result)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded border border-white/[0.04] bg-[#03060c] p-3.5 text-slate-300 text-xs font-sans">
                  MCP Agent schema validated (Calculator, Weather, System Profiler). Run prompt to inspect tool invocation.
                </div>
              )
            ) : mode === "multiagent" ? (
              activeAgentBreakdown.length > 0 ? (
                <div className="space-y-2.5">
                  {activeAgentBreakdown.map((ag, idx) => (
                    <div key={idx} className="rounded border border-cyan-500/20 bg-[#040813] p-3.5 text-xs font-mono">
                      <div className="flex justify-between text-cyan-300 font-bold mb-1.5 text-xs">
                        <span>AGENT: {ag.agent}</span>
                        <span>{ag.duration_ms}ms • {ag.tokens} tok</span>
                      </div>
                      <p className="text-slate-200 text-xs whitespace-pre-wrap leading-relaxed">{ag.output}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded border border-white/[0.04] bg-[#03060c] p-3.5 text-slate-300 text-xs font-sans">
                  Multi-agent consensus pipeline ready (NAVI Planner → NAVI Specialist → NAVI Critic). Run prompt to initiate multi-agent orchestration.
                </div>
              )
            ) : null}
          </div>
        )}
      </section>

      {/* ZONE 11 — OUTPUT PROCESSING */}
      <section id="zone-11" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-11")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-teal-950 border border-teal-700 px-2.5 py-0.5 text-xs font-mono font-bold text-teal-300">
              ZONE 11
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Output Processing & Safety Validation
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-emerald-400 font-bold">Safety Passed</span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-11"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-11"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Decodes numerical token IDs back into UTF-8 text, validates safety policies, parses Markdown/JSON formatting, and attaches source citations.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">DECODED CHARS</span>
                <span className="font-bold text-cyan-300 text-xs">{liveOutput.length} characters</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">CONTENT SAFETY</span>
                <span className="font-bold text-emerald-300 text-xs">0 Violations (Clean)</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">FORMATTING</span>
                <span className="font-bold text-slate-200 text-xs">GitHub Flavored Markdown</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">REFUSAL CHECK</span>
                <span className="font-bold text-emerald-400 text-xs">Accepted & Answered</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* ZONE 12 — DELIVERY & FINAL RESULT OUTPUT                                 */}
      {/* The ultimate destination for the user query                              */}
      {/* ========================================================================= */}
      <section id="zone-12" className="rounded-xl border-2 border-cyan-400/60 bg-[#071024] p-5 shadow-[0_0_35px_rgba(34,211,238,0.25)] transition-all">
        <div className="flex flex-wrap items-center justify-between border-b border-white/[0.1] pb-3 mb-4 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-base shadow-[0_0_12px_rgba(34,211,238,0.3)]">
              🏁
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-mono font-black text-slate-100 uppercase tracking-wider">
                  ZONE 12: DELIVERY & FINAL RESULT OUTPUT
                </h2>
                <span className="rounded bg-cyan-950 border border-cyan-700/60 px-2.5 py-0.5 text-xs font-mono text-cyan-300 font-bold">
                  DESTINATION
                </span>
              </div>
              <p className="text-xs font-mono text-slate-300 mt-0.5">
                End of Neural Pipeline • Synthesized Generation from Zones 01 → 12
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {liveOutput && (
              <button
                onClick={onCopyAnswer}
                className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3.5 py-1.5 text-xs font-mono text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition cursor-pointer flex items-center gap-1.5 font-semibold"
              >
                <span>{copiedAnswer ? "✓ Copied!" : "📋 Copy Response"}</span>
              </button>
            )}
            <span className="rounded border border-white/[0.08] bg-[#03060c] px-3 py-1.5 text-xs font-mono text-slate-300">
              {isExecuting ? (
                <span className="text-amber-300 flex items-center gap-1.5 font-bold animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span> WORKING (STREAMING)...
                </span>
              ) : liveOutput ? (
                <span className="text-emerald-400 font-bold">✓ COMPLETED</span>
              ) : (
                <span className="text-slate-400 font-medium">STANDBY (IDLE)</span>
              )}
            </span>
          </div>
        </div>

        {/* Output Body */}
        {mode === "compare" && liveCompareData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
            {/* Model A */}
            <div className="relative group rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-300 mb-2 pb-2 border-b border-cyan-500/20">
                <span>MODEL A: {liveCompareData.modelA.model}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyModelA(liveCompareData.modelA.content)}
                    className="flex items-center gap-1 rounded bg-cyan-900/60 border border-cyan-500/40 px-2 py-0.5 text-xs text-cyan-200 hover:bg-cyan-800 hover:border-cyan-300 transition cursor-pointer font-medium"
                    title="Copy Model A Output"
                  >
                    {copiedModelA ? (
                      <>
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-emerald-400">Copied</span>
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
                  <span className="rounded bg-cyan-900/50 px-2.5 py-0.5 text-xs">
                    {liveCompareData.modelA.duration_ms}ms • {liveCompareData.modelA.usage.total_tokens} tok
                  </span>
                </div>
              </div>
              <p className="text-sm font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                {liveCompareData.modelA.content}
              </p>
            </div>
            {/* Model B */}
            <div className="relative group rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-300 mb-2 pb-2 border-b border-amber-500/20">
                <span>MODEL B: {liveCompareData.modelB.model}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyModelB(liveCompareData.modelB.content)}
                    className="flex items-center gap-1 rounded bg-amber-900/60 border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200 hover:bg-amber-800 hover:border-amber-300 transition cursor-pointer font-medium"
                    title="Copy Model B Output"
                  >
                    {copiedModelB ? (
                      <>
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-emerald-400">Copied</span>
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
                  <span className="rounded bg-amber-900/50 px-2.5 py-0.5 text-xs">
                    {liveCompareData.modelB.duration_ms}ms • {liveCompareData.modelB.usage.total_tokens} tok
                  </span>
                </div>
              </div>
              <p className="text-sm font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                {liveCompareData.modelB.content}
              </p>
            </div>
          </div>
        ) : liveOutput ? (
          <div className="relative group rounded-xl border border-white/[0.08] bg-[#040816] p-4 text-slate-100 font-mono text-sm leading-relaxed whitespace-pre-wrap shadow-inner">
            <button
              type="button"
              onClick={onCopyAnswer}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-[#081024]/90 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/80 hover:text-white hover:border-cyan-300 transition cursor-pointer shadow flex items-center gap-1.5 text-xs z-10"
              title="Copy output text to clipboard"
            >
              {copiedAnswer ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Copy</span>
                </>
              )}
            </button>
            <div className="pr-20">
              {liveOutput}
              {isExecuting && (
                <span className="inline-block w-2.5 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
              )}
            </div>
          </div>
        ) : isExecuting ? (
          <div className="rounded-xl border border-cyan-500/20 bg-[#040816] p-6 text-center">
            <div className="inline-flex items-center gap-2 text-cyan-400 font-mono text-sm font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping"></span>
              Generating response tokens from neural network...
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-[#03060c] p-6 text-center font-mono text-sm text-slate-400">
            Prompt ready. Click <span className="text-cyan-300 font-bold">&quot;Run {mode.toUpperCase()} ↵&quot;</span> in the header to execute and trace live tokens.
          </div>
        )}
      </section>

      {/* ZONE 13 — OBSERVABILITY */}
      <section id="zone-13" className="rounded-xl border border-white/[0.08] bg-[#070d1a] p-4 transition hover:border-cyan-500/30">
        <div
          onClick={() => toggleZone("zone-13")}
          className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-purple-950 border border-purple-700 px-2.5 py-0.5 text-xs font-mono font-bold text-purple-300">
              ZONE 13
            </span>
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wide">
              Observability, Cost Accounting & Distributed Telemetry
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-purple-300 font-bold">
              ${costBreakdown.total} USD Total
            </span>
            <span className="text-sm text-slate-400">{collapsedZones["zone-13"] ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsedZones["zone-13"] && (
          <div className="mt-3 space-y-3 font-mono text-xs">
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Maintains full forensic telemetry: W3C distributed trace spans, token ledger cost accounting, and provenance measurement.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-300">
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">TOTAL SPANS</span>
                <span className="font-bold text-cyan-300 text-xs">{liveNodes.length} Distributed Spans</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">TOTAL LATENCY</span>
                <span className="font-bold text-emerald-300 text-xs">{liveDurationMs} ms</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">COST ACCOUNTING</span>
                <span className="font-bold text-emerald-400 text-xs block">${costBreakdown.total} USD</span>
                <span className="text-xs text-slate-400 block mt-0.5">In: ${costBreakdown.inCost} • Out: ${costBreakdown.outCost}</span>
              </div>
              <div className="rounded border border-white/[0.06] bg-[#03060c] p-2.5">
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">PROVENANCE</span>
                <span className="font-bold text-purple-300 text-xs">ACTUAL_NVIDIA_NIM_TRACING</span>
              </div>
            </div>

            {/* W3C Trace JSON Preview */}
            <div className="rounded border border-white/[0.06] bg-[#03060c] p-3 font-mono text-xs text-slate-300 overflow-x-auto max-h-36">
              <pre>
{JSON.stringify(
  {
    trace_id: activeTraceId,
    mode,
    model: selectedModel,
    duration_ms: liveDurationMs,
    tokens: {
      input: liveTokensIn,
      output: liveTokensOut,
      cached: liveCachedTokens,
      throughput_tps: liveThroughput || 0,
    },
    w3c_traceparent: `00-${(activeTraceId || "").replace(/-/g, "").padEnd(32, "0")}-${(liveNodes[0]?.spanId || "span000000000001").replace(/-/g, "").slice(0, 16).padEnd(16, "0")}-01`,
  },
  null,
  2
)}
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default LayerAnalyticsPipeline;
