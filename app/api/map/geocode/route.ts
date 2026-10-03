import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/request-user";
import { geocodeMapProperties } from "@/lib/map/geocode-service";
import type { MapProperty } from "@/lib/map/street-group";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as { properties?: MapProperty[] };
    const properties = body.properties ?? [];
    if (!properties.length) {
      return NextResponse.json({
        groups: [],
        markers: [],
        mappedCount: 0,
        skippedCount: 0,
        inputCount: 0,
      });
    }
    if (properties.length > 500) {
      return NextResponse.json(
        { error: "O mapa aceita no máximo 500 imóveis por vez. Reduza os filtros na busca." },
        { status: 400 },
      );
    }
    const result = await geocodeMapProperties(properties);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível montar o mapa." },
      { status: error instanceof Error && error.message.includes("login") ? 401 : 500 },
    );
  }
}
