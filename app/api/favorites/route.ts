import { NextResponse } from "next/server";
import type { CollectedListing } from "@/lib/listings";
import { listingEventData, recordDecisionEvent } from "@/lib/decision-events";
import { requireUser } from "@/lib/auth/request-user";
import {
  addFavorite,
  favoriteListingKey,
  readFavorites,
  removeFavorite,
  resolvePropertyIdByLink,
} from "@/lib/db/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await readFavorites(user.id);
    return NextResponse.json({ items, links: items.map((item) => item.link) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar favoritos." },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { listing?: CollectedListing };
    if (!body.listing?.link) {
      return NextResponse.json({ error: "Informe o imóvel." }, { status: 400 });
    }
    const propertyId = await resolvePropertyIdByLink(body.listing.link);
    const listingKey = await addFavorite(user.id, body.listing, propertyId);
    await recordDecisionEvent({
      propertyId,
      listingId: body.listing.id,
      userId: user.id,
      eventType: "favorite_added",
      source: "interface",
      purpose: body.listing.purpose,
      afterData: listingEventData(body.listing),
      reason: "Favoritado pelo usuário.",
    });
    return NextResponse.json({ listingKey });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar favorito." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const link = url.searchParams.get("link");
    const key = url.searchParams.get("key") ?? (link ? favoriteListingKey(link) : "");
    if (!key) return NextResponse.json({ error: "Informe o favorito." }, { status: 400 });
    const propertyId = link ? await resolvePropertyIdByLink(link) : undefined;
    await removeFavorite(user.id, key);
    if (link) {
      await recordDecisionEvent({
        propertyId,
        userId: user.id,
        eventType: "favorite_removed",
        source: "interface",
        reason: "Favorito removido pelo usuário.",
      });
    }
    return NextResponse.json({ removed: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível remover favorito." },
      { status: 400 },
    );
  }
}
