export type Status =
  | "New" | "Review" | "Watch" | "Hot Deal" | "Contact Agent"
  | "Contacted" | "Viewing" | "Negotiating" | "Rejected"
  | "Purchased" | "Removed";

export type PriceHistory = {
  observed_at: string; price_value: number | null; price_basis: string;
  currency: string; previous_price: number | null; change_amount: number | null;
  change_percent: number | null;
};

export type StatusHistory = {
  changed_at: string; old_status: string | null; new_status: string; reason: string | null;
};

export type Listing = {
  id: string; source_listing_id: string; canonical_url: string; title: string | null;
  source_location_raw: string | null; normalized_location: string | null;
  first_seen_at: string; last_seen_at: string; current_status: Status;
  status_changed_at: string; seller_type: string; seller_name: string | null;
  agency_name: string | null; possible_duplicate: boolean;
  clean_baseline_eligible: boolean; notes: string | null; observed_at: string;
  price_raw: string | null; price_value: number | null; currency: string | null;
  price_basis: string; advertised_area_m2: number | null; precise_area_m2: number | null;
  area_used_for_ppsqm_m2: number | null; area_basis: string | null;
  calculated_price_per_m2: number | null; bedrooms: number | null;
  bathrooms: number | null; floor: string | null; total_floors: number | null;
  year_built: number | null; building_condition: string | null;
  new_construction: boolean | null; parking: boolean | null;
  parking_spaces: number | null; garage: boolean | null; sea_view: boolean | null;
  distance_from_sea_m: number | null; furnished: boolean | null;
  elevator: boolean | null; public_contact: string | null;
  source_published_at: string | null; source_modified_at: string | null;
  description_raw: string | null; ambiguity_flags: string[];
  extraction_confidence: "high" | "medium" | "low" | "unknown";
  total_score: number | null; classification: string | null; explanation: string | null;
  price_history: PriceHistory[]; status_history: StatusHistory[];
};

export type DuplicateCandidate = {
  id: string; listing_id_a: string; source_listing_id_a: string;
  listing_id_b: string; source_listing_id_b: string; confidence_score: number | null;
  same_phone: boolean | null; same_area: boolean | null; same_location: boolean | null;
  same_bedrooms: boolean | null; same_floor: boolean | null; similar_price: boolean | null;
  description_similarity: number | null; photo_similarity: number | null;
  reason: string | null; review_status: string;
};

export type Scan = {
  id?: string; started_at?: string; listings_discovered?: number;
  pages_successful?: number; pages_failed?: number; authenticated?: boolean;
};

export type DashboardData = {
  generated_at: string; latest_scan: Scan; listings: Listing[];
  duplicates: DuplicateCandidate[]; dataMode?: "live" | "preview";
};
