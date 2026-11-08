"use client";

import React, { useState, useId } from "react";
import { ModelArchitectureSpecs } from "../../app/lib/model-specs";

interface DeepNeuralNetworkVisualizerProps {
  isExecuting: boolean;
  modelSpecs: ModelArchitectureSpecs;
  tokensIn: number;
  tokensOut: number;
  throughput?: number;
  durationMs: number;
  currentEmittedToken?: string;
}

export default function DeepNeuralNetworkVisualizer({
  isExecuting,
  modelSpecs,
  tokensIn,
  tokensOut,
  throughput,
  durationMs,
  currentEmittedToken,
}: DeepNeuralNetworkVisualizerProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string>("input-layer");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, "");

  // Model-specific architecture mapping
  const layers = [
    {
      id: "input-layer",
      name: "Input Layer",
      subtitle: `Token Embedding & RoPE (θ=${modelSpecs.ropeTheta})`,
      type: "input",
      color: "#2563eb", // blue
      lightColor: "#60a5fa",
      count: 5,
      labels: ["Tok₀", "Tok₁", "Tok₂", "Tok₃", "Tokₙ"],
      details: `Input tensor: [1, ${tokensIn || 1}, ${modelSpecs.hiddenDim}] with Rotary Positional Embedding (RoPE θ=${modelSpecs.ropeTheta}). Maps discrete token IDs from vocab size ${modelSpecs.vocabSize.toLocaleString()} to continuous vector space.`,
      internals: [
        { name: "Embedding Matrix", shape: `[${modelSpecs.vocabSize.toLocaleString()}, ${modelSpecs.hiddenDim}]` },
        { name: "RoPE Frequencies", formula: "θ_i = 10000^(-2(i-1)/d)" },
        { name: "Output Tensor", shape: `[1, ${tokensIn || 1}, ${modelSpecs.hiddenDim}]` },
      ],
    },
    {
      id: "hidden-1",
      name: `Block 1 (of ${modelSpecs.layers})`,
      subtitle: `${modelSpecs.normType} + Self-Attention`,
      type: "hidden",
      color: "#06b6d4", // cyan
      lightColor: "#67e8f9",
      count: 5,
      labels: ["Q₁", "K₁", "V₁", "Attn₁", "Res₁"],
      details: `Multi-Head Self-Attention (${modelSpecs.qHeads} Q-heads, ${modelSpecs.kvHeads} KV-heads GQA, head dim ${modelSpecs.headDim}) + Residual Stream connection. Normalization: ${modelSpecs.normType}.`,
      internals: [
        { name: "RMSNorm Pre", formula: "x / sqrt(mean(x²) + ε)" },
        { name: "Q/K/V Projections", shape: `[${modelSpecs.hiddenDim}, ${modelSpecs.qHeads * modelSpecs.headDim}]` },
        { name: "Causal Attention", formula: "Softmax((Q · Kᵀ) / √" + modelSpecs.headDim + ") · V" },
        { name: "Residual Addition", formula: "x = x + Attn(RMSNorm(x))" },
      ],
    },
    {
      id: "hidden-2",
      name: `Blocks 2..${modelSpecs.layers - 1}`,
      subtitle: `${modelSpecs.activation} Multi-Layer Perceptron`,
      type: "hidden",
      color: "#06b6d4",
      lightColor: "#67e8f9",
      count: 5,
      labels: ["Gate", "Up", "SiLU", "Down", "Res₂"],
      details: `${modelSpecs.activation} intermediate feed-forward expansion to ${modelSpecs.intermediateDim.toLocaleString()} dimensions. Generates nonlinear token representations across ${modelSpecs.layers - 2} stacked transformer blocks.`,
      internals: [
        { name: "Gate & Up Matrix", shape: `[${modelSpecs.hiddenDim}, ${modelSpecs.intermediateDim.toLocaleString()}]` },
        { name: "Non-Linearity", formula: "SwiGLU(x) = (Swish(xW_gate) ⊙ xW_up) W_down" },
        { name: "Down Projection", shape: `[${modelSpecs.intermediateDim.toLocaleString()}, ${modelSpecs.hiddenDim}]` },
        { name: "Residual Addition", formula: "x = x + MLP(RMSNorm(x))" },
      ],
    },
    {
      id: "hidden-3",
      name: `Block ${modelSpecs.layers}`,
      subtitle: `Final Transformer Block & State`,
      type: "hidden",
      color: "#06b6d4",
      lightColor: "#67e8f9",
      count: 5,
      labels: ["h₀", "h₁", "h₂", "h₃", "hₙ"],
      details: `Final hidden representation tensor h ∈ ℝ^[1, ${tokensIn + tokensOut || 1}, ${modelSpecs.hiddenDim}]. Synthesizes deep semantic context from all previous layers before final vocabulary projection.`,
      internals: [
        { name: "Final Attention", formula: "Full sequence contextualization" },
        { name: "Final RMSNorm", formula: "Pre-projection scale stabilization" },
        { name: "Hidden Vector h", shape: `[1, ${tokensIn + tokensOut || 1}, ${modelSpecs.hiddenDim}]` },
      ],
    },
    {
      id: "output-layer",
      name: "Output Layer",
      subtitle: "LM Head Vocabulary Projection",
      type: "output",
      color: "#38bdf8", // light blue
      lightColor: "#93c5fd",
      count: 3,
      labels: ["Logits", "Softmax", "ŷ Token"],
      details: `Linear output projection matrix W_u ∈ ℝ^[${modelSpecs.hiddenDim}, ${modelSpecs.vocabSize.toLocaleString()}] computes raw logits for all ${modelSpecs.vocabSize.toLocaleString()} vocabulary tokens.`,
      internals: [
        { name: "Unembedding Matrix W_u", shape: `[${modelSpecs.hiddenDim}, ${modelSpecs.vocabSize.toLocaleString()}]` },
        { name: "Logit Vector", shape: `[1, ${modelSpecs.vocabSize.toLocaleString()}] raw scores` },
        { name: "Temperature Sampling", formula: "P(w_i) = exp(z_i / T) / Σ exp(z_j / T)" },
      ],
    },
  ];

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || layers[1];

  // SVG dimensions
  const width = 840;
  const height = 280;
  const colSpacing = (width - 160) / (layers.length - 1);

  // Calculate node positions
  const layerNodes = layers.map((layer, colIdx) => {
    const x = 80 + colIdx * colSpacing;
    const nodeSpacing = (height - 90) / (layer.count - 1);
    const nodes = Array.from({ length: layer.count }).map((_, rowIdx) => {
      const y = 50 + rowIdx * nodeSpacing;
      return {
        id: `${layer.id}-node-${rowIdx}`,
        layerId: layer.id,
        x,
        y,
        label: layer.labels[rowIdx] || `N${rowIdx}`,
        color: layer.color,
        lightColor: layer.lightColor,
      };
    });
    return { ...layer, x, nodes };
  });

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-[#060c18] p-4 text-slate-100 shadow-[0_0_25px_rgba(6,182,212,0.08)] font-mono">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] pb-3 mb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-sm">
            🧠
          </div>
          <div>
            <h3 className="text-base font-black text-slate-100 tracking-wide flex items-center gap-2">
              Deep Neural Network Architecture
              <span className="rounded bg-cyan-950 border border-cyan-700/60 px-2 py-0.5 text-xs text-cyan-300 font-semibold">
                {modelSpecs.family}
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              {modelSpecs.layers} Transformer Blocks • {modelSpecs.hiddenDim} Hidden Dim • {modelSpecs.qHeads} Attn Heads • {modelSpecs.activation}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
            <span className="text-xs text-slate-300 font-medium">Input Layer</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
            <span className="text-xs text-slate-300 font-medium">Hidden Layers (1..{modelSpecs.layers})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-300"></span>
            <span className="text-xs text-slate-300 font-medium">Output Layer</span>
          </div>
          {isExecuting && (
            <span className="flex items-center gap-1 text-xs font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-1 rounded-full animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
              {currentEmittedToken ? `EMITTING "${currentEmittedToken}"` : "PROPAGATING TENSORS"}
            </span>
          )}
        </div>
      </div>

      {/* SVG Canvas matching reference Image 1 */}
      <div className="relative w-full overflow-x-auto bg-[#03060c] rounded-lg border border-white/[0.06] p-2 flex justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-[840px] h-auto select-none"
          style={{ minHeight: "260px" }}
        >
          <defs>
            <linearGradient id={`${uniqueId}-grad-edge`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.3" />
            </linearGradient>

            <linearGradient id={`${uniqueId}-grad-active`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.85" />
            </linearGradient>

            <filter id={`${uniqueId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Section Titles matching user Image 1 */}
          <text x={layerNodes[0].x} y="22" textAnchor="middle" fill="#93c5fd" fontSize="13" fontWeight="bold">
            Input layer
          </text>
          <text
            x={(layerNodes[1].x + layerNodes[3].x) / 2}
            y="22"
            textAnchor="middle"
            fill="#67e8f9"
            fontSize="13"
            fontWeight="bold"
          >
            Multiple hidden layer ({modelSpecs.layers} Blocks)
          </text>
          <text
            x={layerNodes[4].x}
            y="22"
            textAnchor="middle"
            fill="#7dd3fc"
            fontSize="13"
            fontWeight="bold"
          >
            Output layer
          </text>

          {/* Synaptic Interconnections between layers */}
          {layerNodes.map((layer, colIdx) => {
            if (colIdx === layerNodes.length - 1) return null;
            const nextLayer = layerNodes[colIdx + 1];

            return layer.nodes.map((sourceNode) => {
              return nextLayer.nodes.map((targetNode) => {
                const isSelected = selectedLayerId === layer.id || selectedLayerId === nextLayer.id;
                const isHovered = hoveredNode === sourceNode.id || hoveredNode === targetNode.id;

                const strokeColor = isHovered || isSelected ? "#38bdf8" : `url(#${uniqueId}-grad-edge)`;
                const strokeWidth = isHovered ? 1.8 : isSelected ? 1.0 : 0.7;
                const strokeOpacity = isHovered ? 0.9 : isSelected ? 0.45 : isExecuting ? 0.3 : 0.18;

                return (
                  <line
                    key={`edge-${sourceNode.id}-${targetNode.id}`}
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={strokeOpacity}
                    className="transition-all duration-150"
                  />
                );
              });
            });
          })}

          {/* Real-time signal propagation particles during inference */}
          {isExecuting && (
            <>
              {layerNodes.slice(0, -1).map((layer, lIdx) => {
                const nextLayer = layerNodes[lIdx + 1];
                return (
                  <circle
                    key={`pulse-${lIdx}`}
                    r="4"
                    fill="#38bdf8"
                    filter={`url(#${uniqueId}-glow)`}
                  >
                    <animate
                      attributeName="cx"
                      from={layer.x}
                      to={nextLayer.x}
                      dur="1.0s"
                      begin={`${lIdx * 0.22}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      from={layer.nodes[lIdx % layer.nodes.length].y}
                      to={nextLayer.nodes[(lIdx + 1) % nextLayer.nodes.length].y}
                      dur="1.0s"
                      begin={`${lIdx * 0.22}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      dur="1.0s"
                      begin={`${lIdx * 0.22}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                );
              })}
            </>
          )}

          {/* Nodes per layer */}
          {layerNodes.map((layer) => {
            return layer.nodes.map((node) => {
              const isHovered = hoveredNode === node.id;
              const isLayerSelected = selectedLayerId === layer.id;
              const radius = isHovered ? 17 : 14;

              return (
                <g
                  key={node.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  {(isHovered || isLayerSelected || isExecuting) && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius + 4}
                      fill="none"
                      stroke={node.lightColor}
                      strokeWidth="1.5"
                      strokeOpacity={isHovered ? "0.9" : "0.35"}
                      filter={`url(#${uniqueId}-glow)`}
                    />
                  )}

                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={node.color}
                    stroke={node.lightColor}
                    strokeWidth={isHovered ? "2.5" : "1.5"}
                    className="transition-all duration-150"
                  />

                  <text
                    x={node.x}
                    y={node.y + 3.5}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    {node.label}
                  </text>
                </g>
              );
            });
          })}
        </svg>
      </div>

      {/* Layer Selector & Inspection Grid */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2.5 text-xs">
        {layers.map((l) => {
          const isSelected = selectedLayerId === l.id;
          return (
            <div
              key={l.id}
              onClick={() => setSelectedLayerId(l.id)}
              className={`p-2.5 rounded-lg border cursor-pointer transition ${
                isSelected
                  ? "border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                  : "border-white/[0.06] bg-[#03060c] text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center justify-between font-bold mb-1 text-xs">
                <span className={isSelected ? "text-cyan-300 font-bold" : "text-slate-200"}>{l.name}</span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: l.lightColor }}
                ></span>
              </div>
              <div className="text-xs text-slate-400 mb-1 font-medium">{l.subtitle}</div>
              <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{l.details}</p>
            </div>
          );
        })}
      </div>

      {/* Deep Layer Internals Inspection Card */}
      <div className="mt-3.5 rounded-lg border border-cyan-500/20 bg-[#040918] p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] pb-2 mb-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">INSPECTING LAYER:</span>
            <span className="rounded bg-cyan-950 border border-cyan-700 px-2 py-0.5 text-cyan-300 font-bold text-xs">
              {selectedLayer.name}
            </span>
            <span className="text-xs text-slate-300">{selectedLayer.subtitle}</span>
          </div>
          <span className="text-xs text-emerald-400 font-bold">
            {modelSpecs.architectureType}
          </span>
        </div>

        <p className="text-xs text-slate-200 mb-2.5 leading-relaxed font-sans">{selectedLayer.details}</p>

        {/* Math & Tensor Shapes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          {selectedLayer.internals.map((item, idx) => (
            <div key={idx} className="rounded border border-white/[0.06] bg-[#02050e] p-2.5">
              <span className="text-slate-400 block text-xs font-semibold mb-0.5">{item.name}</span>
              <span className="text-cyan-300 font-bold text-xs block truncate">{item.shape || item.formula}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Network Telemetry Ribbon */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between rounded-lg border border-white/[0.06] bg-[#03060c] px-3 py-2 text-xs text-slate-300">
        <div>
          <span>Architecture: </span>
          <strong className="text-cyan-300">{modelSpecs.modelId}</strong> • <span>Intermediate Dim: </span>
          <strong className="text-cyan-300">{modelSpecs.intermediateDim.toLocaleString()}</strong> • <span>Context Cap: </span>
          <strong className="text-cyan-300">{modelSpecs.contextWindow.toLocaleString()} tok</strong>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Input: <strong className="text-blue-400">{tokensIn} tok</strong>
          </span>
          <span>
            Output: <strong className="text-cyan-300">{tokensOut} tok</strong>
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
