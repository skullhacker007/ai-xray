"use client";

import React, { useState, useMemo } from "react";
import { TokenSequenceItem } from "../../app/lib/observatory-types";

interface TokenActivityHeatmapProps {
  tokensIn: number;
  tokensOut: number;
  tokens: TokenSequenceItem[];
  isExecuting: boolean;
  throughput?: number;
  durationMs: number;
  cachedTokens?: number;
}

export default function TokenActivityHeatmap({
  tokensIn,
  tokensOut,
  tokens,
  isExecuting,
  throughput,
  durationMs,
  cachedTokens = 0,
}: TokenActivityHeatmapProps) {
  const [viewMode, setViewMode] = useState<"Daily" | "Weekly" | "Cumulative">("Cumulative");
  const [selectedTokenIdx, setSelectedTokenIdx] = useState<number | null>(null);

  // Generate grid cells matching user's Image 2
  // 7 rows x 40 columns = 280 grid positions
  const rows = 7;
  const cols = 40;
  const totalSlots = rows * cols;

  const totalTokens = tokensIn + (tokens.length || tokensOut);

  // Map tokens into slot representations based on view mode
  const gridSlots = useMemo(() => {
    return Array.from({ length: totalSlots }).map((_, slotIdx) => {
      // Determine if this slot corresponds to an actual token
      let token: TokenSequenceItem | null = null;
      let isActive = false;
      let intensity = 0; // 0 to 1

      if (viewMode === "Cumulative") {
        // Linear fill from left to right, top to bottom or column-wise
        // In image 2, columns represent temporal buckets
        const col = Math.floor(slotIdx / rows);
        const row = slotIdx % rows;
        const mappedIdx = col * rows + row;

        if (mappedIdx < tokens.length) {
          token = tokens[mappedIdx];
          isActive = true;
          intensity = token.probability ? Math.max(0.35, token.probability) : 0.8;
        } else if (mappedIdx < totalTokens) {
          isActive = true;
          intensity = mappedIdx < tokensIn ? 0.35 : 0.75;
        }
      } else if (viewMode === "Daily") {
        // Daily view: focused on the most recent 50 tokens
        const col = Math.floor(slotIdx / rows);
        const row = slotIdx % rows;
        const recentTokens = tokens.slice(-totalSlots);
        const mappedIdx = col * rows + row;

        if (mappedIdx < recentTokens.length) {
          token = recentTokens[mappedIdx];
          isActive = true;
          intensity = token.probability ? Math.max(0.4, token.probability) : 0.9;
        }
      } else {
        // Weekly view: chunked activity density distribution
        const col = Math.floor(slotIdx / rows);
        const row = slotIdx % rows;
        const mappedIdx = col * rows + row;

        if (mappedIdx < tokens.length) {
          token = tokens[mappedIdx];
          isActive = true;
          intensity = 0.5 + (mappedIdx % 3) * 0.2;
        } else if (mappedIdx < totalTokens) {
          isActive = true;
          intensity = 0.4;
        }
      }

      return {
        slotIdx,
        col: Math.floor(slotIdx / rows),
        row: slotIdx % rows,
        token,
        isActive,
        intensity,
      };
    });
  }, [viewMode, tokens, totalTokens, tokensIn, totalSlots, rows]);

  const selectedToken = selectedTokenIdx !== null && selectedTokenIdx < tokens.length ? tokens[selectedTokenIdx] : null;

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-[#060c18] p-4 text-slate-100 shadow-[0_0_25px_rgba(6,182,212,0.08)]">
      {/* Header matching reference Image 2 */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] pb-2.5 mb-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-mono font-black text-slate-100 tracking-wider">
            Token activity
          </span>
          <span className="rounded bg-cyan-950 border border-cyan-800 px-2 py-0.5 text-xs font-mono text-cyan-300 font-semibold">
            {totalTokens} TOKENS
          </span>
          {isExecuting && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 font-bold animate-pulse">
              <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
              STREAMING TOKENS
            </span>
          )}
        </div>

        {/* View Mode Switcher: Daily | Weekly | Cumulative */}
        <div className="flex items-center gap-1 text-xs font-mono">
          {(["Daily", "Weekly", "Cumulative"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded px-2.5 py-0.5 text-xs transition cursor-pointer ${
                viewMode === mode
                  ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of rounded token activity pills matching Image 2 */}
      <div className="overflow-x-auto p-3 bg-[#03060c] rounded-lg border border-white/[0.06]">
        <div
          className="grid gap-[3px] select-none"
          style={{
            gridTemplateRows: `repeat(${rows}, minmax(10px, 12px))`,
            gridAutoFlow: "column",
            gridAutoColumns: "minmax(14px, 16px)",
            width: "max-content",
          }}
        >
          {gridSlots.map((slot) => {
            const isHovered = slot.token && tokens.indexOf(slot.token) === selectedTokenIdx;

            // Compute background color based on activity intensity
            let bgColor = "#1e2433"; // inactive dark gray matching Image 2
            let borderColor = "transparent";

            if (slot.isActive) {
              if (slot.intensity > 0.7) {
                bgColor = "#38bdf8"; // bright cyan / light blue
              } else if (slot.intensity > 0.4) {
                bgColor = "#0284c7"; // deep blue
              } else {
                bgColor = "#0369a1"; // muted dark blue
              }
              borderColor = isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.15)";
            }

            return (
              <div
                key={slot.slotIdx}
                onClick={() => {
                  if (slot.token) {
                    setSelectedTokenIdx(tokens.indexOf(slot.token));
                  }
                }}
                onMouseEnter={() => {
                  if (slot.token) {
                    setSelectedTokenIdx(tokens.indexOf(slot.token));
                  }
                }}
                style={{
                  backgroundColor: bgColor,
                  borderColor,
                }}
                className={`rounded-[3px] border transition-transform duration-150 cursor-pointer ${
                  isHovered ? "scale-125 z-10 shadow-[0_0_8px_rgba(56,189,248,0.8)]" : ""
                }`}
                title={
                  slot.token
                    ? `Token: "${slot.token.tokenString}" | ID: #${slot.token.tokenId} | Pos: ${slot.token.position}${
                        slot.token.probability ? ` | Prob: ${(slot.token.probability * 100).toFixed(1)}%` : ""
                      }`
                    : slot.isActive
                    ? `Token Slot #${slot.slotIdx + 1}`
                    : `Inactive Slot #${slot.slotIdx + 1}`
                }
              />
            );
          })}
        </div>
      </div>

      {/* Selected Token Inspector or Sequence Overview */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#040813] px-3 py-2.5 text-xs font-mono">
        {selectedToken ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400 font-medium">INSPECTED TOKEN:</span>
            <span className="rounded bg-cyan-950 border border-cyan-700 px-2 py-0.5 text-cyan-300 font-bold">
              &quot;{selectedToken.tokenString}&quot;
            </span>
            <span className="text-slate-300">
              ID: <strong className="text-slate-100">#{selectedToken.tokenId}</strong>
            </span>
            <span className="text-slate-300">
              Pos: <strong className="text-slate-100">{selectedToken.position}</strong>
            </span>
            {selectedToken.probability !== undefined && (
              <span className="text-slate-300">
                Prob:{" "}
                <strong className="text-emerald-300">
                  {(selectedToken.probability * 100).toFixed(1)}%
                </strong>
              </span>
            )}
            <span className="text-slate-300">
              Type: <strong className="text-cyan-400">{selectedToken.type}</strong>
            </span>
          </div>
        ) : (
          <div className="text-slate-300 text-xs">
            Hover or click any slot above to inspect token subwords, vocabulary IDs, and softmax probabilities.
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-300 font-medium">
          <span>
            Input: <strong className="text-blue-400">{tokensIn}</strong>
          </span>
          <span>
            Generated: <strong className="text-cyan-300">{tokensOut}</strong>
          </span>
          <span>
            Cached:{" "}
            <strong className={cachedTokens > 0 ? "text-emerald-400" : "text-slate-400"}>
              {cachedTokens}
            </strong>
          </span>
          <span>
            Speed:{" "}
            <strong className="text-emerald-300">
              {throughput ? `${throughput} tok/s` : `${durationMs > 0 ? ((tokensOut / (durationMs / 1000)) || 0).toFixed(1) : 0} tok/s`}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}
