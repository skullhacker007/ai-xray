import { NextResponse } from "next/server";

// Recommended high-speed chat models tested with NVIDIA NIM
const FEATURED_MODELS = [
  "nvidia/nemotron-3.5-bolt-e4b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "mistralai/mistral-large-4-1t-a52b",
  "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
  "poolside/laguna-xs-2.1",
  "google/diffusiongemma-26b-a4b-it",
  "meta/llama-guard-4-12b",
  "nvidia/riva-translate-4b-instruct-v2",
];

export async function GET() {
  const rawKey = process.env.NVIDIA_API_KEY;
  if (!rawKey) {
    return NextResponse.json(
      {
        success: false,
        error: "NVIDIA_API_KEY is not defined in .env.local",
        models: [],
      },
      { status: 400 }
    );
  }

  const cleanKey = rawKey.replace(/^['"]|['"]$/g, "").trim();

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        Accept: "application/json",
      },
      // Cache for 60 seconds
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        {
          success: false,
          error: `NVIDIA API responded with ${res.status}: ${errText}`,
          models: [],
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawList: Array<{ id: string; owned_by: string; created: number }> =
      data.data || [];

    // Sort so featured active models appear at top
    const sorted = [...rawList].sort((a, b) => {
      const aFeatured = FEATURED_MODELS.indexOf(a.id);
      const bFeatured = FEATURED_MODELS.indexOf(b.id);
      if (aFeatured !== -1 && bFeatured !== -1) return aFeatured - bFeatured;
      if (aFeatured !== -1) return -1;
      if (bFeatured !== -1) return 1;
      return a.id.localeCompare(b.id);
    });

    return NextResponse.json({
      success: true,
      count: sorted.length,
      defaultModel: "nvidia/nemotron-3.5-bolt-e4b",
      models: sorted.map((m) => ({
        id: m.id,
        ownedBy: m.owned_by,
        isFeatured: FEATURED_MODELS.includes(m.id),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    return NextResponse.json(
      {
        success: false,
        error: message,
        models: [],
      },
      { status: 500 }
    );
  }
}
