"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, DashboardData, DuplicateReviewStatus, Listing, ListingWorkflow, Status } from "./lib/types";

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

const SOURCE_LABELS: Record<string, string> = {
  realitica: "Realitica",
  indomio: "Indomio",
  freshestate: "Fresh Estate",
  montenegroprospects: "Montenegro Prospects",
  amfora: "Amfora Property",
  montebase: "MonteBase",
  cmm: "CMM Montenegro",
};

function sourceLabel(value?: string | null) {
  if (!value) return "Unknown source";
  return SOURCE_LABELS[value] ?? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const CHANGE_LABELS: Record<ChangeEvent["event_type"], string> = {
  new: "New listing",
  price_reduced: "Price reduced",
  price_increased: "Price increased",
  modified: "Listing updated",
  removed: "Removed",
};

function changeTone(type: ChangeEvent["event_type"]) {
  if (type === "price_reduced") return "good";
  if (type === "price_increased" || type === "removed") return "danger";
  if (type === "new") return "fresh";
  return "neutral";
}

function csvCell(value: unknown) {
  const text = value == null ? "" : Array.isArray(value) ? value.join(" | ") : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

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

function ListingImage({ src, alt, className, eager = false }: { src: string; alt: string; className: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`${className} remote-image-fallback`} aria-label="Image unavailable">⌂</span>;
  // Remote listing hosts vary by source, so a native lazy image is the safe cross-source loader here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

type WorkflowDraft = {
  purchase_price: string; transfer_tax_cost: string; legal_notary_cost: string;
  agency_fee_cost: string; renovation_budget: string; furnishing_budget: string;
  other_costs: string; expected_monthly_rent: string; annual_operating_costs: string;
  contacted_at: string; contact_method: string; contact_person: string;
  response_summary: string; viewing_at: string; follow_up_at: string;
  questions_to_ask: string; offered_price: string; negotiation_notes: string;
  next_action: string;
};

const blankWorkflow: WorkflowDraft = {
  purchase_price: "", transfer_tax_cost: "", legal_notary_cost: "",
  agency_fee_cost: "", renovation_budget: "", furnishing_budget: "",
  other_costs: "", expected_monthly_rent: "", annual_operating_costs: "",
  contacted_at: "", contact_method: "", contact_person: "", response_summary: "",
  viewing_at: "", follow_up_at: "", questions_to_ask: "", offered_price: "",
  negotiation_notes: "", next_action: "",
};

function fieldValue(value?: number | null) {
  return value == null ? "" : String(value);
}

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function workflowDraft(workflow: ListingWorkflow | null | undefined, askingPrice: number | null): WorkflowDraft {
  return {
    purchase_price: fieldValue(workflow?.purchase_price ?? askingPrice),
    transfer_tax_cost: fieldValue(workflow?.transfer_tax_cost),
    legal_notary_cost: fieldValue(workflow?.legal_notary_cost),
    agency_fee_cost: fieldValue(workflow?.agency_fee_cost),
    renovation_budget: fieldValue(workflow?.renovation_budget),
    furnishing_budget: fieldValue(workflow?.furnishing_budget),
    other_costs: fieldValue(workflow?.other_costs),
    expected_monthly_rent: fieldValue(workflow?.expected_monthly_rent),
    annual_operating_costs: fieldValue(workflow?.annual_operating_costs),
    contacted_at: localDateTime(workflow?.contacted_at),
    contact_method: workflow?.contact_method ?? "",
    contact_person: workflow?.contact_person ?? "",
    response_summary: workflow?.response_summary ?? "",
    viewing_at: localDateTime(workflow?.viewing_at),
    follow_up_at: localDateTime(workflow?.follow_up_at),
    questions_to_ask: workflow?.questions_to_ask ?? "",
    offered_price: fieldValue(workflow?.offered_price),
    negotiation_notes: workflow?.negotiation_notes ?? "",
    next_action: workflow?.next_action ?? "",
  };
}

function draftNumber(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default function Dashboard({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<"overview" | "sources" | "deals" | "changes" | "listings" | "review">("overview");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("All sources");
  const [location, setLocation] = useState("All locations");
  const [status, setStatus] = useState("All statuses");
  const [priceBand, setPriceBand] = useState("All price bands");
  const [targetOnly, setTargetOnly] = useState(false);
  const [cleanOnly, setCleanOnly] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [photosOnly, setPhotosOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState("ppsqm-asc");
  const [changeType, setChangeType] = useState("All changes");
  const [changeDays, setChangeDays] = useState(7);
  const [watchlistAlertsOnly, setWatchlistAlertsOnly] = useState(false);
  const [dealCompareIds, setDealCompareIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [duplicateReviewDraft, setDuplicateReviewDraft] = useState<DuplicateReviewStatus>("Needs Review");
  const [duplicateReviewNote, setDuplicateReviewNote] = useState("");
  const [savingDuplicateReview, setSavingDuplicateReview] = useState(false);
  const [duplicateReviewNotice, setDuplicateReviewNotice] = useState("");
  const [statusDraft, setStatusDraft] = useState<Status>("New");
  const [favoriteDraft, setFavoriteDraft] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowDraft>(blankWorkflow);
  const [saving, setSaving] = useState(false);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [workflowNotice, setWorkflowNotice] = useState("");
  const [notice, setNotice] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [copiedContact, setCopiedContact] = useState("");

  const listings = data.listings;
  const validPrices = listings
    .filter((l) => l.clean_baseline_eligible)
    .map((l) => l.calculated_price_per_m2)
    .filter((v): v is number => v != null);
  const trackedCount = listings.length;
  const reviewCount = listings.filter((l) => l.current_status === "Review").length;
  const favoriteCount = listings.filter((l) => l.is_favorite).length;
  const targetCount = listings.filter((l) => (l.calculated_price_per_m2 ?? Infinity) <= 2300).length;
  const suspiciousCount = listings.filter((l) => (l.calculated_price_per_m2 ?? Infinity) < 1500).length;

  const sources = useMemo(() => ["All sources", ...Array.from(new Set(listings.map((l) => l.source).filter(Boolean))).sort()], [listings]);
  const locations = useMemo(() => ["All locations", ...Array.from(new Set(listings.map((l) => l.normalized_location).filter(Boolean) as string[])).sort()], [listings]);
  const activeDuplicates = useMemo(() => data.duplicates.filter((d) => d.review_status !== "Not Duplicate"), [data.duplicates]);
  const listingById = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const dealListings = useMemo(() => listings.filter((listing) =>
    listing.is_favorite || ["Hot Deal", "Contact Agent", "Contacted", "Viewing", "Negotiating"].includes(listing.current_status)
  ).sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0)), [listings]);
  const comparedDeals = useMemo(() => dealCompareIds.map((id) => listingById.get(id)).filter((listing): listing is Listing => Boolean(listing)), [dealCompareIds, listingById]);
  const favoriteIds = useMemo(() => new Set(listings.filter((listing) => listing.is_favorite).map((listing) => listing.id)), [listings]);
  const sourceHealth = useMemo(() => sources.slice(1).map((sourceName) => {
    const inventory = listings.filter((listing) => listing.source === sourceName);
    const scans = (data.scan_history ?? []).filter((scan) => scan.source === sourceName)
      .sort((a, b) => new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime());
    const latestScan = scans[0];
    const latestTime = latestScan?.started_at ? new Date(latestScan.started_at).getTime() : 0;
    const ageDays = latestTime ? Math.max(0, (new Date(data.generated_at).getTime() - latestTime) / 86_400_000) : Infinity;
    const opened = latestScan?.pages_successful ?? 0;
    const failed = latestScan?.pages_failed ?? 0;
    return {
      source: sourceName,
      inventory: inventory.length,
      latestScan,
      ageDays,
      reliability: opened + failed ? opened / (opened + failed) * 100 : null,
      photos: inventory.filter((listing) => listing.photo_urls?.length).length,
      contacts: inventory.filter((listing) => contactParts(listing.public_contact).phones.length || contactParts(listing.public_contact).emails.length).length,
      clean: inventory.filter((listing) => listing.clean_baseline_eligible).length,
      targets: inventory.filter((listing) => (listing.calculated_price_per_m2 ?? Infinity) <= 2300).length,
    };
  }).sort((a, b) => a.ageDays - b.ageDays), [sources, listings, data.scan_history, data.generated_at]);

  const changesInWindow = useMemo(() => {
    const cutoff = new Date(data.generated_at).getTime() - changeDays * 86_400_000;
    return (data.changes ?? []).filter((event) => new Date(event.observed_at).getTime() >= cutoff);
  }, [data.changes, data.generated_at, changeDays]);
  const recentChanges = useMemo(() => changesInWindow.filter((event) =>
    (changeType === "All changes" || event.event_type === changeType)
    && (!watchlistAlertsOnly || favoriteIds.has(event.listing_id))
  ), [changesInWindow, changeType, watchlistAlertsOnly, favoriteIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = listings.filter((l) => {
      const matchesQuery = !q || [l.title, l.source_listing_id, l.normalized_location, l.agency_name, l.public_contact].some((v) => v?.toLowerCase().includes(q));
      const unitPrice = l.calculated_price_per_m2;
      const matchesBand = priceBand === "All price bands"
        || (priceBand === "≤ €2,000/m²" && unitPrice != null && unitPrice <= 2000)
        || (priceBand === "€2,001–2,300/m²" && unitPrice != null && unitPrice > 2000 && unitPrice <= 2300)
        || (priceBand === "> €2,300/m²" && unitPrice != null && unitPrice > 2300)
        || (priceBand === "Price/area unresolved" && unitPrice == null);
      return matchesQuery
        && (source === "All sources" || l.source === source)
        && (location === "All locations" || l.normalized_location === location)
        && (status === "All statuses" || l.current_status === status)
        && matchesBand
        && (!targetOnly || (l.calculated_price_per_m2 ?? Infinity) <= 2300)
        && (!cleanOnly || l.clean_baseline_eligible)
        && (!issuesOnly || l.ambiguity_flags?.length > 0 || l.possible_duplicate || l.extraction_confidence === "low")
        && (!photosOnly || Boolean(l.photo_urls?.length))
        && (!favoritesOnly || l.is_favorite);
    });
    return result.sort((a, b) => {
      if (sort === "ppsqm-asc") return (a.calculated_price_per_m2 ?? Infinity) - (b.calculated_price_per_m2 ?? Infinity);
      if (sort === "ppsqm-desc") return (b.calculated_price_per_m2 ?? -1) - (a.calculated_price_per_m2 ?? -1);
      if (sort === "price-asc") return (a.price_value ?? Infinity) - (b.price_value ?? Infinity);
      if (sort === "newest") return new Date(b.source_published_at ?? 0).getTime() - new Date(a.source_published_at ?? 0).getTime();
      return (b.total_score ?? 0) - (a.total_score ?? 0);
    });
  }, [listings, query, source, location, status, priceBand, targetOnly, cleanOnly, issuesOnly, photosOnly, favoritesOnly, sort]);

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

  const neighborhoodMedianByName = useMemo(() => new Map(neighborhoods.map((item) => [item.name, item.median])), [neighborhoods]);

  const competingOffers = (listing: Listing) => activeDuplicates.flatMap((candidate) => {
    if (candidate.listing_id_a === listing.id) {
      const other = listingById.get(candidate.listing_id_b);
      return other ? [{ candidate, listing: other }] : [];
    }
    if (candidate.listing_id_b === listing.id) {
      const other = listingById.get(candidate.listing_id_a);
      return other ? [{ candidate, listing: other }] : [];
    }
    return [];
  });

  const openListing = (listing: Listing) => {
    setSelected(listing);
    setSelectedPhotoIndex(0);
    setStatusDraft(listing.current_status);
    setFavoriteDraft(listing.is_favorite);
    setNotesDraft(listing.private_notes ?? "");
    setWorkflow(workflowDraft(listing.workflow, listing.price_value));
    setNotice("");
    setWorkflowNotice("");
  };

  const exportListingsCsv = (exportListings: Listing[], filename: string, message: string) => {
    const headers = [
      "Source", "Listing ID", "Title", "Location", "Price EUR", "Area m2", "EUR per m2",
      "Bedrooms", "Bathrooms", "Floor", "Parking", "Garage", "Sea view", "New construction",
      "Seller type", "Agency", "Status", "Classification", "Score", "Confidence",
      "Favorite", "Private notes", "Possible duplicate", "Ambiguity flags", "First seen", "Last seen", "Published", "Public contact", "Listing URL",
      "Model purchase price", "Transfer tax", "Legal and notary", "Agency fee", "Renovation", "Furnishing", "Other costs",
      "Expected monthly rent", "Annual operating costs", "Contacted at", "Contact method", "Contact person", "Response",
      "Viewing at", "Follow up at", "Questions", "Offered price", "Negotiation notes", "Next action", "Deal plan updated",
    ];
    const rows = exportListings.map((listing) => [
      sourceLabel(listing.source), listing.source_listing_id, listing.title, listing.normalized_location,
      listing.price_value, listing.area_used_for_ppsqm_m2, listing.calculated_price_per_m2,
      listing.bedrooms, listing.bathrooms, listing.floor, listing.parking ? "Yes" : "No",
      listing.garage ? "Yes" : "No", listing.sea_view ? "Yes" : "No", listing.new_construction ? "Yes" : "No",
      listing.seller_type, listing.agency_name, listing.current_status, listing.classification, listing.total_score,
      listing.extraction_confidence, listing.is_favorite ? "Yes" : "No", listing.private_notes,
      listing.possible_duplicate ? "Yes" : "No", listing.ambiguity_flags,
      listing.first_seen_at, listing.last_seen_at, listing.source_published_at, listing.public_contact, listing.canonical_url,
      listing.workflow?.purchase_price, listing.workflow?.transfer_tax_cost, listing.workflow?.legal_notary_cost,
      listing.workflow?.agency_fee_cost, listing.workflow?.renovation_budget, listing.workflow?.furnishing_budget,
      listing.workflow?.other_costs, listing.workflow?.expected_monthly_rent, listing.workflow?.annual_operating_costs,
      listing.workflow?.contacted_at, listing.workflow?.contact_method, listing.workflow?.contact_person,
      listing.workflow?.response_summary, listing.workflow?.viewing_at, listing.workflow?.follow_up_at,
      listing.workflow?.questions_to_ask, listing.workflow?.offered_price, listing.workflow?.negotiation_notes,
      listing.workflow?.next_action, listing.workflow?.updated_at,
    ]);
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportNotice(message);
    window.setTimeout(() => setExportNotice(""), 3000);
  };

  const exportFilteredCsv = () => exportListingsCsv(
    filtered,
    "montenegro-property-listings",
    `${filtered.length} filtered listings exported to CSV.`,
  );

  const exportDealsCsv = () => {
    const rows = comparedDeals.length ? comparedDeals : dealListings;
    exportListingsCsv(
      rows,
      "montenegro-property-deals",
      `${rows.length} ${comparedDeals.length ? "selected" : "shortlisted"} deals exported to CSV.`,
    );
  };

  const toggleDealComparison = (listingId: string) => {
    setDealCompareIds((current) => {
      if (current.includes(listingId)) return current.filter((id) => id !== listingId);
      if (current.length >= 4) {
        setExportNotice("You can compare up to four deals at once.");
        window.setTimeout(() => setExportNotice(""), 3000);
        return current;
      }
      return [...current, listingId];
    });
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

  const saveAnnotation = async () => {
    if (!selected) return;
    setSavingAnnotation(true); setNotice("");
    try {
      const response = await fetch("/api/annotation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing_id: selected.id, is_favorite: favoriteDraft, private_notes: notesDraft }),
      });
      if (!response.ok) throw new Error();
      const updated = {
        ...selected,
        is_favorite: favoriteDraft,
        private_notes: notesDraft.trim() || null,
        annotation_updated_at: new Date().toISOString(),
      };
      setData((current) => ({ ...current, listings: current.listings.map((l) => l.id === updated.id ? updated : l) }));
      setSelected(updated);
      setNotice("Favorite and private notes saved.");
    } catch {
      setNotice("Favorite or notes could not be saved. Please try again.");
    } finally {
      setSavingAnnotation(false);
    }
  };

  const setWorkflowField = (field: keyof WorkflowDraft, value: string) => {
    setWorkflow((current) => ({ ...current, [field]: value }));
    setWorkflowNotice("");
  };

  const saveWorkflow = async (successMessage: string) => {
    if (!selected) return;
    setSavingWorkflow(true);
    setWorkflowNotice("");
    const numericFields: (keyof WorkflowDraft)[] = [
      "purchase_price", "transfer_tax_cost", "legal_notary_cost", "agency_fee_cost",
      "renovation_budget", "furnishing_budget", "other_costs", "expected_monthly_rent",
      "annual_operating_costs", "offered_price",
    ];
    const payload: Record<string, string | number | null> = { ...workflow };
    numericFields.forEach((field) => {
      payload[field] = workflow[field].trim() ? Number(workflow[field]) : null;
    });
    (["contacted_at", "viewing_at", "follow_up_at"] as (keyof WorkflowDraft)[]).forEach((field) => {
      payload[field] = workflow[field] ? new Date(workflow[field]).toISOString() : null;
    });

    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing_id: selected.id, workflow: payload }),
      });
      if (!response.ok) throw new Error();
      const saved = await response.json() as ListingWorkflow;
      const updated = { ...selected, workflow: saved };
      setData((current) => ({ ...current, listings: current.listings.map((listing) => listing.id === updated.id ? updated : listing) }));
      setSelected(updated);
      setWorkflow(workflowDraft(saved, selected.price_value));
      setWorkflowNotice(successMessage);
    } catch {
      setWorkflowNotice("The deal plan could not be saved. Please check the values and try again.");
    } finally {
      setSavingWorkflow(false);
    }
  };

  const openDuplicateComparison = (candidateId: string) => {
    const candidate = data.duplicates.find((item) => item.id === candidateId);
    if (!candidate) return;
    setComparisonId(candidateId);
    setDuplicateReviewDraft(candidate.review_status);
    setDuplicateReviewNote(candidate.review_note ?? "");
    setDuplicateReviewNotice("");
  };

  const saveDuplicateReview = async () => {
    if (!selectedComparison) return;
    setSavingDuplicateReview(true);
    setDuplicateReviewNotice("");
    try {
      const response = await fetch("/api/duplicate-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate_id: selectedComparison.id,
          review_status: duplicateReviewDraft,
          review_note: duplicateReviewNote,
        }),
      });
      if (!response.ok) throw new Error();
      const reviewedAt = new Date().toISOString();
      setData((current) => ({
        ...current,
        duplicates: current.duplicates.map((candidate) => candidate.id === selectedComparison.id ? {
          ...candidate,
          review_status: duplicateReviewDraft,
          review_note: duplicateReviewNote.trim() || null,
          reviewed_at: reviewedAt,
        } : candidate),
      }));
      setDuplicateReviewNotice("Decision saved. The evidence remains preserved.");
      if (duplicateReviewDraft === "Not Duplicate") {
        window.setTimeout(() => setComparisonId(null), 700);
      }
    } catch {
      setDuplicateReviewNotice("Decision could not be saved. Please try again.");
    } finally {
      setSavingDuplicateReview(false);
    }
  };

  const selectedComparison = comparisonId ? activeDuplicates.find((candidate) => candidate.id === comparisonId) : null;
  const comparisonA = selectedComparison ? listingById.get(selectedComparison.listing_id_a) : null;
  const comparisonB = selectedComparison ? listingById.get(selectedComparison.listing_id_b) : null;
  const modelPurchasePrice = draftNumber(workflow.purchase_price);
  const modelUpfrontCosts = [
    workflow.transfer_tax_cost, workflow.legal_notary_cost, workflow.agency_fee_cost,
    workflow.renovation_budget, workflow.furnishing_budget, workflow.other_costs,
  ].reduce((sum, value) => sum + draftNumber(value), 0);
  const modelTotalAcquisition = modelPurchasePrice + modelUpfrontCosts;
  const modelAnnualRent = draftNumber(workflow.expected_monthly_rent) * 12;
  const modelNetAnnualIncome = modelAnnualRent - draftNumber(workflow.annual_operating_costs);
  const modelGrossYield = modelTotalAcquisition > 0 ? modelAnnualRent / modelTotalAcquisition * 100 : null;
  const modelNetYield = modelTotalAcquisition > 0 ? modelNetAnnualIncome / modelTotalAcquisition * 100 : null;
  const modelAllInPpsqm = modelTotalAcquisition > 0 && selected?.area_used_for_ppsqm_m2
    ? modelTotalAcquisition / selected.area_used_for_ppsqm_m2 : null;
  const modelDiscount = selected?.price_value && modelPurchasePrice > 0
    ? (modelPurchasePrice - selected.price_value) / selected.price_value * 100 : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div><strong>Montenegro</strong><span>Property Hunter</span></div>
        </div>
        <nav>
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><Icon>⌁</Icon><span>Market overview</span></button>
          <button className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}><Icon>◫</Icon><span>Source health</span><em>{sourceHealth.length}</em></button>
          <button className={tab === "deals" ? "active" : ""} onClick={() => setTab("deals")}><Icon>★</Icon><span>Deals workspace</span><em>{dealListings.length}</em></button>
          <button className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}><Icon>↕</Icon><span>Alerts & changes</span><em>{changesInWindow.length}</em></button>
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
          <div><p>ACQUISITION INTELLIGENCE</p><h1>{tab === "overview" ? "Good afternoon." : tab === "sources" ? "Know what you can trust." : tab === "deals" ? "Make the shortlist count." : tab === "changes" ? "See what moved." : tab === "listings" ? "Explore the market." : "Resolve what needs attention."}</h1></div>
          <div className="scan-chip"><span>Latest source scan</span><strong>{shortDate(data.latest_scan.started_at)}</strong><i>{sourceLabel(data.latest_scan.source)} · {data.latest_scan.pages_successful ?? "—"} opened · {data.latest_scan.pages_failed ?? "—"} failed</i></div>
        </header>

        {data.dataMode === "preview" && <div className="preview-banner"><strong>Design preview</strong> — the deployed private site loads all {trackedCount} live Supabase records.</div>}

        {tab === "overview" && <>
          <section className="metric-grid">
            <article className="metric-card dark"><span>Tracked listings</span><strong>{trackedCount}</strong><small>{sources.length - 1} approved sources</small><div className="metric-orbit" /></article>
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
                <h3>{listing.title}</h3><p>{sourceLabel(listing.source)} · {listing.normalized_location} · {listing.bedrooms ?? "—"} bed · {listing.area_used_for_ppsqm_m2 ?? "—"} m²</p>
                <div className="opportunity-price"><strong>{money(listing.price_value)}</strong><b>{ppsqm(listing.calculated_price_per_m2)}</b></div>
                <div className="tag-row">{listing.parking && <span>Parking</span>}{listing.sea_view && <span>Sea view</span>}{listing.new_construction && <span>New build</span>}<span>Score {listing.total_score ?? "—"}</span></div>
              </button>)}
            </div>
          </section>
        </>}

        {tab === "sources" && <section className="source-workspace">
          <div className="workspace-head"><div><span>FEED COVERAGE & RELIABILITY</span><h2>{sourceHealth.length} approved market sources</h2><p>Freshness and data coverage are measured separately, so an older agency baseline never looks like a daily feed.</p></div><button className="source-view-all" onClick={() => { setSource("All sources"); setTab("listings"); }}>Explore all inventory →</button></div>
          <div className="source-health-grid">
            {sourceHealth.map((item) => {
              const freshness = item.ageDays <= 1.5 ? "Current" : item.ageDays <= 4 ? "Recent" : "Baseline";
              const photoRate = item.inventory ? item.photos / item.inventory * 100 : 0;
              const contactRate = item.inventory ? item.contacts / item.inventory * 100 : 0;
              const cleanRate = item.inventory ? item.clean / item.inventory * 100 : 0;
              return <article className="source-health-card" key={item.source}>
                <div className="source-health-head"><span className={`source-pill source-${item.source}`}>{sourceLabel(item.source)}</span><i className={`freshness ${freshness.toLowerCase()}`}>{freshness}</i></div>
                <div className="source-health-total"><strong>{item.inventory}</strong><span>tracked listings</span></div>
                <dl><div><dt>Latest scan</dt><dd>{shortDate(item.latestScan?.started_at)}</dd></div><div><dt>Page reliability</dt><dd>{item.reliability == null ? "—" : `${item.reliability.toFixed(1)}%`}</dd></div><div><dt>Target deals</dt><dd>{item.targets}</dd></div><div><dt>Scans stored</dt><dd>{(data.scan_history ?? []).filter((scan) => scan.source === item.source).length}</dd></div></dl>
                <div className="coverage-list"><div><span>Clean pricing</span><b>{item.clean}/{item.inventory}</b><i><em style={{ width: `${cleanRate}%` }} /></i></div><div><span>Public contact</span><b>{item.contacts}/{item.inventory}</b><i><em style={{ width: `${contactRate}%` }} /></i></div><div><span>Photo gallery</span><b>{item.photos}/{item.inventory}</b><i><em style={{ width: `${photoRate}%` }} /></i></div></div>
                <button onClick={() => { setSource(item.source); setTab("listings"); }}>View {sourceLabel(item.source)} listings →</button>
              </article>;
            })}
          </div>
          <div className="source-legend"><div><span className="freshness current">Current</span><p>Scanned within roughly 36 hours</p></div><div><span className="freshness recent">Recent</span><p>Useful recent snapshot, not daily</p></div><div><span className="freshness baseline">Baseline</span><p>Preserved inventory awaiting its next refresh</p></div></div>
        </section>}

        {tab === "deals" && <section className="deals-workspace">
          <div className="workspace-head deals-head"><div><span>DECISION WORKSPACE</span><h2>{dealListings.length} shortlisted deals</h2><p>Favorites and active acquisition-stage listings, kept separate from the full market inventory.</p></div><div className="workspace-actions"><p>{comparedDeals.length ? `${comparedDeals.length} selected for comparison` : "Select up to four properties"}</p><button disabled={!dealListings.length} onClick={exportDealsCsv}>⇩ Export {comparedDeals.length || dealListings.length} deals</button></div></div>
          {exportNotice && <div className="export-notice">{exportNotice}</div>}
          {!dealListings.length && <div className="deals-empty"><strong>Your decision workspace is ready.</strong><p>Favorite a listing or move it to Hot Deal, Contact Agent, Contacted, Viewing, or Negotiating to bring it here.</p><button onClick={() => setTab("listings")}>Explore listings →</button></div>}
          {dealListings.length > 0 && <div className="deal-card-grid">
            {dealListings.map((listing) => {
              const neighborhoodMedian = neighborhoodMedianByName.get(listing.normalized_location ?? "");
              const delta = neighborhoodMedian && listing.calculated_price_per_m2
                ? ((listing.calculated_price_per_m2 - neighborhoodMedian) / neighborhoodMedian) * 100
                : null;
              const offers = competingOffers(listing);
              const cheaperOffer = offers.map((offer) => offer.listing).filter((offer) => offer.price_value != null && listing.price_value != null && offer.price_value < listing.price_value).sort((a, b) => (a.price_value ?? 0) - (b.price_value ?? 0))[0];
              const isCompared = dealCompareIds.includes(listing.id);
              return <article className={isCompared ? "deal-card selected" : "deal-card"} key={listing.id}>
                {listing.photo_urls?.[0] && <button className="deal-photo" onClick={() => openListing(listing)} aria-label={`Open ${listing.title || "property"}`}><ListingImage className="deal-photo-image" src={listing.photo_urls[0]} alt={`${listing.title || "Property"} preview`} /><span>{listing.photo_urls.length} photo{listing.photo_urls.length === 1 ? "" : "s"}</span></button>}
                <div className="deal-card-top"><label><input type="checkbox" checked={isCompared} onChange={() => toggleDealComparison(listing.id)} /> Compare</label><span className={`source-pill source-${listing.source}`}>{sourceLabel(listing.source)}</span></div>
                <button className="deal-title" onClick={() => openListing(listing)}><strong>{listing.title || `Listing #${listing.source_listing_id}`}</strong><small>#{listing.source_listing_id} · {listing.normalized_location || "Unresolved location"}</small></button>
                <div className="deal-values"><div><small>ASKING</small><strong>{money(listing.price_value)}</strong></div><div><small>VALUE</small><strong>{ppsqm(listing.calculated_price_per_m2)}</strong></div><div><small>VS. AREA MEDIAN</small><strong className={delta != null && delta < 0 ? "positive" : ""}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}</strong></div></div>
                <div className="deal-signals"><span>{listing.area_used_for_ppsqm_m2 ? `${listing.area_used_for_ppsqm_m2} m²` : "Area unresolved"}</span><span>{listing.bedrooms ?? "—"} bed</span>{listing.parking && <span>Parking</span>}{listing.sea_view && <span>Sea view</span>}</div>
                <div className="deal-meta"><span className="status-pill">{listing.current_status}</span><span>Score {listing.total_score ?? "—"}</span><span>{listing.price_history.length > 1 ? `${listing.price_history.length} price events` : "Price baseline"}</span>{listing.workflow && <span className="plan-saved">Deal plan saved</span>}</div>
                {cheaperOffer && <button className="competing-alert" onClick={() => openListing(cheaperOffer)}><strong>Cheaper competing offer</strong><span>{sourceLabel(cheaperOffer.source)} · {money(cheaperOffer.price_value)} →</span></button>}
                {!cheaperOffer && offers.length > 0 && <div className="competing-note">{offers.length} linked competing offer{offers.length === 1 ? "" : "s"}</div>}
                <button className="inspect-deal" onClick={() => openListing(listing)}>Inspect deal →</button>
              </article>;
            })}
          </div>}

          {comparedDeals.length >= 2 && <section className="deal-comparison">
            <div className="panel-heading"><div><span>SIDE-BY-SIDE</span><h2>Compare selected deals</h2></div><button onClick={() => setDealCompareIds([])}>Clear selection</button></div>
            <div className="comparison-scroll"><table><thead><tr><th>Measure</th>{comparedDeals.map((listing) => <th key={listing.id}>{sourceLabel(listing.source)} #{listing.source_listing_id}</th>)}</tr></thead><tbody>
              <tr><td>Property</td>{comparedDeals.map((listing) => <td key={listing.id}><button className="comparison-link" onClick={() => openListing(listing)}>{listing.title}</button></td>)}</tr>
              <tr><td>Location</td>{comparedDeals.map((listing) => <td key={listing.id}>{listing.normalized_location || "—"}</td>)}</tr>
              <tr><td>Asking price</td>{comparedDeals.map((listing) => <td key={listing.id}><strong>{money(listing.price_value)}</strong></td>)}</tr>
              <tr><td>Usable area</td>{comparedDeals.map((listing) => <td key={listing.id}>{listing.area_used_for_ppsqm_m2 ? `${listing.area_used_for_ppsqm_m2} m²` : "—"}</td>)}</tr>
              <tr><td>€/m²</td>{comparedDeals.map((listing) => <td key={listing.id}><strong className={`ppsqm ${toneFor(listing)}`}>{ppsqm(listing.calculated_price_per_m2)}</strong></td>)}</tr>
              <tr><td>Features</td>{comparedDeals.map((listing) => <td key={listing.id}>{[listing.parking && "Parking", listing.garage && "Garage", listing.sea_view && "Sea view", listing.new_construction && "New build"].filter(Boolean).join(" · ") || "—"}</td>)}</tr>
              <tr><td>Agency / seller</td>{comparedDeals.map((listing) => <td key={listing.id}>{listing.agency_name ?? listing.seller_type}</td>)}</tr>
              <tr><td>Status</td>{comparedDeals.map((listing) => <td key={listing.id}>{listing.current_status}</td>)}</tr>
              <tr><td>Planned purchase</td>{comparedDeals.map((listing) => <td key={listing.id}>{money(listing.workflow?.purchase_price ?? null)}</td>)}</tr>
              <tr><td>Expected rent</td>{comparedDeals.map((listing) => <td key={listing.id}>{listing.workflow?.expected_monthly_rent ? `${money(listing.workflow.expected_monthly_rent)} / month` : "—"}</td>)}</tr>
              <tr><td>Next action</td>{comparedDeals.map((listing) => <td key={listing.id}>{listing.workflow?.next_action || "—"}</td>)}</tr>
              <tr><td>Private note</td>{comparedDeals.map((listing) => <td key={listing.id}>{listing.private_notes || "—"}</td>)}</tr>
            </tbody></table></div>
          </section>}
        </section>}

        {tab === "changes" && <section className="change-workspace">
          <div className="workspace-head"><div><span>ALERT CENTER · HISTORICAL TRACKING</span><h2>{recentChanges.length} recorded events</h2></div><p>Price reductions, removals and important changes—built from append-only history.</p></div>
          <div className="change-summary">
            {(["new", "price_reduced", "price_increased", "modified", "removed"] as ChangeEvent["event_type"][]).map((type) => <button key={type} className={changeType === type ? "active" : ""} onClick={() => setChangeType(changeType === type ? "All changes" : type)}><span className={`change-icon ${changeTone(type)}`}>{type === "new" ? "+" : type === "price_reduced" ? "↓" : type === "price_increased" ? "↑" : type === "removed" ? "×" : "~"}</span><strong>{changesInWindow.filter((event) => event.event_type === type).length}</strong><small>{CHANGE_LABELS[type]}</small></button>)}
          </div>
          <div className="change-controls">
            <select value={changeDays} onChange={(event) => setChangeDays(Number(event.target.value))}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
            <select value={changeType} onChange={(event) => setChangeType(event.target.value)}><option>All changes</option><option value="new">New listings</option><option value="price_reduced">Price reductions</option><option value="price_increased">Price increases</option><option value="modified">Other updates</option><option value="removed">Removed</option></select>
            <label className="toggle alert-toggle"><input type="checkbox" checked={watchlistAlertsOnly} onChange={(event) => setWatchlistAlertsOnly(event.target.checked)} /><span />Watchlist only</label>
          </div>
          <div className="change-list">
            {recentChanges.map((event, index) => {
              const listing = listingById.get(event.listing_id);
              return <button key={`${event.listing_id}-${event.observed_at}-${index}`} disabled={!listing} onClick={() => listing && openListing(listing)}>
                <span className={`change-icon ${changeTone(event.event_type)}`}>{event.event_type === "new" ? "+" : event.event_type === "price_reduced" ? "↓" : event.event_type === "price_increased" ? "↑" : event.event_type === "removed" ? "×" : "~"}</span>
                <div><strong>{event.title || `Listing #${event.source_listing_id}`}</strong><small>{sourceLabel(event.source)} #{event.source_listing_id} · {event.normalized_location || "Unresolved location"} · {shortDate(event.observed_at)}</small><i>{CHANGE_LABELS[event.event_type]}{event.changed_fields?.length ? ` · ${event.changed_fields.join(", ")}` : ""}</i></div>
                <div className="change-price">{event.event_type === "price_reduced" || event.event_type === "price_increased" ? <><small>{money(event.previous_price)} →</small><strong>{money(event.current_price)}</strong><em className={changeTone(event.event_type)}>{event.change_percent == null ? "" : `${event.change_percent > 0 ? "+" : ""}${event.change_percent.toFixed(1)}%`}</em></> : <strong>{money(event.current_price ?? event.previous_price)}</strong>}</div>
              </button>;
            })}
            {!recentChanges.length && <div className="empty">No recorded changes match this period and filter.</div>}
          </div>
        </section>}

        {tab === "listings" && <section className="listing-workspace">
          <div className="workspace-head"><div><span>LIVE INVENTORY</span><h2>{filtered.length} matching listings</h2></div><div className="workspace-actions"><p>Export respects every active filter.</p><button onClick={exportFilteredCsv}>⇩ Export {filtered.length} CSV</button></div></div>
          <div className="filters">
            <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, ID, agency…" /></label>
            <select value={source} onChange={(e) => setSource(e.target.value)}>{sources.map((v) => <option key={v} value={v}>{v === "All sources" ? v : sourceLabel(v)}</option>)}</select>
            <select value={location} onChange={(e) => setLocation(e.target.value)}>{locations.map((v) => <option key={v}>{v}</option>)}</select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option>{ALL_STATUSES.map((v) => <option key={v}>{v}</option>)}</select>
            <select value={priceBand} onChange={(e) => setPriceBand(e.target.value)}><option>All price bands</option><option>≤ €2,000/m²</option><option>€2,001–2,300/m²</option><option>&gt; €2,300/m²</option><option>Price/area unresolved</option></select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="ppsqm-asc">Lowest €/m²</option><option value="ppsqm-desc">Highest €/m²</option><option value="score">Best score</option><option value="price-asc">Lowest price</option><option value="newest">Newest</option></select>
            <label className="toggle"><input type="checkbox" checked={targetOnly} onChange={(e) => setTargetOnly(e.target.checked)} /><span />≤ €2,300</label>
            <label className="toggle"><input type="checkbox" checked={cleanOnly} onChange={(e) => setCleanOnly(e.target.checked)} /><span />Clean only</label>
            <label className="toggle"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /><span />Issues only</label>
            <label className="toggle"><input type="checkbox" checked={photosOnly} onChange={(e) => setPhotosOnly(e.target.checked)} /><span />Photos only</label>
            <label className="toggle"><input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /><span />Favorites ({favoriteCount})</label>
          </div>
          {exportNotice && <div className="export-notice">{exportNotice}</div>}
          <div className="table-wrap"><table><thead><tr><th>Property</th><th>Source</th><th>Location</th><th>Price</th><th>Area</th><th>€/m²</th><th>Contact</th><th>Signal</th><th>Status</th></tr></thead><tbody>
            {filtered.map((listing) => {
              const contacts = contactParts(listing.public_contact);
              const primaryPhone = contacts.phones[0];
              const primaryEmail = contacts.emails[0];
              return <tr key={listing.id} onClick={() => openListing(listing)}><td><div className="property-cell">{listing.photo_urls?.[0] ? <ListingImage className="listing-thumb" src={listing.photo_urls[0]} alt={`${listing.title || "Property"} thumbnail`} /> : <span className="listing-thumb listing-thumb-placeholder" aria-hidden="true">⌂</span>}<div><strong>{listing.is_favorite && <span className="favorite-marker">★</span>}{listing.title || "Untitled listing"}</strong><small>#{listing.source_listing_id}{listing.photo_urls?.length ? ` · ${listing.photo_urls.length} photo${listing.photo_urls.length === 1 ? "" : "s"}` : ""}{listing.possible_duplicate ? " · possible duplicate" : ""}{listing.ambiguity_flags?.length ? ` · ${listing.ambiguity_flags.length} issue${listing.ambiguity_flags.length === 1 ? "" : "s"}` : ""}{listing.private_notes ? " · private note" : ""}</small></div></div></td><td><span className={`source-pill source-${listing.source}`}>{sourceLabel(listing.source)}</span></td><td>{listing.normalized_location || "—"}</td><td>{money(listing.price_value)}</td><td>{listing.area_used_for_ppsqm_m2 ? `${listing.area_used_for_ppsqm_m2} m²` : "—"}</td><td><b className={`ppsqm ${toneFor(listing)}`}>{ppsqm(listing.calculated_price_per_m2)}</b></td><td><div className="contact-mini">{primaryPhone && <a href={`tel:${phoneHref(primaryPhone)}`} onClick={(e) => e.stopPropagation()} aria-label={`Call ${primaryPhone}`} title={`Call ${primaryPhone}`}>☎</a>}{primaryEmail && <a href={`mailto:${primaryEmail}`} onClick={(e) => e.stopPropagation()} aria-label={`Email ${primaryEmail}`} title={`Email ${primaryEmail}`}>✉</a>}{(primaryPhone || primaryEmail) && <button onClick={(e) => copyContact(primaryPhone || primaryEmail, e)} aria-label="Copy contact" title="Copy contact">{copiedContact === (primaryPhone || primaryEmail) ? "✓" : "⎘"}</button>}{!primaryPhone && !primaryEmail && <span>—</span>}</div></td><td><span className={`confidence ${listing.extraction_confidence}`}>{listing.extraction_confidence}</span></td><td><span className="status-pill">{listing.current_status}</span></td></tr>;
            })}
          </tbody></table>{!filtered.length && <div className="empty">No listings match these filters.</div>}</div>
        </section>}

        {tab === "review" && <section className="review-grid">
          <article className="panel review-list"><div className="panel-heading"><div><span>ATTENTION NEEDED</span><h2>{reviewCount} listings in review</h2></div></div>
            {listings.filter((l) => l.current_status === "Review").slice(0, 12).map((listing) => <button key={listing.id} onClick={() => openListing(listing)}><span className={`review-dot ${listing.extraction_confidence}`} /><div><strong>{listing.title}</strong><small>{sourceLabel(listing.source)} #{listing.source_listing_id} · {listing.normalized_location}</small></div><b>{ppsqm(listing.calculated_price_per_m2)}</b></button>)}
            {reviewCount > 12 && <button className="show-all" onClick={() => { setStatus("Review"); setTab("listings"); }}>Show all {reviewCount} review listings →</button>}
          </article>
          <article className="panel duplicates"><div className="panel-heading"><div><span>DUPLICATE CANDIDATES</span><h2>{activeDuplicates.length} active relationships</h2></div></div>
            {activeDuplicates.slice(0, 8).map((d) => <button className="duplicate-row" key={d.id} onClick={() => openDuplicateComparison(d.id)}><span>{Math.round((d.confidence_score ?? 0) * 100)}%</span><div><strong>{sourceLabel(d.source_a)} #{d.source_listing_id_a} ↔ {sourceLabel(d.source_b)} #{d.source_listing_id_b}</strong><small>{d.reason}</small></div><i>{d.review_status === "Pending" ? "Review" : d.review_status} →</i></button>)}
          </article>
        </section>}
      </main>

      {selected && <div className="drawer-backdrop" onMouseDown={() => setSelected(null)}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span>{sourceLabel(selected.source).toUpperCase()} #{selected.source_listing_id}</span><h2>{selected.title}</h2></div><div className="drawer-head-actions"><button className={favoriteDraft ? "favorite active" : "favorite"} aria-label={favoriteDraft ? "Remove from favorites" : "Add to favorites"} title={favoriteDraft ? "Remove from favorites" : "Add to favorites"} onClick={() => setFavoriteDraft((value) => !value)}>★</button><button aria-label="Close" onClick={() => setSelected(null)}>×</button></div></div>
        {selected.photo_urls?.length ? <div className="property-gallery">
          <div className="gallery-stage">
            <ListingImage className="gallery-main" src={selected.photo_urls[Math.min(selectedPhotoIndex, selected.photo_urls.length - 1)]} alt={`${selected.title || "Property"} photo ${selectedPhotoIndex + 1}`} eager />
            <span className="gallery-count">{selectedPhotoIndex + 1} / {selected.photo_urls.length}</span>
            {selected.photo_urls.length > 1 && <><button className="gallery-nav previous" aria-label="Previous photo" onClick={() => setSelectedPhotoIndex((index) => (index - 1 + selected.photo_urls!.length) % selected.photo_urls!.length)}>‹</button><button className="gallery-nav next" aria-label="Next photo" onClick={() => setSelectedPhotoIndex((index) => (index + 1) % selected.photo_urls!.length)}>›</button></>}
          </div>
          {selected.photo_urls.length > 1 && <div className="gallery-thumbs" aria-label="Property photos">{selected.photo_urls.map((url, index) => <button key={`${url}-${index}`} className={index === selectedPhotoIndex ? "active" : ""} aria-label={`Show photo ${index + 1}`} onClick={() => setSelectedPhotoIndex(index)}><ListingImage className="gallery-thumb" src={url} alt="" /></button>)}</div>}
          <small className="gallery-caption">Photos load from the original public listing and are not copied into the database.</small>
        </div> : <div className="gallery-empty"><span>⌂</span><div><strong>No captured photos yet</strong><small>Open the original listing to view its current images.</small></div></div>}
        <div className="drawer-price"><div><strong>{money(selected.price_value)}</strong><small>{selected.price_basis === "per_m2" ? "Advertised per m²" : "Asking price"}</small></div><div><strong>{ppsqm(selected.calculated_price_per_m2)}</strong><small>{selected.area_used_for_ppsqm_m2 ?? "—"} m² usable basis</small></div></div>
        <div className="drawer-tags"><span>{selected.normalized_location}</span><span>{selected.bedrooms ?? "—"} bedrooms</span>{selected.parking && <span>Parking</span>}{selected.sea_view && <span>Sea view</span>}{selected.new_construction && <span>New construction</span>}</div>

        {selected.ambiguity_flags?.length > 0 && <div className="warning-box"><strong>Verification needed</strong>{selected.ambiguity_flags.map((flag) => <p key={flag}>• {flag}</p>)}</div>}

        <section className="drawer-section"><span>MY SHORTLIST</span><label className="notes-field"><small>Private notes</small><textarea value={notesDraft} maxLength={5000} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Why it stands out, questions for the agent, viewing notes…" /></label><div className="annotation-actions"><label><input type="checkbox" checked={favoriteDraft} onChange={(event) => setFavoriteDraft(event.target.checked)} /> Favorite deal</label><button disabled={savingAnnotation || data.dataMode !== "live" || (favoriteDraft === selected.is_favorite && notesDraft.trim() === (selected.private_notes ?? ""))} onClick={saveAnnotation}>{savingAnnotation ? "Saving…" : "Save shortlist"}</button></div></section>

        <section className="drawer-section planner-section"><span>INVESTMENT CALCULATOR</span><p className="section-intro">Test your own purchase and rental assumptions. These figures never replace the source asking price.</p>
          <div className="calculator-results"><div><small>Total acquisition</small><strong>{money(modelTotalAcquisition || null)}</strong></div><div><small>All-in €/m²</small><strong>{ppsqm(modelAllInPpsqm)}</strong></div><div><small>Gross yield</small><strong>{modelGrossYield == null ? "—" : `${modelGrossYield.toFixed(2)}%`}</strong></div><div><small>Net yield</small><strong>{modelNetYield == null ? "—" : `${modelNetYield.toFixed(2)}%`}</strong></div></div>
          <div className="model-signal"><span>Purchase vs asking</span><strong className={modelDiscount != null && modelDiscount < 0 ? "positive" : ""}>{modelDiscount == null ? "—" : `${modelDiscount > 0 ? "+" : ""}${modelDiscount.toFixed(1)}%`}</strong><small>Annual rent {money(modelAnnualRent || null)} · net income {money(modelNetAnnualIncome || null)}</small></div>
          <div className="workflow-fields investment-fields">
            <label><small>Purchase price</small><input type="number" min="0" step="100" value={workflow.purchase_price} onChange={(event) => setWorkflowField("purchase_price", event.target.value)} /></label>
            <label><small>Transfer tax</small><input type="number" min="0" step="100" value={workflow.transfer_tax_cost} onChange={(event) => setWorkflowField("transfer_tax_cost", event.target.value)} placeholder="0" /></label>
            <label><small>Legal & notary</small><input type="number" min="0" step="100" value={workflow.legal_notary_cost} onChange={(event) => setWorkflowField("legal_notary_cost", event.target.value)} placeholder="0" /></label>
            <label><small>Agency fee</small><input type="number" min="0" step="100" value={workflow.agency_fee_cost} onChange={(event) => setWorkflowField("agency_fee_cost", event.target.value)} placeholder="0" /></label>
            <label><small>Renovation</small><input type="number" min="0" step="100" value={workflow.renovation_budget} onChange={(event) => setWorkflowField("renovation_budget", event.target.value)} placeholder="0" /></label>
            <label><small>Furnishing</small><input type="number" min="0" step="100" value={workflow.furnishing_budget} onChange={(event) => setWorkflowField("furnishing_budget", event.target.value)} placeholder="0" /></label>
            <label><small>Other costs</small><input type="number" min="0" step="100" value={workflow.other_costs} onChange={(event) => setWorkflowField("other_costs", event.target.value)} placeholder="0" /></label>
            <label><small>Expected monthly rent</small><input type="number" min="0" step="25" value={workflow.expected_monthly_rent} onChange={(event) => setWorkflowField("expected_monthly_rent", event.target.value)} placeholder="0" /></label>
            <label><small>Annual operating costs</small><input type="number" min="0" step="100" value={workflow.annual_operating_costs} onChange={(event) => setWorkflowField("annual_operating_costs", event.target.value)} placeholder="0" /></label>
          </div>
          <div className="workflow-save"><span>{workflowNotice}</span><button disabled={savingWorkflow || data.dataMode !== "live"} onClick={() => saveWorkflow("Investment model saved with an audit snapshot.")}>{savingWorkflow ? "Saving…" : "Save investment model"}</button></div>
        </section>

        <section className="drawer-section planner-section"><span>CONTACT & VIEWING WORKFLOW</span><p className="section-intro">Keep outreach, viewings and negotiation details attached to this exact source listing.</p>
          <div className="workflow-fields">
            <label><small>Contacted</small><input type="datetime-local" value={workflow.contacted_at} onChange={(event) => setWorkflowField("contacted_at", event.target.value)} /></label>
            <label><small>Method</small><select value={workflow.contact_method} onChange={(event) => setWorkflowField("contact_method", event.target.value)}><option value="">Not selected</option><option>Phone</option><option>WhatsApp</option><option>Email</option><option>In person</option><option>Other</option></select></label>
            <label className="wide"><small>Agent or owner</small><input value={workflow.contact_person} maxLength={320} onChange={(event) => setWorkflowField("contact_person", event.target.value)} placeholder={selected.agency_name ?? "Name of contact"} /></label>
            <label className="wide"><small>Response</small><textarea value={workflow.response_summary} maxLength={5000} onChange={(event) => setWorkflowField("response_summary", event.target.value)} placeholder="Availability, documents, flexibility, answers…" /></label>
            <label><small>Viewing date</small><input type="datetime-local" value={workflow.viewing_at} onChange={(event) => setWorkflowField("viewing_at", event.target.value)} /></label>
            <label><small>Follow-up</small><input type="datetime-local" value={workflow.follow_up_at} onChange={(event) => setWorkflowField("follow_up_at", event.target.value)} /></label>
            <label className="wide"><small>Questions to ask</small><textarea value={workflow.questions_to_ask} maxLength={5000} onChange={(event) => setWorkflowField("questions_to_ask", event.target.value)} placeholder="Ownership documents, exact internal area, maintenance, utilities…" /></label>
            <label><small>Offered price</small><input type="number" min="0" step="100" value={workflow.offered_price} onChange={(event) => setWorkflowField("offered_price", event.target.value)} placeholder="€" /></label>
            <label className="wide"><small>Next action</small><input value={workflow.next_action} maxLength={1000} onChange={(event) => setWorkflowField("next_action", event.target.value)} placeholder="Call again, request documents, schedule viewing…" /></label>
            <label className="wide"><small>Negotiation notes</small><textarea value={workflow.negotiation_notes} maxLength={5000} onChange={(event) => setWorkflowField("negotiation_notes", event.target.value)} placeholder="Seller position, counteroffers, conditions and leverage…" /></label>
          </div>
          <div className="workflow-save"><span>{workflowNotice}{selected.workflow?.updated_at ? ` Last saved ${shortDate(selected.workflow.updated_at)}.` : ""}</span><button disabled={savingWorkflow || data.dataMode !== "live"} onClick={() => saveWorkflow("Contact and viewing plan saved with an audit snapshot.")}>{savingWorkflow ? "Saving…" : "Save contact plan"}</button></div>
        </section>
        <section className="drawer-section"><span>ACQUISITION STATUS</span><div className="status-editor"><select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as Status)}>{ALL_STATUSES.map((v) => <option key={v}>{v}</option>)}</select><button disabled={saving || statusDraft === selected.current_status || data.dataMode !== "live"} onClick={saveStatus}>{saving ? "Saving…" : "Save status"}</button></div>{notice && <p className="notice">{notice}</p>}</section>
        <section className="drawer-section"><span>PROPERTY EVIDENCE</span><dl><div><dt>Floor</dt><dd>{selected.floor ?? "—"}{selected.total_floors ? ` / ${selected.total_floors}` : ""}</dd></div><div><dt>Condition</dt><dd>{selected.building_condition ?? "—"}</dd></div><div><dt>Seller</dt><dd>{selected.seller_type}{selected.agency_name ? ` · ${selected.agency_name}` : ""}</dd></div><div><dt>Published</dt><dd>{shortDate(selected.source_published_at)}</dd></div><div><dt>Modified</dt><dd>{shortDate(selected.source_modified_at)}</dd></div><div><dt>Confidence</dt><dd>{selected.extraction_confidence}</dd></div><div><dt>{selected.score_model_version ?? "V2"} score</dt><dd>{selected.total_score ?? "—"} · {selected.classification}</dd></div></dl>{selected.explanation && <p className="score-explanation">{selected.explanation}</p>}</section>
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
        <a className="source-link" href={selected.canonical_url} target="_blank" rel="noreferrer">Open original {sourceLabel(selected.source)} listing ↗</a>
      </aside></div>}

      {selectedComparison && comparisonA && comparisonB && <div className="compare-backdrop" onMouseDown={() => setComparisonId(null)}><section className="compare-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="compare-head"><div><span>DUPLICATE EVIDENCE</span><h2>Are these the same property?</h2><p>{selectedComparison.reason}</p></div><button aria-label="Close comparison" onClick={() => setComparisonId(null)}>×</button></div>
        <div className="compare-confidence"><strong>{Math.round((selectedComparison.confidence_score ?? 0) * 100)}% match</strong><span>{selectedComparison.review_status}</span></div>
        <div className="compare-grid">
          {[comparisonA, comparisonB].map((listing) => <article key={listing.id}><span className={`source-pill source-${listing.source}`}>{sourceLabel(listing.source)}</span><h3>{listing.title}</h3><small>#{listing.source_listing_id} · {listing.normalized_location}</small><dl><div><dt>Price</dt><dd>{money(listing.price_value)}</dd></div><div><dt>€/m²</dt><dd>{ppsqm(listing.calculated_price_per_m2)}</dd></div><div><dt>Area</dt><dd>{listing.area_used_for_ppsqm_m2 ? `${listing.area_used_for_ppsqm_m2} m²` : "—"}</dd></div><div><dt>Bedrooms</dt><dd>{listing.bedrooms ?? "—"}</dd></div><div><dt>Floor</dt><dd>{listing.floor ?? "—"}</dd></div><div><dt>Agency</dt><dd>{listing.agency_name ?? listing.seller_type}</dd></div></dl><button onClick={() => { setComparisonId(null); openListing(listing); }}>Inspect this offer</button></article>)}
        </div>
        <div className="evidence-row"><span className={selectedComparison.same_area ? "yes" : ""}>Area {selectedComparison.same_area ? "matches" : "unconfirmed"}</span><span className={selectedComparison.same_location ? "yes" : ""}>Location {selectedComparison.same_location ? "matches" : "unconfirmed"}</span><span className={selectedComparison.same_bedrooms ? "yes" : ""}>Bedrooms {selectedComparison.same_bedrooms ? "match" : "unconfirmed"}</span><span className={selectedComparison.similar_price ? "yes" : ""}>Price {selectedComparison.similar_price ? "similar" : "differs"}</span></div>
        <div className="duplicate-decision"><div><span>YOUR DECISION</span><h3>Classify this relationship</h3><p>The candidate evidence remains stored even when you decide these are not duplicates.</p></div><div className="decision-options">
          {(["Confirmed Duplicate", "Same Project", "Not Duplicate", "Needs Review"] as DuplicateReviewStatus[]).map((value) => <button className={duplicateReviewDraft === value ? "active" : ""} key={value} onClick={() => setDuplicateReviewDraft(value)}>{value}</button>)}
        </div><textarea value={duplicateReviewNote} maxLength={1000} onChange={(event) => setDuplicateReviewNote(event.target.value)} placeholder="Optional review note—for example, same development but different floor…" /><div className="decision-save"><span>{duplicateReviewNotice}</span><button disabled={savingDuplicateReview || data.dataMode !== "live"} onClick={saveDuplicateReview}>{savingDuplicateReview ? "Saving…" : "Save decision"}</button></div></div>
      </section></div>}
    </div>
  );
}
