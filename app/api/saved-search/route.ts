import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiUrl = process.env.MPH_API_URL;
  const apiToken = process.env.MPH_API_TOKEN;
  if (!apiUrl || !apiToken) return NextResponse.json({ error: "Live data connection unavailable" }, { status: 503 });

  const actor = (await headers()).get("oai-authenticated-user-email") ?? "Site owner";
  const body = await request.json();
  const action = body?.action === "delete" ? "delete_search" : "save_search";
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mph-token": apiToken },
    body: JSON.stringify(action === "delete_search"
      ? { action, search_id: body.search_id, actor }
      : { action, search: body.search, actor }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
