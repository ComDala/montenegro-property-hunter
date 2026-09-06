const TOKEN_HASH = Deno.env.get("MPH_TOKEN_HASH") ?? "";

const encoder = new TextEncoder();

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isAuthorized(req: Request) {
  const token = req.headers.get("x-mph-token") ?? "";
  return Boolean(token) && (await sha256(token)) === TOKEN_HASH;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function adminKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys);
    if (parsed.default) return parsed.default as string;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function proxyRpc(supabaseUrl: string, headers: Record<string, string>, name: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeText(value: unknown, limit: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, limit) : null;
}

function safeStringArray(value: unknown, limit = 20) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => safeText(item, 120)).filter((item): item is string => Boolean(item)))).slice(0, limit);
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/g, '"');
}

function extractPhotoUrls(html: string, pageUrl: string) {
  const candidates: string[] = [];
  const add = (raw: string) => {
    const cleaned = decodeHtml(raw.trim()).replace(/^['"]|['"]$/g, "");
    if (!cleaned || cleaned.startsWith("data:")) return;
    try {
      const url = new URL(cleaned, pageUrl);
      if (url.protocol !== "https:") return;
      const lower = url.href.toLowerCase();
      if (/logo|favicon|sprite|avatar|placeholder|spinner|icon|payment|flag|map-marker/.test(lower)) return;
      if (!(/\.(?:jpe?g|webp|png)(?:$|\?)/i.test(lower) || /image|photo|gallery|upload|media|cdn/.test(lower))) return;
      candidates.push(url.href);
    } catch {
      // Ignore malformed source markup.
    }
  };

  const attributePattern = /(?:content|src|data-src|data-lazy-src|data-original)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(attributePattern)) add(match[1]);
  const srcsetPattern = /(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(srcsetPattern)) {
    for (const entry of match[1].split(",")) add(entry.trim().split(/\s+/)[0]);
  }
  const jsonImagePattern = /"(?:image|images|photo|photos|gallery)"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]*)?)["]/gi;
  for (const match of html.matchAll(jsonImagePattern)) add(match[1].replace(/\\\//g, "/"));
  return Array.from(new Set(candidates)).slice(0, 24);
}

async function enrichPhotos(supabaseUrl: string, headers: Record<string, string>, batchSize: number) {
  const queueResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_photo_enrichment_queue`, {
    method: "POST", headers, body: JSON.stringify({ p_limit: Math.max(1, Math.min(batchSize, 24)) }),
  });
  if (!queueResponse.ok) throw new Error("Photo queue unavailable");
  const queue = await queueResponse.json() as Array<{ listing_id: string; source: string; canonical_url: string }>;

  const results = await Promise.all(queue.map(async (listing) => {
    let photos: string[] = [];
    let error: string | null = null;
    try {
      const response = await fetch(listing.canonical_url, {
        redirect: "follow",
        headers: {
          "accept": "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 (compatible; MontenegroPropertyHunter/1.0; listing photo metadata enrichment)",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = (await response.text()).slice(0, 3_000_000);
      photos = extractPhotoUrls(html, response.url || listing.canonical_url);
      if (!photos.length) error = "No safe listing photos found in page metadata";
    } catch (caught) {
      error = caught instanceof Error ? caught.message.slice(0, 240) : "Page fetch failed";
    }

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/listing_photo_enrichment?on_conflict=listing_id`, {
      method: "POST",
      headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        listing_id: listing.listing_id,
        source_page_url: listing.canonical_url,
        photo_urls: photos,
        extraction_method: "page_metadata_v1",
        extracted_at: photos.length ? new Date().toISOString() : null,
        last_attempted_at: new Date().toISOString(),
        last_error: error,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!saveResponse.ok) throw new Error("Photo result could not be stored");
    return { source: listing.source, found: photos.length };
  }));

  return {
    attempted: results.length,
    enriched: results.filter((item) => item.found > 0).length,
    photos_found: results.reduce((sum, item) => sum + item.found, 0),
    by_source: results.reduce<Record<string, { attempted: number; enriched: number; photos_found: number }>>((summary, item) => {
      summary[item.source] ??= { attempted: 0, enriched: 0, photos_found: 0 };
      summary[item.source].attempted += 1;
      summary[item.source].enriched += Number(item.found > 0);
      summary[item.source].photos_found += item.found;
      return summary;
    }, {}),
  };
}

Deno.serve(async (req: Request) => {
  if (!(await isAuthorized(req))) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const key = adminKey();
  if (!supabaseUrl || !key) return json({ error: "Backend configuration unavailable" }, 500);
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

  try {
    if (req.method === "GET") {
      const [dashboardResponse, workflowResponse, photoResponse, duplicateRefreshResponse, savedSearchResponse] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/rpc/get_property_hunter_dashboard`, { method: "POST", headers, body: "{}" }),
        fetch(`${supabaseUrl}/rest/v1/listing_workflows?select=*`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/rpc/get_listing_photo_urls`, { method: "POST", headers, body: "{}" }),
        fetch(`${supabaseUrl}/rest/v1/rpc/get_duplicate_refresh_status`, { method: "POST", headers, body: "{}" }),
        fetch(`${supabaseUrl}/rest/v1/saved_searches?select=*&is_active=eq.true&order=created_at.asc`, { headers }),
      ]);

      if (!dashboardResponse.ok) {
        return new Response(await dashboardResponse.text(), { status: dashboardResponse.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      const dashboard = await dashboardResponse.json();
      const workflows = workflowResponse.ok ? await workflowResponse.json() : [];
      const photos = photoResponse.ok ? await photoResponse.json() : [];
      dashboard.duplicate_refresh = duplicateRefreshResponse.ok ? await duplicateRefreshResponse.json() : {};
      dashboard.saved_searches = savedSearchResponse.ok ? await savedSearchResponse.json() : [];
      const workflowByListing = new Map(workflows.map((workflow: Record<string, unknown>) => [workflow.listing_id, workflow]));
      const photosByListing = new Map(photos.map((entry: Record<string, unknown>) => [entry.listing_id, entry.photo_urls]));
      dashboard.listings = (dashboard.listings ?? []).map((listing: Record<string, unknown>) => ({
        ...listing,
        workflow: workflowByListing.get(listing.id) ?? null,
        photo_urls: photosByListing.get(listing.id) ?? [],
      }));
      return json(dashboard);
    }

    if (req.method === "POST") {
      const payload = await req.json();
      if (payload?.action === "update_status") return await proxyRpc(supabaseUrl, headers, "set_manual_listing_status", { p_listing_id: payload.listing_id, p_new_status: payload.status, p_reason: payload.reason ?? "Manual status change from Phase 1 interface" });
      if (payload?.action === "update_annotation") return await proxyRpc(supabaseUrl, headers, "set_listing_annotation", { p_listing_id: payload.listing_id, p_is_favorite: Boolean(payload.is_favorite), p_private_notes: typeof payload.private_notes === "string" ? payload.private_notes.slice(0, 5000) : null });
      if (payload?.action === "review_duplicate") return await proxyRpc(supabaseUrl, headers, "set_duplicate_review", { p_candidate_id: payload.candidate_id, p_review_status: payload.review_status, p_review_note: typeof payload.review_note === "string" ? payload.review_note.slice(0, 1000) : null, p_reviewer: typeof payload.reviewer === "string" ? payload.reviewer.slice(0, 320) : null });
      if (payload?.action === "refresh_duplicates") return await proxyRpc(supabaseUrl, headers, "refresh_duplicate_candidates", { p_force: true, p_trigger_source: "manual" });
      if (payload?.action === "enrich_photos") return json(await enrichPhotos(supabaseUrl, headers, Number(payload.batch_size) || 16));
      if (payload?.action === "save_search") {
        const search = payload.search ?? {};
        const body = {
          name: safeText(search.name, 120), locations: safeStringArray(search.locations), sources: safeStringArray(search.sources),
          max_price: search.max_price == null ? null : Number(search.max_price),
          max_price_per_m2: search.max_price_per_m2 == null ? null : Number(search.max_price_per_m2),
          min_bedrooms: search.min_bedrooms == null ? null : Number(search.min_bedrooms),
          parking_required: Boolean(search.parking_required), sea_view_required: Boolean(search.sea_view_required),
          photos_required: Boolean(search.photos_required),
          digest_frequency: search.digest_frequency === "weekly" ? "weekly" : "daily",
          created_by: safeText(payload.actor, 320), updated_at: new Date().toISOString(),
        };
        if (!body.name) return json({ error: "Search name is required" }, 400);
        const id = safeText(search.id, 80);
        const response = await fetch(id ? `${supabaseUrl}/rest/v1/saved_searches?id=eq.${encodeURIComponent(id)}` : `${supabaseUrl}/rest/v1/saved_searches`, {
          method: id ? "PATCH" : "POST", headers: { ...headers, prefer: "return=representation" }, body: JSON.stringify(body),
        });
        return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (payload?.action === "delete_search") {
        const id = safeText(payload.search_id, 80);
        if (!id) return json({ error: "Search id is required" }, 400);
        const response = await fetch(`${supabaseUrl}/rest/v1/saved_searches?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...headers, prefer: "return=minimal" }, body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }) });
        return response.ok ? json({ deleted: true }) : new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json" } });
      }
      if (payload?.action === "save_workflow") {
        const workflow = payload.workflow ?? {};
        return await proxyRpc(supabaseUrl, headers, "set_listing_workflow", {
          p_listing_id: payload.listing_id, p_purchase_price: workflow.purchase_price,
          p_transfer_tax_cost: workflow.transfer_tax_cost, p_legal_notary_cost: workflow.legal_notary_cost,
          p_agency_fee_cost: workflow.agency_fee_cost, p_renovation_budget: workflow.renovation_budget,
          p_furnishing_budget: workflow.furnishing_budget, p_other_costs: workflow.other_costs,
          p_expected_monthly_rent: workflow.expected_monthly_rent, p_annual_operating_costs: workflow.annual_operating_costs,
          p_contacted_at: workflow.contacted_at, p_contact_method: workflow.contact_method,
          p_contact_person: workflow.contact_person, p_response_summary: workflow.response_summary,
          p_viewing_at: workflow.viewing_at, p_follow_up_at: workflow.follow_up_at,
          p_questions_to_ask: workflow.questions_to_ask, p_offered_price: workflow.offered_price,
          p_negotiation_notes: workflow.negotiation_notes, p_next_action: workflow.next_action,
          p_updated_by: typeof payload.actor === "string" ? payload.actor.slice(0, 320) : null,
        });
      }
      return json({ error: "Unsupported action" }, 400);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Backend request failed" }, 500);
  }
});
