import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiUrl = process.env.MPH_API_URL;
  const apiToken = process.env.MPH_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return NextResponse.json({ error: "Live data connection unavailable" }, { status: 503 });
  }

  const actor = (await headers()).get("oai-authenticated-user-email") ?? "Site owner";
  const body = await request.json();
  if (!body?.listing_id || typeof body?.is_favorite !== "boolean" || typeof body?.private_notes !== "string") {
    return NextResponse.json({ error: "Invalid annotation update" }, { status: 400 });
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mph-token": apiToken },
    body: JSON.stringify({
      action: "update_annotation",
      listing_id: body.listing_id,
      is_favorite: body.is_favorite,
      private_notes: body.private_notes.slice(0, 5000),
      actor,
    }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
