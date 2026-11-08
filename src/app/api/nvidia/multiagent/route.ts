import { NextRequest } from "next/server";
import crypto from "crypto";
import { tokenizeString } from "../../../lib/tokenizer";

export async function POST(req: NextRequest) {
  const rawKey = process.env.NVIDIA_API_KEY;
  if (!rawKey) {
    return new Response(JSON.stringify({ error: "NVIDIA_API_KEY missing in .env.local" }), { status: 400 });
  }
  const cleanKey = rawKey.replace(/^['"]|['"]$/g, "").trim();

  let body: { prompt?: string; model?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const prompt = body.prompt?.trim() || "Design an ultra-low latency event streaming architecture for AI inference.";
  const model = body.model?.trim() || "nvidia/nemotron-3.5-bolt-e4b";
  const traceId = `trace-multiagent-${crypto.randomUUID().slice(0, 10)}`;
  const startTime = performance.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        emit({
          type: "init",
          mode: "multi_agent",
          trace_id: traceId,
          model,
          prompt,
          agents: ["Planner Agent", "Specialist Agent", "Critic & Synthesizer"],
        });

        // -------------------------------------------------------------
        // AGENT 1: PLANNER
        // -------------------------------------------------------------
        emit({ type: "agent_start", agent_id: "planner", agent_name: "NAVI Planner" });
        const p1Start = performance.now();
        const resPlanner = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(18000),
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are the Planner Agent. Given the user goal, break it down into 3 concise technical requirements for the Specialist Agent.",
              },
              { role: "user", content: prompt },
            ],
            max_tokens: 150,
            temperature: 0.2,
          }),
        });

        if (!resPlanner.ok) {
          emit({ type: "error", error: "Planner agent execution failed" });
          controller.close();
          return;
        }

        const dataPlanner = await resPlanner.json();
        const msgPlanner = dataPlanner.choices?.[0]?.message;
        const planText = msgPlanner?.content || msgPlanner?.reasoning_content || "";
        const planUsage = dataPlanner.usage || {
          prompt_tokens: tokenizeString(prompt).length + 25,
          completion_tokens: tokenizeString(planText).length,
          total_tokens: tokenizeString(prompt).length + 25 + tokenizeString(planText).length,
        };
        const p1Duration = Math.round(performance.now() - p1Start);

        emit({
          type: "agent_done",
          agent_id: "planner",
          agent_name: "NAVI Planner",
          duration_ms: p1Duration,
          output: planText,
          usage: planUsage,
        });

        // -------------------------------------------------------------
        // AGENT 2: SPECIALIST
        // -------------------------------------------------------------
        emit({ type: "agent_start", agent_id: "specialist", agent_name: "NAVI Specialist" });
        const p2Start = performance.now();
        const resSpecialist = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(18000),
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are the Specialist Agent. Implement the technical solution based strictly on the planner requirements provided.",
              },
              { role: "user", content: `Goal: ${prompt}\n\nPlanner Specifications:\n${planText}` },
            ],
            max_tokens: 220,
            temperature: 0.2,
          }),
        });

        if (!resSpecialist.ok) {
          emit({ type: "error", error: "Specialist agent execution failed" });
          controller.close();
          return;
        }

        const dataSpecialist = await resSpecialist.json();
        const msgSpecialist = dataSpecialist.choices?.[0]?.message;
        const specialistText = msgSpecialist?.content || msgSpecialist?.reasoning_content || "";
        const specUsage = dataSpecialist.usage || {
          prompt_tokens: tokenizeString(prompt + planText).length + 25,
          completion_tokens: tokenizeString(specialistText).length,
          total_tokens: tokenizeString(prompt + planText).length + 25 + tokenizeString(specialistText).length,
        };
        const p2Duration = Math.round(performance.now() - p2Start);

        emit({
          type: "agent_done",
          agent_id: "specialist",
          agent_name: "NAVI Specialist",
          duration_ms: p2Duration,
          output: specialistText,
          usage: specUsage,
        });

        // -------------------------------------------------------------
        // AGENT 3: CRITIC & SYNTHESIZER
        // -------------------------------------------------------------
        emit({ type: "agent_start", agent_id: "critic", agent_name: "NAVI Critic & Synthesizer" });
        const p3Start = performance.now();
        const resCritic = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(18000),
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are the Critic and Synthesizer Agent. Review the specialist solution and produce the verified, high-level summary response for the user.",
              },
              {
                role: "user",
                content: `Original Goal: ${prompt}\n\nSpecialist Draft:\n${specialistText}`,
              },
            ],
            max_tokens: 250,
            temperature: 0.2,
          }),
        });

        if (!resCritic.ok) {
          emit({ type: "error", error: "Critic agent execution failed" });
          controller.close();
          return;
        }

        const dataCritic = await resCritic.json();
        const msgCritic = dataCritic.choices?.[0]?.message;
        const finalReview = msgCritic?.content || msgCritic?.reasoning_content || "";
        const criticUsage = dataCritic.usage || {
          prompt_tokens: tokenizeString(prompt + specialistText).length + 25,
          completion_tokens: tokenizeString(finalReview).length,
          total_tokens: tokenizeString(prompt + specialistText).length + 25 + tokenizeString(finalReview).length,
        };
        const p3Duration = Math.round(performance.now() - p3Start);

        emit({
          type: "agent_done",
          agent_id: "critic",
          agent_name: "NAVI Critic & Synthesizer",
          duration_ms: p3Duration,
          output: finalReview,
          usage: criticUsage,
        });

        const totalTokens =
          (planUsage.total_tokens || 0) + (specUsage.total_tokens || 0) + (criticUsage.total_tokens || 0);
        const totalDuration = Math.round(performance.now() - startTime);

        emit({
          type: "final_output",
          content: finalReview,
          total_duration_ms: totalDuration,
          total_tokens: totalTokens,
          prompt_tokens:
            (planUsage.prompt_tokens || 0) + (specUsage.prompt_tokens || 0) + (criticUsage.prompt_tokens || 0),
          completion_tokens:
            (planUsage.completion_tokens || 0) +
            (specUsage.completion_tokens || 0) +
            (criticUsage.completion_tokens || 0),
          breakdown: [
            { agent: "NAVI Planner", duration_ms: p1Duration, tokens: planUsage.total_tokens, output: planText },
            { agent: "NAVI Specialist", duration_ms: p2Duration, tokens: specUsage.total_tokens, output: specialistText },
            { agent: "NAVI Critic & Synthesizer", duration_ms: p3Duration, tokens: criticUsage.total_tokens, output: finalReview },
          ],
        });

        controller.close();
      } catch (err: unknown) {
        emit({ type: "error", error: err instanceof Error ? err.message : "Multi-agent execution failed" });
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
