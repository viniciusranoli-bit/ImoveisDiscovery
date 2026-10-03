import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/request-user";
import { dismissListingForUser, readDismissedListingHistory } from "@/lib/db/repository";
import type { CollectedListing } from "@/lib/listings";
import { listingEventData, recordDecisionEvent } from "@/lib/decision-events";
import { resolvePropertyIdByLink } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const [sale, rent] = await Promise.all([
      readDismissedListingHistory("sale", 100, user.id),
      readDismissedListingHistory("rent", 100, user.id),
    ]);
    return NextResponse.json({ items: [...sale, ...rent] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar os descartados." },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { link?: string; listing?: CollectedListing };
    if (!body.link || !body.listing?.title) {
      return NextResponse.json({ error: "Informe o imóvel para descartar." }, { status: 400 });
    }
    await dismissListingForUser({
      userId: user.id,
      link: body.link,
      listing: body.listing,
    });
    await recordDecisionEvent({
      propertyId: await resolvePropertyIdByLink(body.link),
      listingId: body.listing.id,
      userId: user.id,
      eventType: "property_dismissed",
      source: "interface",
      purpose: body.listing.purpose,
      afterData: listingEventData(body.listing),
      reason: "Imóvel descartado pelo usuário.",
    });
    return NextResponse.json({ dismissed: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível descartar o imóvel." },
      { status: 400 },
    );
  }
}
