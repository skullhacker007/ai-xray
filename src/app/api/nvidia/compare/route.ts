import { NextRequest } from "next/server";
import crypto from "crypto";

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

  const prompt = body.prompt?.trim() || "State 3 key advantages of flash attention in transformer inference.";
  const modelA = body.modelA?.trim() || "nvidia/nemotron-3.5-bolt-e4b";
  const modelB = body.modelB?.trim() || "nvidia/nemotron-3.5-lightning-30b-a3b";
  const traceId = `trace-compare-${crypto.randomUUID().slice(0, 10)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
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

        // Run both models in parallel
        const startA = performance.now();
        const startB = performance.now();

        const pA = fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
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
            return { success: false, error: err, duration_ms: dur, model: modelA };
          }
          const d = await res.json();
          return {
            success: true,
            model: modelA,
            duration_ms: dur,
            content: d.choices?.[0]?.message?.content || "",
            usage: d.usage || { prompt_tokens: 30, completion_tokens: 60, total_tokens: 90 },
          };
        });

        const pB = fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
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
            return { success: false, error: err, duration_ms: dur, model: modelB };
          }
          const d = await res.json();
          return {
            success: true,
            model: modelB,
            duration_ms: dur,
            content: d.choices?.[0]?.message?.content || "",
            usage: d.usage || { prompt_tokens: 30, completion_tokens: 60, total_tokens: 90 },
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
