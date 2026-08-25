import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const apiUrl = process.env.MPH_API_URL;
  const apiToken = process.env.MPH_API_TOKEN;
  if (!apiUrl || !apiToken) return NextResponse.json({ error: "Live data connection unavailable" }, { status: 503 });

  const actor = (await headers()).get("oai-authenticated-user-email");
  if (!actor) return NextResponse.json({ error: "Authenticated owner session required" }, { status: 401 });
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mph-token": apiToken },
    body: JSON.stringify({ action: "enrich_photos", batch_size: 16, actor }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
