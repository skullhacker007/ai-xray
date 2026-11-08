import { NextRequest } from "next/server";
import crypto from "crypto";
import { tokenizeString } from "../../../lib/tokenizer";

export async function POST(req: NextRequest) {
  const rawKey = process.env.NVIDIA_API_KEY;
  if (!rawKey) {
    return new Response(JSON.stringify({ error: "NVIDIA_API_KEY missing in .env.local" }), { status: 400 });
  }
  const cleanKey = rawKey.replace(/^['"]|['"]$/g, "").trim();

  let body: { prompt?: string; modelA?: string; modelB?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const prompt = (body.prompt?.trim() || "State 3 key advantages of flash attention in transformer inference.").slice(0, 32000);
  const modelA = (body.modelA?.trim() || "nvidia/nemotron-3.5-bolt-e4b").slice(0, 120);
  const modelB = (body.modelB?.trim() || "poolside/laguna-xs-2.1").slice(0, 120);
  const traceId = `trace-compare-${crypto.randomUUID().slice(0, 10)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      try {
        emit({
          type: "init",
          mode: "compare",
          trace_id: traceId,
          prompt,
          modelA,
          modelB,
          timestamp: new Date().toISOString(),
        });

        const compareSignal = AbortSignal.any([req.signal, AbortSignal.timeout(25000)]);
        const inTokensApprox = tokenizeString(prompt).length + 15;

        // Run both models in parallel
        const startA = performance.now();
        const startB = performance.now();

        const pA = fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
          signal: compareSignal,
          body: JSON.stringify({
            model: modelA,
            messages: [
              { role: "system", content: "You are an AI benchmarked by AI X-RAY. Be concise and technical." },
              { role: "user", content: prompt },
            ],
            max_tokens: 220,
            temperature: 0.1,
          }),
        }).then(async (res) => {
          const dur = Math.round(performance.now() - startA);
          if (!res.ok) {
            const err = await res.text();
            return {
              success: false,
              error: err,
              duration_ms: dur,
              model: modelA,
              content: `[Model A Error (${res.status})]: ${err}`,
              usage: { prompt_tokens: inTokensApprox, completion_tokens: 0, total_tokens: inTokensApprox },
            };
          }
          const d = await res.json();
          const msgA = d.choices?.[0]?.message;
          const cA = msgA?.content || msgA?.reasoning_content || "";
          const inA = tokenizeString(prompt).length + 15;
          const outA = tokenizeString(cA).length;
          return {
            success: true,
            model: modelA,
            duration_ms: dur,
            content: cA,
            usage: d.usage || { prompt_tokens: inA, completion_tokens: outA, total_tokens: inA + outA },
          };
        }).catch((err: unknown) => {
          const dur = Math.round(performance.now() - startA);
          const errMsg = err instanceof Error ? err.message : "Request failed";
          return {
            success: false,
            error: errMsg,
            duration_ms: dur,
            model: modelA,
            content: `[Model A Connection Error]: ${errMsg}`,
            usage: { prompt_tokens: inTokensApprox, completion_tokens: 0, total_tokens: inTokensApprox },
          };
        });

        const pB = fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
          signal: compareSignal,
          body: JSON.stringify({
            model: modelB,
            messages: [
              { role: "system", content: "You are an AI benchmarked by AI X-RAY. Be concise and technical." },
              { role: "user", content: prompt },
            ],
            max_tokens: 220,
            temperature: 0.1,
          }),
        }).then(async (res) => {
          const dur = Math.round(performance.now() - startB);
          if (!res.ok) {
            const err = await res.text();
            return {
              success: false,
              error: err,
              duration_ms: dur,
              model: modelB,
              content: `[Model B Error (${res.status})]: ${err}`,
              usage: { prompt_tokens: inTokensApprox, completion_tokens: 0, total_tokens: inTokensApprox },
            };
          }
          const d = await res.json();
          const msgB = d.choices?.[0]?.message;
          const cB = msgB?.content || msgB?.reasoning_content || "";
          const inB = tokenizeString(prompt).length + 15;
          const outB = tokenizeString(cB).length;
          return {
            success: true,
            model: modelB,
            duration_ms: dur,
            content: cB,
            usage: d.usage || { prompt_tokens: inB, completion_tokens: outB, total_tokens: inB + outB },
          };
        }).catch((err: unknown) => {
          const dur = Math.round(performance.now() - startB);
          const errMsg = err instanceof Error ? err.message : "Request failed";
          return {
            success: false,
            error: errMsg,
            duration_ms: dur,
            model: modelB,
            content: `[Model B Connection Error]: ${errMsg}`,
            usage: { prompt_tokens: inTokensApprox, completion_tokens: 0, total_tokens: inTokensApprox },
          };
        });

        type ModelResult = {
          success: boolean;
          model: string;
          duration_ms: number;
          content: string;
          error?: string;
          usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        const [resultA, resultB] = (await Promise.all([pA, pB])) as [ModelResult, ModelResult];

        emit({
          type: "compare_done",
          resultA,
          resultB,
          total_tokens: (resultA.usage?.total_tokens || 0) + (resultB.usage?.total_tokens || 0),
        });

        controller.close();
      } catch (err: unknown) {
        emit({ type: "error", error: err instanceof Error ? err.message : "Comparison failed" });
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
