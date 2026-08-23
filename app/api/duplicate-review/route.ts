import { headers } from "next/headers";
import { NextResponse } from "next/server";

const reviewStatuses = new Set([
  "Pending", "Confirmed Duplicate", "Same Project", "Not Duplicate", "Needs Review",
]);

export async function POST(request: Request) {
  const apiUrl = process.env.MPH_API_URL;
  const apiToken = process.env.MPH_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return NextResponse.json({ error: "Live data connection unavailable" }, { status: 503 });
  }

  const actor = (await headers()).get("oai-authenticated-user-email") ?? "Site owner";
  const body = await request.json();
  if (!body?.candidate_id || !reviewStatuses.has(body?.review_status)) {
    return NextResponse.json({ error: "Invalid duplicate review" }, { status: 400 });
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mph-token": apiToken },
    body: JSON.stringify({
      action: "review_duplicate",
      candidate_id: body.candidate_id,
      review_status: body.review_status,
      review_note: String(body.review_note || "").slice(0, 1000),
      reviewer: actor,
    }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
