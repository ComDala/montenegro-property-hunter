"use client";

import { useMemo, useState } from "react";
import type { DashboardData, Listing, Status } from "./lib/types";

const ALL_STATUSES: Status[] = [
  "New", "Review", "Watch", "Hot Deal", "Contact Agent", "Contacted",
  "Viewing", "Negotiating", "Rejected", "Purchased", "Removed",
];

const priceBands = [
  { label: "Exceptional", range: "< €1,500", color: "#e16b4a", test: (v: number) => v < 1500 },
  { label: "Very attractive", range: "€1,500–1,800", color: "#14906f", test: (v: number) => v >= 1500 && v <= 1800 },
  { label: "Attractive", range: "€1,801–2,000", color: "#43a88d", test: (v: number) => v > 1800 && v <= 2000 },
  { label: "Interesting", range: "€2,001–2,150", color: "#d9a63c", test: (v: number) => v > 2000 && v <= 2150 },
  { label: "Worth reviewing", range: "€2,151–2,300", color: "#b9863d", test: (v: number) => v > 2150 && v <= 2300 },
  { label: "Outside target", range: "> €2,300", color: "#8d9791", test: (v: number) => v > 2300 },
];

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 });

function money(value: number | null) {
  return value == null ? "—" : euro.format(value);
}

function ppsqm(value: number | null) {
  return value == null ? "—" : `${number.format(value)} €/m²`;
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Podgorica",
  }).format(new Date(value));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toneFor(listing: Listing) {
  const value = listing.calculated_price_per_m2;
  if (value == null) return "neutral";
  if (value < 1500) return "danger";
  if (value <= 2000) return "good";
  if (value <= 2300) return "warm";
  return "neutral";
}

function contactParts(value?: string | null) {
  const parts = (value ?? "").split(/[;\n]/).map((part) => part.trim()).filter(Boolean);
  const emails = Array.from(new Set(parts.filter((part) => /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(part))));
  const seenPhones = new Set<string>();
  const phones = parts.filter((part) => {
    if (part.includes("/") || /https?:|www\./i.test(part)) return false;
    const digits = part.replace(/\D/g, "");
    if (digits.length < 7 || digits === "20052026") return false;
    const key = digits.slice(-8);
    if (seenPhones.has(key)) return false;
    seenPhones.add(key);
    return true;
  });
  return { phones, emails };
}

function phoneHref(value: string) {
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("382")) return `+${digits}`;
  if (digits.startsWith("0")) return `+382${digits.slice(1)}`;
  return `+382${digits}`;
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon">{children}</span>;
}

export default function Dashboard({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<"overview" | "listings" | "review">("overview");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("All locations");
  const [status, setStatus] = useState("All statuses");
  const [targetOnly, setTargetOnly] = useState(false);
  const [cleanOnly, setCleanOnly] = useState(false);
  const [sort, setSort] = useState("ppsqm-asc");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [statusDraft, setStatusDraft] = useState<Status>("New");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [copiedContact, setCopiedContact] = useState("");

  const listings = data.listings;
  const validPrices = listings
    .filter((l) => l.clean_baseline_eligible)
    .map((l) => l.calculated_price_per_m2)
    .filter((v): v is number => v != null);
  const trackedCount = data.latest_scan.listings_discovered ?? listings.length;
  const reviewCount = listings.filter((l) => l.current_status === "Review").length;
  const targetCount = listings.filter((l) => (l.calculated_price_per_m2 ?? Infinity) <= 2300).length;
  const suspiciousCount = listings.filter((l) => (l.calculated_price_per_m2 ?? Infinity) < 1500).length;

  const locations = useMemo(() => ["All locations", ...Array.from(new Set(listings.map((l) => l.normalized_location).filter(Boolean) as string[])).sort()], [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = listings.filter((l) => {
      const matchesQuery = !q || [l.title, l.source_listing_id, l.normalized_location, l.agency_name, l.public_contact].some((v) => v?.toLowerCase().includes(q));
      return matchesQuery
        && (location === "All locations" || l.normalized_location === location)
        && (status === "All statuses" || l.current_status === status)
        && (!targetOnly || (l.calculated_price_per_m2 ?? Infinity) <= 2300)
        && (!cleanOnly || l.clean_baseline_eligible);
    });
    return result.sort((a, b) => {
      if (sort === "ppsqm-asc") return (a.calculated_price_per_m2 ?? Infinity) - (b.calculated_price_per_m2 ?? Infinity);
      if (sort === "ppsqm-desc") return (b.calculated_price_per_m2 ?? -1) - (a.calculated_price_per_m2 ?? -1);
      if (sort === "price-asc") return (a.price_value ?? Infinity) - (b.price_value ?? Infinity);
      if (sort === "newest") return new Date(b.source_published_at ?? 0).getTime() - new Date(a.source_published_at ?? 0).getTime();
      return (b.total_score ?? 0) - (a.total_score ?? 0);
    });
  }, [listings, query, location, status, targetOnly, cleanOnly, sort]);

  const opportunities = useMemo(() => listings
    .filter((l) => l.clean_baseline_eligible && (l.calculated_price_per_m2 ?? Infinity) <= 2300)
    .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
    .slice(0, 3), [listings]);

  const neighborhoods = useMemo(() => {
    const groups = new Map<string, number[]>();
    listings.filter((l) => l.clean_baseline_eligible && l.calculated_price_per_m2 != null).forEach((l) => {
      const key = l.normalized_location ?? "Unknown";
      groups.set(key, [...(groups.get(key) ?? []), l.calculated_price_per_m2!]);
    });
    return [...groups].map(([name, values]) => ({ name, count: values.length, median: median(values), average: values.reduce((a, b) => a + b, 0) / values.length }))
      .sort((a, b) => a.median - b.median);
  }, [listings]);

  const openListing = (listing: Listing) => {
    setSelected(listing);
    setStatusDraft(listing.current_status);
    setNotice("");
  };

  const copyContact = async (value: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopiedContact(value);
      window.setTimeout(() => setCopiedContact((current) => current === value ? "" : current), 1600);
    } catch {
      setCopiedContact("");
    }
  };

  const saveStatus = async () => {
    if (!selected || statusDraft === selected.current_status) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing_id: selected.id, status: statusDraft, reason: `Moved to ${statusDraft}` }),
      });
      if (!response.ok) throw new Error();
      const changedAt = new Date().toISOString();
      const updated = { ...selected, current_status: statusDraft, status_changed_at: changedAt, status_history: [{ changed_at: changedAt, old_status: selected.current_status, new_status: statusDraft, reason: "Manual status change from interface" }, ...selected.status_history] };
      setData((current) => ({ ...current, listings: current.listings.map((l) => l.id === updated.id ? updated : l) }));
      setSelected(updated); setNotice("Status saved and added to history.");
    } catch {
      setNotice("Status could not be saved. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div><strong>Montenegro</strong><span>Property Hunter</span></div>
        </div>
        <nav>
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><Icon>⌁</Icon><span>Market overview</span></button>
          <button className={tab === "listings" ? "active" : ""} onClick={() => setTab("listings")}><Icon>⌂</Icon><span>Listings</span><em>{trackedCount}</em></button>
          <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><Icon>◎</Icon><span>Review queue</span><em>{reviewCount}</em></button>
        </nav>
        <div className="sidebar-note">
          <span className="pulse" />
          <div><strong>{data.dataMode === "live" ? "Supabase live" : "Preview mode"}</strong><small>Latest · {shortDate(data.latest_scan.started_at)}</small></div>
        </div>
        <div className="sidebar-footer"><span>Phase 1 alpha</span><small>Bar · Montenegro</small></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><p>ACQUISITION INTELLIGENCE</p><h1>{tab === "overview" ? "Good afternoon." : tab === "listings" ? "Explore the market." : "Resolve what needs attention."}</h1></div>
          <div className="scan-chip"><span>Last scan</span><strong>{shortDate(data.latest_scan.started_at)}</strong><i>{data.latest_scan.pages_successful ?? "—"} opened · {data.latest_scan.pages_failed ?? "—"} failed</i></div>
        </header>

        {data.dataMode === "preview" && <div className="preview-banner"><strong>Design preview</strong> — the deployed private site loads all {trackedCount} live Supabase records.</div>}

        {tab === "overview" && <>
          <section className="metric-grid">
            <article className="metric-card dark"><span>Tracked listings</span><strong>{trackedCount}</strong><small>100% scan success</small><div className="metric-orbit" /></article>
            <article className="metric-card"><span>Clean market median</span><strong>{ppsqm(median(validPrices))}</strong><small>Baseline benchmark</small></article>
            <article className="metric-card"><span>Within target</span><strong>{targetCount}</strong><small>At or below €2,300/m²</small></article>
            <article className="metric-card alert"><span>Verify immediately</span><strong>{suspiciousCount}</strong><small>Below €1,500/m²</small></article>
          </section>

          <section className="overview-grid">
            <article className="panel band-panel">
              <div className="panel-heading"><div><span>PRICE POSITION</span><h2>Where the market sits</h2></div><button onClick={() => { setTargetOnly(true); setTab("listings"); }}>View target listings →</button></div>
              <div className="band-list">
                {priceBands.map((band) => {
                  const count = listings.filter((l) => l.calculated_price_per_m2 != null && band.test(l.calculated_price_per_m2)).length;
                  const width = Math.max(3, (count / Math.max(1, listings.length)) * 100);
                  return <div className="band-row" key={band.label}><div><strong>{band.label}</strong><small>{band.range}</small></div><div className="band-track"><span style={{ width: `${width}%`, background: band.color }} /></div><b>{count}</b></div>;
                })}
              </div>
            </article>

            <article className="panel neighborhood-panel">
              <div className="panel-heading"><div><span>NEIGHBORHOODS</span><h2>Median €/m²</h2></div><small>Clean baseline</small></div>
              <div className="neighborhood-list">
                {neighborhoods.slice(0, 6).map((item, index) => <div key={item.name}><span className="rank">0{index + 1}</span><div><strong>{item.name}</strong><small>{item.count} listings</small></div><b>{ppsqm(item.median)}</b></div>)}
              </div>
            </article>
          </section>

          <section className="opportunity-section">
            <div className="section-heading"><div><span>PROVISIONAL V1</span><h2>Opportunity spotlight</h2></div><p>High-interest leads, still subject to verification.</p></div>
            <div className="opportunity-grid">
              {opportunities.map((listing, index) => <button className="opportunity-card" key={listing.id} onClick={() => openListing(listing)}>
                <div className="opportunity-top"><span>0{index + 1}</span><i className={`tone ${toneFor(listing)}`}>{listing.classification}</i></div>
                <h3>{listing.title}</h3><p>{listing.normalized_location} · {listing.bedrooms ?? "—"} bed · {listing.area_used_for_ppsqm_m2 ?? "—"} m²</p>
                <div className="opportunity-price"><strong>{money(listing.price_value)}</strong><b>{ppsqm(listing.calculated_price_per_m2)}</b></div>
                <div className="tag-row">{listing.parking && <span>Parking</span>}{listing.sea_view && <span>Sea view</span>}{listing.new_construction && <span>New build</span>}<span>Score {listing.total_score ?? "—"}</span></div>
              </button>)}
            </div>
          </section>
        </>}

        {tab === "listings" && <section className="listing-workspace">
          <div className="workspace-head"><div><span>LIVE INVENTORY</span><h2>{filtered.length} matching listings</h2></div><p>Click any row to inspect the full evidence record.</p></div>
          <div className="filters">
            <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, ID, agency…" /></label>
            <select value={location} onChange={(e) => setLocation(e.target.value)}>{locations.map((v) => <option key={v}>{v}</option>)}</select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option>{ALL_STATUSES.map((v) => <option key={v}>{v}</option>)}</select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="ppsqm-asc">Lowest €/m²</option><option value="ppsqm-desc">Highest €/m²</option><option value="score">Best score</option><option value="price-asc">Lowest price</option><option value="newest">Newest</option></select>
            <label className="toggle"><input type="checkbox" checked={targetOnly} onChange={(e) => setTargetOnly(e.target.checked)} /><span />≤ €2,300</label>
            <label className="toggle"><input type="checkbox" checked={cleanOnly} onChange={(e) => setCleanOnly(e.target.checked)} /><span />Clean only</label>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Property</th><th>Location</th><th>Price</th><th>Area</th><th>€/m²</th><th>Contact</th><th>Signal</th><th>Status</th></tr></thead><tbody>
            {filtered.map((listing) => {
              const contacts = contactParts(listing.public_contact);
              const primaryPhone = contacts.phones[0];
              const primaryEmail = contacts.emails[0];
              return <tr key={listing.id} onClick={() => openListing(listing)}><td><strong>{listing.title || "Untitled listing"}</strong><small>Realitica #{listing.source_listing_id}{listing.possible_duplicate ? " · possible duplicate" : ""}</small></td><td>{listing.normalized_location || "—"}</td><td>{money(listing.price_value)}</td><td>{listing.area_used_for_ppsqm_m2 ? `${listing.area_used_for_ppsqm_m2} m²` : "—"}</td><td><b className={`ppsqm ${toneFor(listing)}`}>{ppsqm(listing.calculated_price_per_m2)}</b></td><td><div className="contact-mini">{primaryPhone && <a href={`tel:${phoneHref(primaryPhone)}`} onClick={(e) => e.stopPropagation()} aria-label={`Call ${primaryPhone}`} title={`Call ${primaryPhone}`}>☎</a>}{primaryEmail && <a href={`mailto:${primaryEmail}`} onClick={(e) => e.stopPropagation()} aria-label={`Email ${primaryEmail}`} title={`Email ${primaryEmail}`}>✉</a>}{(primaryPhone || primaryEmail) && <button onClick={(e) => copyContact(primaryPhone || primaryEmail, e)} aria-label="Copy contact" title="Copy contact">{copiedContact === (primaryPhone || primaryEmail) ? "✓" : "⎘"}</button>}{!primaryPhone && !primaryEmail && <span>—</span>}</div></td><td><span className={`confidence ${listing.extraction_confidence}`}>{listing.extraction_confidence}</span></td><td><span className="status-pill">{listing.current_status}</span></td></tr>;
            })}
          </tbody></table>{!filtered.length && <div className="empty">No listings match these filters.</div>}</div>
        </section>}

        {tab === "review" && <section className="review-grid">
          <article className="panel review-list"><div className="panel-heading"><div><span>ATTENTION NEEDED</span><h2>{reviewCount} listings in review</h2></div></div>
            {listings.filter((l) => l.current_status === "Review").slice(0, 12).map((listing) => <button key={listing.id} onClick={() => openListing(listing)}><span className={`review-dot ${listing.extraction_confidence}`} /><div><strong>{listing.title}</strong><small>#{listing.source_listing_id} · {listing.normalized_location}</small></div><b>{ppsqm(listing.calculated_price_per_m2)}</b></button>)}
            {reviewCount > 12 && <button className="show-all" onClick={() => { setStatus("Review"); setTab("listings"); }}>Show all {reviewCount} review listings →</button>}
          </article>
          <article className="panel duplicates"><div className="panel-heading"><div><span>DUPLICATE CANDIDATES</span><h2>{data.duplicates.length} relationships</h2></div></div>
            {data.duplicates.slice(0, 8).map((d) => <div className="duplicate-row" key={d.id}><span>{Math.round((d.confidence_score ?? 0) * 100)}%</span><div><strong>#{d.source_listing_id_a} ↔ #{d.source_listing_id_b}</strong><small>{d.reason}</small></div><i>{d.review_status}</i></div>)}
          </article>
        </section>}
      </main>

      {selected && <div className="drawer-backdrop" onMouseDown={() => setSelected(null)}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span>REALITICA #{selected.source_listing_id}</span><h2>{selected.title}</h2></div><button aria-label="Close" onClick={() => setSelected(null)}>×</button></div>
        <div className="drawer-price"><div><strong>{money(selected.price_value)}</strong><small>{selected.price_basis === "per_m2" ? "Advertised per m²" : "Asking price"}</small></div><div><strong>{ppsqm(selected.calculated_price_per_m2)}</strong><small>{selected.area_used_for_ppsqm_m2 ?? "—"} m² usable basis</small></div></div>
        <div className="drawer-tags"><span>{selected.normalized_location}</span><span>{selected.bedrooms ?? "—"} bedrooms</span>{selected.parking && <span>Parking</span>}{selected.sea_view && <span>Sea view</span>}{selected.new_construction && <span>New construction</span>}</div>

        {selected.ambiguity_flags?.length > 0 && <div className="warning-box"><strong>Verification needed</strong>{selected.ambiguity_flags.map((flag) => <p key={flag}>• {flag}</p>)}</div>}

        <section className="drawer-section"><span>ACQUISITION STATUS</span><div className="status-editor"><select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as Status)}>{ALL_STATUSES.map((v) => <option key={v}>{v}</option>)}</select><button disabled={saving || statusDraft === selected.current_status || data.dataMode !== "live"} onClick={saveStatus}>{saving ? "Saving…" : "Save status"}</button></div>{notice && <p className="notice">{notice}</p>}</section>
        <section className="drawer-section"><span>PROPERTY EVIDENCE</span><dl><div><dt>Floor</dt><dd>{selected.floor ?? "—"}{selected.total_floors ? ` / ${selected.total_floors}` : ""}</dd></div><div><dt>Condition</dt><dd>{selected.building_condition ?? "—"}</dd></div><div><dt>Seller</dt><dd>{selected.seller_type}{selected.agency_name ? ` · ${selected.agency_name}` : ""}</dd></div><div><dt>Published</dt><dd>{shortDate(selected.source_published_at)}</dd></div><div><dt>Modified</dt><dd>{shortDate(selected.source_modified_at)}</dd></div><div><dt>Confidence</dt><dd>{selected.extraction_confidence}</dd></div></dl></section>
        <section className="drawer-section"><span>DESCRIPTION</span><p className="description">{selected.description_raw || "No description captured."}</p></section>
        <section className="drawer-section"><span>PRICE HISTORY</span>{selected.price_history?.length ? <div className="timeline">{selected.price_history.map((event, i) => <div key={`${event.observed_at}-${i}`}><i /><strong>{money(event.price_value)}</strong><small>{shortDate(event.observed_at)}{event.change_percent != null ? ` · ${event.change_percent.toFixed(1)}%` : " · baseline"}</small></div>)}</div> : <p className="muted">No trusted price event—the source value needs verification.</p>}</section>
        <section className="drawer-section"><span>PUBLIC CONTACT</span>{(() => {
          const contacts = contactParts(selected.public_contact);
          if (!contacts.phones.length && !contacts.emails.length) return <p className="muted">Not identified on the public listing.</p>;
          return <div className="contact-stack">
            {contacts.phones.map((phone) => <div className="contact-card" key={phone}><div><i>PHONE</i><strong>{phone}</strong></div><div className="contact-actions"><a href={`tel:${phoneHref(phone)}`}>Call</a><a href={`https://wa.me/${phoneHref(phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a><button onClick={() => copyContact(phone)}>{copiedContact === phone ? "Copied" : "Copy"}</button></div></div>)}
            {contacts.emails.map((email) => <div className="contact-card" key={email}><div><i>EMAIL</i><strong>{email}</strong></div><div className="contact-actions"><a href={`mailto:${email}`}>Email</a><button onClick={() => copyContact(email)}>{copiedContact === email ? "Copied" : "Copy"}</button></div></div>)}
            <small className="contact-source">Public source contact · verify before outreach</small>
          </div>;
        })()}</section>
        <a className="source-link" href={selected.canonical_url} target="_blank" rel="noreferrer">Open original Realitica listing ↗</a>
      </aside></div>}
    </div>
  );
}
