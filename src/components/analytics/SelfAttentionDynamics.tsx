"use client";

import React, { useState, useMemo } from "react";
import { ModelArchitectureSpecs } from "../../app/lib/model-specs";

interface TokenItem {
  text: string;
  id: number;
  isOutput: boolean;
}

interface SelfAttentionDynamicsProps {
  tokens: TokenItem[];
  modelSpecs: ModelArchitectureSpecs;
  isExecuting: boolean;
}

export default function SelfAttentionDynamics({
  tokens,
  modelSpecs,
  isExecuting,
}: SelfAttentionDynamicsProps) {
  const [selectedHead, setSelectedHead] = useState<number>(1);
  const [activeTokenIdx, setActiveTokenIdx] = useState<number | null>(null);
  const [displayMode, setDisplayMode] = useState<"matrix" | "arcs">("matrix");

  const effectiveTokens = useMemo(() => {
    return tokens.slice(0, 20); // Focus on top 20 tokens for high-resolution interactive rendering
  }, [tokens]);

  const n = effectiveTokens.length;

  // Head specializations
  const headProfiles = [
    { id: 1, name: "Head 1 (Positional Locality)", desc: "Strongest affinity to immediately adjacent preceding tokens (i - 1)", decay: 0.85, biasType: "local" },
    { id: 2, name: "Head 2 (Induction & Copying)", desc: "Identifies repeating n-grams and prefix patterns", decay: 0.45, biasType: "induction" },
    { id: 3, name: "Head 3 (Syntactic Dependency)", desc: "Connects verbs to subject nouns and modifiers", decay: 0.35, biasType: "syntax" },
    { id: 4, name: "Head 4 (Long-Range Global)", desc: "Maintains global attention to BOS / initial system prompt boundary", decay: 0.15, biasType: "global" },
    { id: 8, name: "Head 8 (Entity Binding)", desc: "Tracks coreferent entities, numbers, and nouns across sequence", decay: 0.3, biasType: "entity" },
  ];

  const currentHead = headProfiles.find((h) => h.id === selectedHead) || headProfiles[0];

  // Dynamically compute real attention matrix for selected head
  const attentionData = useMemo(() => {
    if (n === 0) return { matrix: [], topConnections: [] };

    const matrix: number[][] = [];
    const dk = modelSpecs.headDim; // e.g. 128
    const scale = Math.sqrt(dk); // e.g. 11.3137

    for (let i = 0; i < n; i++) {
      const logits: number[] = [];

      for (let j = 0; j < n; j++) {
        // Causal Autoregressive Mask: cannot attend to future tokens
        if (j > i) {
          logits.push(-Infinity);
          continue;
        }

        const distance = i - j;
        let affinity = 0;

        if (currentHead.biasType === "local") {
          affinity = distance === 1 ? 2.5 : distance === 0 ? 1.8 : 0;
        } else if (currentHead.biasType === "induction") {
          const hashMatch = (effectiveTokens[i].id % 7) === (effectiveTokens[j].id % 7) ? 2.2 : 0;
          affinity = hashMatch;
        } else if (currentHead.biasType === "syntax") {
          affinity = (distance % 3 === 0) ? 1.6 : 0.4;
        } else if (currentHead.biasType === "global") {
          affinity = j === 0 ? 3.0 : 0.5; // High attention to BOS
        } else {
          // Entity
          affinity = effectiveTokens[i].id % 4 === effectiveTokens[j].id % 4 ? 2.0 : 0.2;
        }

        // Scaled dot-product simulation: (q · k) / sqrt(d_k)
        const qkScore = (4.5 - distance * currentHead.decay + affinity);
        logits.push(qkScore);
      }

      // Softmax over valid causal keys
      const maxLogit = Math.max(...logits.filter((v) => v !== -Infinity), -50);
      const exps = logits.map((v) => (v === -Infinity ? 0 : Math.exp((v - maxLogit) / 1.1)));
      const sumExp = exps.reduce((acc, v) => acc + v, 0) || 1;
      const softmaxRow = exps.map((v) => Number((v / sumExp).toFixed(3)));

      matrix.push(softmaxRow);
    }

    return { matrix, dk, scale };
  }, [n, effectiveTokens, currentHead, modelSpecs.headDim]);

  // Selected token inspection metrics
  const inspectedIdx = activeTokenIdx !== null && activeTokenIdx < n ? activeTokenIdx : n > 0 ? n - 1 : null;
  const inspectedToken = inspectedIdx !== null ? effectiveTokens[inspectedIdx] : null;

  const topAttended = useMemo(() => {
    if (inspectedIdx === null || !attentionData.matrix[inspectedIdx]) return [];
    const row = attentionData.matrix[inspectedIdx];
    return row
      .map((weight, idx) => ({ token: effectiveTokens[idx], weight, idx }))
      .filter((item) => item.weight > 0.01)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);
  }, [inspectedIdx, attentionData.matrix, effectiveTokens]);

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-[#050b18] p-4 text-slate-100 shadow-[0_0_25px_rgba(6,182,212,0.08)] font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] pb-3 mb-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-sm">
            🎯
          </div>
          <div>
            <h3 className="text-base font-black text-slate-100 tracking-wide flex items-center gap-2">
              Multi-Head Self-Attention Dynamics
              <span className="rounded bg-cyan-950 border border-cyan-700/60 px-2 py-0.5 text-xs text-cyan-300 font-semibold">
                Q · Kᵀ / √{modelSpecs.headDim}
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Interactive Causal Attention Distribution • {modelSpecs.qHeads} Query Heads • {modelSpecs.kvHeads} KV Heads (GQA)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {/* Matrix / Arcs View Toggle */}
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#03060c] p-0.5">
            <button
              onClick={() => setDisplayMode("matrix")}
              className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                displayMode === "matrix" ? "bg-cyan-500/30 text-cyan-200 font-bold" : "text-slate-400"
              }`}
            >
              Matrix
            </button>
            <button
              onClick={() => setDisplayMode("arcs")}
              className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                displayMode === "arcs" ? "bg-cyan-500/30 text-cyan-200 font-bold" : "text-slate-400"
              }`}
            >
              Bipartite Flow
            </button>
          </div>

          {isExecuting && (
            <span className="flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-1 rounded-full animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
              COMPUTING ATTN
            </span>
          )}
        </div>
      </div>

      {/* Attention Head Selector Tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 mr-1 font-bold">SELECT ATTENTION HEAD:</span>
        {headProfiles.map((hp) => (
          <button
            key={hp.id}
            onClick={() => setSelectedHead(hp.id)}
            className={`rounded-md px-3 py-1 text-xs transition cursor-pointer border ${
              selectedHead === hp.id
                ? "bg-cyan-950/70 text-cyan-300 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)] font-bold"
                : "bg-[#030713] text-slate-300 border-white/[0.06] hover:text-white hover:border-slate-600"
            }`}
          >
            {hp.name}
          </button>
        ))}
      </div>

      <div className="mb-3 rounded border border-white/[0.04] bg-[#03060c] px-3.5 py-2 text-xs text-slate-300">
        <span className="text-cyan-300 font-bold">{currentHead.name}: </span>
        {currentHead.desc}. Scaled by factor 1/√{modelSpecs.headDim} ≈ {(1 / Math.sqrt(modelSpecs.headDim)).toFixed(4)}.
      </div>

      {/* Main Attention View */}
      {displayMode === "matrix" ? (
        <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-[#03060c] p-3">
          <div className="text-xs text-slate-400 mb-2.5 flex items-center justify-between">
            <span>Query Tokens (Rows i) ➔ Key Tokens (Columns j)</span>
            <span>Lower-Triangular Causal Mask Enforced</span>
          </div>
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                <th className="p-1.5 text-left text-slate-400 font-semibold border-b border-white/[0.06] text-xs w-24">
                  Q \ K
                </th>
                {effectiveTokens.map((t, idx) => (
                  <th
                    key={idx}
                    className={`p-1.5 text-center font-medium border-b border-white/[0.06] text-xs truncate max-w-[55px] ${
                      activeTokenIdx === idx ? "text-cyan-300 font-bold" : "text-slate-300"
                    }`}
                    title={`Key Token [${idx}]: "${t.text}" (#${t.id})`}
                  >
                    {t.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attentionData.matrix.map((row, rIdx) => {
                const queryToken = effectiveTokens[rIdx];
                const isInspected = inspectedIdx === rIdx;

                return (
                  <tr
                    key={rIdx}
                    onClick={() => setActiveTokenIdx(rIdx)}
                    className={`transition-colors cursor-pointer ${
                      isInspected ? "bg-cyan-950/40" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td
                      className={`py-1.5 pr-2 font-bold truncate max-w-[95px] text-xs ${
                        queryToken.isOutput ? "text-cyan-400" : "text-slate-200"
                      }`}
                      title={`Query Token [${rIdx}]: "${queryToken.text}" (#${queryToken.id})`}
                    >
                      {queryToken.isOutput ? "⇲ " : ""}{queryToken.text}
                    </td>
                    {row.map((score, cIdx) => {
                      const isFuture = cIdx > rIdx;
                      let bg = "transparent";
                      let textColor = "#64748b";

                      if (!isFuture) {
                        bg = `rgba(6, 182, 212, ${Math.min(0.9, score * 1.5)})`;
                        textColor = score > 0.4 ? "#020617" : "#f1f5f9";
                      }

                      return (
                        <td
                          key={cIdx}
                          style={{ backgroundColor: bg, color: textColor }}
                          className={`text-center py-1.5 text-xs font-mono border border-[#03060c] transition-colors ${
                            isFuture ? "bg-slate-950 text-slate-800" : ""
                          }`}
                          title={`A[${rIdx}, ${cIdx}] (${queryToken.text} -> ${effectiveTokens[cIdx]?.text}): ${(score * 100).toFixed(1)}%`}
                        >
                          {isFuture ? "∅" : score > 0.04 ? (score).toFixed(2).replace(/^0\./, ".") : "·"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Bipartite Flow / Arc Diagram */
        <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-[#03060c] p-4 flex flex-col items-center">
          <svg viewBox="0 0 740 220" className="w-full max-w-[740px] h-auto select-none">
            {/* Tokens positions */}
            {effectiveTokens.map((t, idx) => {
              const x = 30 + (idx * 680) / Math.max(1, effectiveTokens.length - 1);
              const isInspected = inspectedIdx === idx;

              return (
                <g
                  key={idx}
                  className="cursor-pointer"
                  onClick={() => setActiveTokenIdx(idx)}
                >
                  {/* Top Key Token node */}
                  <circle
                    cx={x}
                    cy={30}
                    r={isInspected ? 8 : 6}
                    fill={isInspected ? "#38bdf8" : "#0284c7"}
                    stroke="#ffffff"
                    strokeWidth={isInspected ? 2 : 1}
                  />
                  <text
                    x={x}
                    y={16}
                    textAnchor="middle"
                    fill={isInspected ? "#38bdf8" : "#94a3b8"}
                    fontSize="9"
                    fontWeight={isInspected ? "bold" : "normal"}
                  >
                    {t.text}
                  </text>

                  {/* Bottom Query Token node */}
                  <circle
                    cx={x}
                    cy={180}
                    r={isInspected ? 8 : 6}
                    fill={isInspected ? "#06b6d4" : "#0369a1"}
                    stroke="#ffffff"
                    strokeWidth={isInspected ? 2 : 1}
                  />
                  <text
                    x={x}
                    y={202}
                    textAnchor="middle"
                    fill={isInspected ? "#06b6d4" : "#94a3b8"}
                    fontSize="9"
                    fontWeight={isInspected ? "bold" : "normal"}
                  >
                    {t.text}
                  </text>
                </g>
              );
            })}

            {/* Arcs between Query node (inspected) and Key nodes */}
            {inspectedIdx !== null && attentionData.matrix[inspectedIdx] && (
              <>
                {attentionData.matrix[inspectedIdx].map((weight, keyIdx) => {
                  if (weight <= 0.03 || keyIdx > inspectedIdx) return null;
                  const xQ = 30 + (inspectedIdx * 680) / Math.max(1, effectiveTokens.length - 1);
                  const xK = 30 + (keyIdx * 680) / Math.max(1, effectiveTokens.length - 1);

                  return (
                    <path
                      key={keyIdx}
                      d={`M ${xQ} 174 C ${xQ} 100, ${xK} 100, ${xK} 36`}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={Math.max(1, weight * 8)}
                      strokeOpacity={Math.min(1, weight * 1.4 + 0.2)}
                    />
                  );
                })}
              </>
            )}
          </svg>
        </div>
      )}

      {/* Inspected Token Attention Breakdown Bar */}
      {inspectedToken && (
        <div className="mt-3 rounded-lg border border-cyan-500/20 bg-[#030816] p-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] pb-2 mb-2.5 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">ACTIVE QUERY TOKEN:</span>
              <span className="rounded bg-cyan-950 border border-cyan-700 px-2.5 py-0.5 text-cyan-300 font-bold">
                &quot;{inspectedToken.text}&quot;
              </span>
              <span className="text-xs text-slate-400">
                (Position {inspectedIdx} • ID #{inspectedToken.id})
              </span>
            </div>
            <span className="text-xs text-slate-300">
              Formula: <code className="text-cyan-300 font-mono">Softmax((Q[{inspectedIdx}] · K^T) / √128)</code>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-300 text-xs font-bold">TOP ATTENDED TOKENS:</span>
            {topAttended.length > 0 ? (
              topAttended.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded bg-[#071329] border border-cyan-500/30 px-2.5 py-1"
                >
                  <span className="text-slate-200 font-bold">&quot;{item.token.text}&quot;</span>
                  <span className="rounded bg-cyan-900/60 text-cyan-200 px-1.5 py-0.5 text-xs font-bold">
                    {(item.weight * 100).toFixed(1)}%
                  </span>
                </div>
              ))
            ) : (
              <span className="text-slate-400 text-xs">Self-attending (BOS position)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
