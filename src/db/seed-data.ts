/**
 * Seed data, ported from the prototype (`docs/konverz-sales-copilot.jsx`).
 *
 * The account universe and the six verified people are real, sourced material
 * carried over from the prototype. The SIGNAL fixtures at the bottom are NOT —
 * they exist so chat has live state to reason about before scheduled sweeps
 * are built, and every one of them is marked so it cannot be mistaken for
 * verified intelligence (see SIGNAL_FIXTURES).
 */

import type { Engine } from "@/domain/signals";

export interface SeedAccount {
  name: string;
  engine: Engine;
  country: string;
  segment: string;
  /** Warm path — who could introduce us. */
  anchor: string;
  status: "client" | "prospect" | "discovered";
}

const universe: SeedAccount[] = [];
const add = (
  engine: Engine,
  country: string,
  segment: string,
  anchor: string,
  names: string[],
  status: SeedAccount["status"] = "prospect",
) => names.forEach((name) => universe.push({ name, engine, country, segment, anchor, status }));

/* ---------------------------------------------------------------- India */
add("Hire", "India", "Bank", "Kotak / Yes Bank (clients)", ["Kotak Mahindra Bank", "Yes Bank"], "client");
add("Hire", "India", "Bank", "Kotak Mahindra Bank", ["HDFC Bank", "ICICI Bank", "Axis Bank", "IDFC First Bank", "IndusInd Bank", "AU Small Finance Bank", "Bandhan Bank", "Federal Bank"]);
add("Hire", "India", "Insurer (agency)", "Bharti AXA", ["HDFC Life", "ICICI Prudential Life", "SBI Life", "Max Life", "Tata AIA Life", "Bajaj Allianz Life", "Aditya Birla Sun Life Insurance", "PNB MetLife", "Star Health & Allied Insurance", "ICICI Lombard", "Go Digit"]);
add("Hire", "India", "NBFC", "Shriram Finance", ["Bajaj Finance", "Cholamandalam Inv & Finance", "Muthoot Finance", "Manappuram Finance", "L&T Finance", "Mahindra Finance", "Tata Capital", "IIFL Finance", "Piramal Finance"]);
add("Hire", "India", "IT services / tech", "Wipro / Genpact (clients)", ["Wipro", "Genpact", "Sonata Software", "Happiest Minds"], "client");
add("Hire", "India", "IT services / tech", "Wipro", ["LTIMindtree", "Mphasis", "Coforge", "Persistent Systems"]);
add("Hire", "India", "QSR / retail frontline", "Taco Bell", ["Devyani International (KFC/PH)", "Sapphire Foods", "Jubilant FoodWorks (Domino's)", "Westlife Foodworld (McDonald's)", "Restaurant Brands Asia (BK)", "Trent (Zudio/Westside)", "Reliance Retail"]);
add("Learn", "India", "Industrial conglomerate", "Existing clients", ["Vedanta", "APL Apollo", "Mahindra Group", "Aditya Birla Group", "Hinduja Group", "ArcelorMittal Nippon Steel India", "Medi Assist"], "client");
add("Learn", "India", "Industrial conglomerate", "Vedanta / ABG", ["Tata Steel", "Tata Motors", "JSW Group", "Adani Group", "Jindal Steel & Power", "Hindalco", "UltraTech Cement", "Larsen & Toubro", "Dalmia Bharat"]);
add("Learn", "India", "Family conglomerate", "Hinduja", ["Godrej Industries", "Murugappa Group", "TVS Group", "RPG Group"]);
add("Learn", "India", "Auto / manufacturing", "Mahindra", ["Hero MotoCorp", "Bharat Forge"]);
add("Learn", "India", "Pharma", "Medi Assist", ["Sun Pharma", "Dr. Reddy's", "Cipla"]);
add("Learn", "India", "IT services", "Wipro / Genpact (clients)", ["Infosys", "TCS", "HCLTech", "Tech Mahindra"]);
add("Learn", "India", "Founder-led high-growth", "Country Delight / Pine Labs (clients)", ["Country Delight", "Pine Labs"], "client");
add("Learn", "India", "Founder-led high-growth", "Pine Labs", ["Eternal (Zomato)", "Swiggy", "Lenskart"]);

/* ---------------------------------------------------------- Philippines */
add("Hire", "Philippines", "Bank", "Kotak Mahindra Bank", ["BDO Unibank", "BPI", "Metrobank", "Security Bank", "RCBC"]);
add("Hire", "Philippines", "Insurer (agency)", "Bharti AXA", ["Sun Life Philippines", "Pru Life UK Philippines", "AIA Philippines"]);
add("Hire", "Philippines", "BPO / GBS", "Genpact", ["Concentrix PH", "Teleperformance PH", "TaskUs", "Alorica PH"]);
add("Learn", "Philippines", "Family conglomerate", "Hinduja", ["Ayala Corporation", "SM Investments", "JG Summit", "Aboitiz Group", "LT Group"]);
add("Learn", "Philippines", "Conglomerate", "Vedanta", ["San Miguel Corporation", "Metro Pacific Investments"]);

/* ------------------------------------------------------------- Malaysia */
add("Hire", "Malaysia", "Bank", "Sime Darby (client, MY)", ["Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong Bank"]);
add("Hire", "Malaysia", "Insurer (agency)", "Bharti AXA", ["AIA Malaysia", "Great Eastern Malaysia", "Prudential Malaysia"]);
add("Learn", "Malaysia", "GLC / conglomerate", "Petronas / Sime Darby (clients)", ["Petronas", "Sime Darby"], "client");
add("Learn", "Malaysia", "GLC / conglomerate", "Petronas", ["Tenaga Nasional", "Axiata", "IHH Healthcare", "Gamuda"]);
add("Learn", "Malaysia", "Family conglomerate", "Sime Darby", ["YTL Group", "Sunway Group", "Genting Group"]);

/* ------------------------------------------------------------ Indonesia */
add("Hire", "Indonesia", "Bank", "Kotak Mahindra Bank (motion)", ["Bank Mandiri", "Bank Central Asia (BCA)", "Bank Rakyat Indonesia (BRI)", "Bank Negara Indonesia (BNI)"]);
add("Hire", "Indonesia", "Insurer (agency)", "Bharti AXA (motion)", ["Prudential Indonesia", "Allianz Life Indonesia"]);
add("Learn", "Indonesia", "Conglomerate / GLC", "Petronas (GLC motion)", ["Astra International", "Sinar Mas Group", "Salim Group", "Telkom Indonesia", "GoTo Group"]);

/* -------------------------------------------------------------- Vietnam */
add("Hire", "Vietnam", "Bank", "Kotak Mahindra Bank (motion)", ["Vietcombank", "BIDV", "Techcombank", "VPBank"]);
add("Learn", "Vietnam", "Conglomerate / tech", "Vedanta (industrial motion)", ["Vingroup", "FPT Corporation", "Masan Group", "Viettel Group"]);

/* ------------------------------------------------------------ Singapore */
add("Hire", "Singapore", "Bank / regional hub", "Kotak Mahindra Bank (motion)", ["DBS Bank", "OCBC", "UOB", "Grab"]);
add("Learn", "Singapore", "Conglomerate / GLC", "Petronas (GLC motion)", ["Sea Group", "CapitaLand", "Singtel", "ST Engineering"]);

/* ------------------------------------------------------------------ UAE */
add("Hire", "UAE", "Bank", "Sobha Realty (client, UAE)", ["Emirates NBD", "First Abu Dhabi Bank", "ADCB", "Mashreq", "Dubai Islamic Bank"]);
add("Hire", "UAE", "Retail / frontline", "Taco Bell", ["Majid Al Futtaim Retail", "Landmark Group", "Lulu Group", "Al-Futtaim Group", "Emirates Group / dnata"]);
add("Learn", "UAE", "Developer / family", "Sobha Realty (client)", ["Sobha Realty"], "client");
add("Learn", "UAE", "Developer", "Sobha Realty", ["Emaar", "Aldar", "Damac", "Nakheel"]);
add("Learn", "UAE", "Family conglomerate", "Sobha Realty", ["Majid Al Futtaim", "Al Ghurair Group", "Chalhoub Group"]);
add("Learn", "UAE", "National champion", "Petronas", ["e& (Etisalat Group)", "ADNOC Group", "Emirates Group"]);

/* --------------------------------------------------------- Saudi Arabia */
add("Hire", "Saudi Arabia", "Bank", "Emirates NBD (Gulf motion)", ["Al Rajhi Bank", "Saudi National Bank (SNB)", "Riyad Bank"]);
add("Learn", "Saudi Arabia", "National champion / giga-project", "Vision 2030 programs", ["Saudi Aramco", "SABIC", "stc", "NEOM", "ACWA Power", "Ma'aden", "Almarai"]);

/* ------------------------------------------------------------------ SEA */
add("Learn", "SEA", "FMCG / conglomerate", "Lotte (client)", ["Lotte (SEA operations)"], "client");

export const SEED_UNIVERSE = universe;

/**
 * Verified stakeholders (PRD §8): name, title, company, public source, as-of
 * date. There is deliberately nowhere to put an email or phone.
 */
export interface SeedPerson {
  name: string;
  role: string;
  company: string;
  source: string;
  verifiedAt: string;
}

export const SEED_PEOPLE: SeedPerson[] = [
  { name: "Vijay Vaidyanathan", role: "CHRO (effective Apr 2026)", company: "HDFC Life", source: "People Matters", verifiedAt: "2026-08-18" },
  { name: "Vibhash Naik", role: "Group Head & CHRO (effective Feb 2026)", company: "HDFC Bank", source: "HDFC Bank management page", verifiedAt: "2026-08-18" },
  { name: "Sandeep Batra", role: "President & CHRO, Steel & Corporate (from Nov 2025)", company: "JSW Group", source: "Exchange filing / press", verifiedAt: "2026-08-18" },
  { name: "Shilpi Lal Sharma", role: "Group Head - Talent, L&D & DEI (from Dec 2025)", company: "JSW Group", source: "Press", verifiedAt: "2026-08-18" },
  { name: "Neha Saxena Shenoy", role: "CHRO (from Apr 2026)", company: "Emaar", source: "People Matters", verifiedAt: "2026-08-18" },
  { name: "Eman Abdulrazzaq", role: "Group CHRO", company: "Emirates NBD", source: "Emaar board page", verifiedAt: "2026-08-18" },
];

/**
 * DEVELOPMENT FIXTURES — NOT REAL INTELLIGENCE.
 *
 * These exist only so the chat engine and the ranking have live state to work
 * against before scheduled sweeps are built. Every one is written with
 * `confidence: 0` and no source URL, and the seeder suffixes the evidence with
 * a fixture marker, so nothing here can render in the UI as a sourced,
 * verified fact. Real sweeps overwrite them.
 *
 * `ageDays` is relative to the seed run, so the freshness curve and the
 * 180-540 day AMS window are both exercised without hard-coded dates.
 */
export interface SeedSignal {
  account: string;
  code: string;
  headline: string;
  evidence: string;
  ageDays: number;
}

export const SIGNAL_FIXTURES: SeedSignal[] = [
  // Tier-1, fresh — these should dominate the ranking.
  { account: "Emaar", code: "L1", headline: "New CHRO appointed", evidence: "CHRO appointment effective April 2026", ageDays: 3 },
  { account: "HDFC Life", code: "L1", headline: "New CHRO appointed", evidence: "CHRO appointment effective April 2026", ageDays: 6 },
  { account: "NEOM", code: "H1", headline: "Mass hiring announced", evidence: "Announced a large multi-year hiring programme", ageDays: 2 },
  { account: "Lulu Group", code: "H11", headline: "Store expansion wave", evidence: "New store openings announced across the Gulf", ageDays: 5 },
  { account: "Al Rajhi Bank", code: "H7", headline: "Nationalization quotas", evidence: "Saudization hiring targets raised", ageDays: 8 },
  { account: "ADNOC Group", code: "L5", headline: "Mega-project announced", evidence: "Major capacity programme announced", ageDays: 4 },
  { account: "Concentrix PH", code: "H2", headline: "Job posting surge", evidence: "Sharp rise in open roles across Manila sites", ageDays: 7 },
  { account: "JSW Group", code: "L1", headline: "New talent leadership", evidence: "Group Head - Talent, L&D & DEI appointed", ageDays: 11 },
  { account: "Saudi Aramco", code: "L11", headline: "Capability commitments", evidence: "Localisation capability commitments published", ageDays: 14 },
  { account: "Ayala Corporation", code: "L4", headline: "Family succession", evidence: "Next-generation leadership transition under way", ageDays: 20 },
  { account: "Vingroup", code: "L3", headline: "M&A integration", evidence: "Integration programme announced", ageDays: 16 },
  { account: "Grab", code: "L7", headline: "Enterprise AI programme", evidence: "Company-wide AI enablement programme announced", ageDays: 9 },
  { account: "Tata Steel", code: "L13", headline: "Skills-based organisation", evidence: "Skills-first workforce programme announced", ageDays: 22 },
  { account: "Petronas", code: "L2", headline: "Leadership academy", evidence: "New leadership academy announced", ageDays: 12 },
  { account: "Maybank", code: "H5", headline: "New TA head", evidence: "New head of talent acquisition appointed", ageDays: 18 },
  { account: "DBS Bank", code: "L15", headline: "CXO exit, no successor", evidence: "Senior departure with no named successor", ageDays: 25 },
  { account: "Reliance Retail", code: "H1", headline: "Mass hiring announced", evidence: "Large frontline hiring number announced", ageDays: 30 },
  { account: "Emirates NBD", code: "L1", headline: "Group CHRO in seat", evidence: "Group CHRO leading a people agenda reset", ageDays: 40 },

  // Tier-2 and stale, to prove decay actually ranks things down.
  { account: "Axiata", code: "L14", headline: "Industry transition", evidence: "Telecom workforce transition programme", ageDays: 200 },

  // The AMS path: an L6 go-live inside the 180-540 day window (PRD §4.2).
  { account: "Tenaga Nasional", code: "L6", headline: "HCM go-live", evidence: "HR system go-live completed", ageDays: 300 },
];
