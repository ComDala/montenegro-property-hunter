import { headers } from "next/headers";
import { NextResponse } from "next/server";

const numericFields = [
  "purchase_price", "transfer_tax_cost", "legal_notary_cost", "agency_fee_cost",
  "renovation_budget", "furnishing_budget", "other_costs", "expected_monthly_rent",
  "annual_operating_costs", "offered_price",
] as const;

const textLimits: Record<string, number> = {
  contact_method: 40,
  contact_person: 320,
  response_summary: 5000,
  questions_to_ask: 5000,
  negotiation_notes: 5000,
  next_action: 1000,
};

export async function POST(request: Request) {
  const apiUrl = process.env.MPH_API_URL;
  const apiToken = process.env.MPH_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return NextResponse.json({ error: "Live data connection unavailable" }, { status: 503 });
  }

  const actor = (await headers()).get("oai-authenticated-user-email") ?? "Site owner";
  const body = await request.json();
  if (!body?.listing_id || !body?.workflow || typeof body.workflow !== "object") {
    return NextResponse.json({ error: "Invalid deal plan" }, { status: 400 });
  }

  const workflow: Record<string, unknown> = {};
  for (const field of numericFields) {
    const value = body.workflow[field];
    if (value == null || value === "") {
      workflow[field] = null;
      continue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    workflow[field] = parsed;
  }

  for (const [field, limit] of Object.entries(textLimits)) {
    const value = String(body.workflow[field] ?? "").trim();
    workflow[field] = value ? value.slice(0, limit) : null;
  }

  for (const field of ["contacted_at", "viewing_at", "follow_up_at"]) {
    const value = String(body.workflow[field] ?? "").trim();
    if (value && Number.isNaN(Date.parse(value))) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    workflow[field] = value || null;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mph-token": apiToken },
    body: JSON.stringify({ action: "save_workflow", listing_id: body.listing_id, workflow, actor }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
