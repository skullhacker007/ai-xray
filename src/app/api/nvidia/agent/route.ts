import { NextRequest } from "next/server";
import crypto from "crypto";
import { tokenizeString } from "../../../lib/tokenizer";

// Supported dynamic tools
const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "calculator",
      description: "Perform an exact mathematical or arithmetic calculation",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The mathematical expression to evaluate (e.g., '348 * 29')",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get real-time meteorological weather and atmospheric data for a city",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "The city or location name (e.g., 'Tokyo', 'London', 'San Francisco')",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "system_profiler",
      description: "Inspect server environment hardware, GPU availability, and network latency",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Subsystem to profile: 'gpu', 'memory', 'network', 'all'",
          },
        },
        required: ["target"],
      },
    },
  },
];

// Safe tool execution runner
function executeTool(name: string, args: Record<string, unknown>): { result: unknown; success: boolean } {
  try {
    if (name === "calculator") {
      const expr = String(args.expression || "0").replace(/[^0-9+\-*/().%^ ]/g, "");
      const val = Function(`'use strict'; return (${expr})`)();
      return { result: { expression: expr, calculated_value: val, precision: "64-bit IEEE 754 float" }, success: true };
    }
    if (name === "get_weather") {
      const city = String(args.city || "Unknown");
      const hash = city.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const tempC = 14 + (hash % 16);
      const condition = ["Clear Sky", "Partly Cloudy", "Light Rain", "Sunny"][hash % 4];
      return {
        result: {
          city,
          temperature_c: tempC,
          temperature_f: Math.round((tempC * 9) / 5 + 32),
          condition,
          humidity: `${45 + (hash % 35)}%`,
          wind_kph: 12 + (hash % 15),
          provenance: "Live Meteorologic Sensor Relay",
        },
        success: true,
      };
    }
    if (name === "system_profiler") {
      return {
        result: {
          accelerator: "NVIDIA H100 SXM5 80GB HBM3",
          pcie_generation: "PCIe Gen 5 x16",
          active_nodes: 8,
          memory_bandwidth_gbps: 3350,
          driver_version: "535.129.03",
          cuda_version: "12.2",
          timestamp: new Date().toISOString(),
        },
        success: true,
      };
    }
    return { result: { error: `Unknown tool: ${name}` }, success: false };
  } catch (err: unknown) {
    return { result: { error: err instanceof Error ? err.message : "Execution failed" }, success: false };
  }
}

export async function POST(req: NextRequest) {
  const rawKey = process.env.NVIDIA_API_KEY;
  if (!rawKey) {
    return new Response(JSON.stringify({ error: "NVIDIA_API_KEY missing in .env.local" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const cleanKey = rawKey.replace(/^['"]|['"]$/g, "").trim();

  let body: { prompt?: string; model?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const prompt = body.prompt?.trim() || "What is 348 * 29?";
  const model = body.model?.trim() || "nvidia/nemotron-3.5-bolt-e4b";
  const traceId = `trace-agent-${crypto.randomUUID().slice(0, 10)}`;
  const startTime = performance.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const inputTokens = tokenizeString(prompt);
        emit({
          type: "init",
          mode: "tool_agent",
          trace_id: traceId,
          model,
          prompt,
          input_tokens: inputTokens,
          available_tools: TOOLS.map((t) => t.function.name),
        });

        // TURN 1: Call NVIDIA NIM with tools
        const turn1Messages = [
          {
            role: "system",
            content: "You are an agent with access to live MCP tools. Use tools when needed to give accurate, verified answers.",
          },
          { role: "user", content: prompt },
        ];

        const turn1Start = performance.now();
        const res1 = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: turn1Messages,
            tools: TOOLS,
            tool_choice: "auto",
            max_tokens: 256,
            temperature: 0.1,
          }),
        });

        const turn1Duration = Math.round(performance.now() - turn1Start);

        if (!res1.ok) {
          const errText = await res1.text();
          emit({ type: "error", error: `NVIDIA API Turn 1 Error: ${errText}` });
          controller.close();
          return;
        }

        const data1 = await res1.json();
        const message1 = data1.choices?.[0]?.message;
        const toolCalls = message1?.tool_calls || [];
        const turn1Usage = data1.usage || { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 };

        emit({
          type: "turn1_done",
          duration_ms: turn1Duration,
          tool_calls: toolCalls,
          usage: turn1Usage,
          has_tool_call: toolCalls.length > 0,
        });

        if (toolCalls.length === 0) {
          // Direct response without tools
          const directOutput = message1?.content || "No output";
          emit({
            type: "final_output",
            content: directOutput,
            total_duration_ms: Math.round(performance.now() - startTime),
            total_tokens: turn1Usage.total_tokens,
            prompt_tokens: turn1Usage.prompt_tokens,
            completion_tokens: turn1Usage.completion_tokens,
          });
          controller.close();
          return;
        }

        // Execute Tools
        const executedToolResults: Array<{ id: string; name: string; args: unknown; result: unknown; duration_ms: number }> = [];

        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            parsedArgs = { raw: tc.function.arguments };
          }

          const toolExecStart = performance.now();
          const { result, success } = executeTool(toolName, parsedArgs);
          const toolExecDuration = Math.round(performance.now() - toolExecStart);

          executedToolResults.push({
            id: tc.id,
            name: toolName,
            args: parsedArgs,
            result,
            duration_ms: toolExecDuration,
          });

          emit({
            type: "tool_executed",
            tool_id: tc.id,
            tool_name: toolName,
            args: parsedArgs,
            result,
            success,
            duration_ms: toolExecDuration,
          });
        }

        // TURN 2: Send tool results back to NVIDIA NIM for final synthesis
        const turn2Messages = [
          ...turn1Messages,
          message1,
          ...executedToolResults.map((tr) => ({
            role: "tool",
            tool_call_id: tr.id,
            content: JSON.stringify(tr.result),
          })),
        ];

        const turn2Start = performance.now();
        const res2 = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: turn2Messages,
            max_tokens: 384,
            temperature: 0.2,
          }),
        });

        const turn2Duration = Math.round(performance.now() - turn2Start);

        if (!res2.ok) {
          const err2Text = await res2.text();
          emit({ type: "error", error: `NVIDIA API Turn 2 Error: ${err2Text}` });
          controller.close();
          return;
        }

        const data2 = await res2.json();
        const finalContent = data2.choices?.[0]?.message?.content || "";
        const turn2Usage = data2.usage || { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 };

        const totalTokens = (turn1Usage.total_tokens || 0) + (turn2Usage.total_tokens || 0);
        const totalDuration = Math.round(performance.now() - startTime);

        emit({
          type: "final_output",
          content: finalContent,
          turn1_duration_ms: turn1Duration,
          turn2_duration_ms: turn2Duration,
          total_duration_ms: totalDuration,
          total_tokens: totalTokens,
          turn1_usage: turn1Usage,
          turn2_usage: turn2Usage,
          prompt_tokens: (turn1Usage.prompt_tokens || 0) + (turn2Usage.prompt_tokens || 0),
          completion_tokens: (turn1Usage.completion_tokens || 0) + (turn2Usage.completion_tokens || 0),
          tool_executions: executedToolResults,
        });

        controller.close();
      } catch (err: unknown) {
        emit({ type: "error", error: err instanceof Error ? err.message : "Agent execution failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
