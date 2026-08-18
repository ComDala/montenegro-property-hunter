import { headers } from "next/headers";
import { NextResponse } from "next/server";

const statuses = new Set([
  "New", "Review", "Watch", "Hot Deal", "Contact Agent", "Contacted",
  "Viewing", "Negotiating", "Rejected", "Purchased", "Removed",
]);

export async function POST(request: Request) {
  const apiUrl = process.env.MPH_API_URL;
  const apiToken = process.env.MPH_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return NextResponse.json({ error: "Live data connection unavailable" }, { status: 503 });
  }

  const actor = (await headers()).get("oai-authenticated-user-email") ?? "Site owner";
  const body = await request.json();
  if (!body?.listing_id || !statuses.has(body?.status)) {
    return NextResponse.json({ error: "Invalid status update" }, { status: 400 });
  }

  const reason = `${String(body.reason || "Manual status change").slice(0, 240)} · ${actor}`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mph-token": apiToken },
    body: JSON.stringify({ action: "update_status", listing_id: body.listing_id, status: body.status, reason }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
