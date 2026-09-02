import React, { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

/* ================================================================
   KOGNOZ ▸ KONVERZ — GROWTH ENGINE v2.0
   Where → Who → What → Do. Practice × Geography × Industry.
   $20M / 18 months · partner-led · single operator dispatching.
================================================================ */
const BRANDS = {
  kognoz: { key:"kognoz", label:"Kognoz", wordmark:"KOGNOZ", tagline:"Maximizing human potential", ink:"#0B1E2D", primary:"#005184", accent:"#009DBF", pop:"#75A02F", grad:"linear-gradient(90deg,#005184,#009DBF)", gradSvg:["#005184","#009DBF"] },
  konverz: { key:"konverz", label:"Konverz AI", wordmark:"Konverz AI", tagline:"The Talent Intelligence Layer", ink:"#071A24", primary:"#009DBF", accent:"#005184", pop:"#22C3E6", grad:"linear-gradient(90deg,#009DBF,#22C3E6)", gradSvg:["#009DBF","#22C3E6"] },
};
const C = { ink:"#0B1E2D", kblue:"#005184", cyan:"#009DBF", green:"#75A02F", mist:"#F4F8FA", card:"#FFFFFF", line:"#E2EAF0", soft:"#5A7284", faint:"#8CA2B0", amber:"#C77D0A", red:"#D64545", greenBg:"#EDF4E3" };
const GRAD = BRANDS.kognoz.grad;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtM = (n) => "$" + (n / 1000000).toFixed(n >= 10000000 ? 1 : 2).replace(/\.00$/, "") + "M";
const fmtK = (n) => n >= 1000000 ? fmtM(n) : "$" + Math.round(n / 1000) + "K";

/* ================= SIGNALS (ratified) ================= */
const SIGNALS = [
  ["H1","Hire","announced a big hiring number",1,42],["H2","Hire","posted a surge of job openings",1,56],["H3","Hire","announced a new GCC / capability center",1,90],
  ["H4","Hire","is expanding branches / markets",1,90],["H5","Hire","just got a new TA head or CHRO",1,90],["H6","Hire","is running a recruitment / assessment RFP",1,60],
  ["H7","Hire","is under nationalization hiring quotas",1,90],["H8","Hire","is talking publicly about attrition pain",2,90],["H9","Hire","won a license / product expansion",2,120],
  ["H10","Hire","is running campus drives",3,30],["H11","Hire","is opening a wave of new stores",2,120],
  ["L1","Learn","just appointed a new CHRO / CLO / talent head",1,90],["L2","Learn","announced a leadership academy",1,56],["L3","Learn","announced an M&A integration",1,270],
  ["L3b","Learn","announced a demerger / spin-off",1,270],["L4","Learn","is going through a family succession",1,365],["L5","Learn","announced a major plant / mega-project",1,180],
  ["L6","Learn","is going live on a new HR system",1,180],["L7","Learn","launched an enterprise AI program",2,180],["L8","Learn","brought in a professional CEO",2,180],
  ["L9","Learn","flagged capability gaps in its annual report",2,365],["L10","Learn","is prepping an IPO / PE investment",2,365],["L11","Learn","made nationalization capability commitments",2,180],
  ["L12","Learn","leadership is talking publicly about talent",3,90],["L13","Learn","is moving to a skills-based organization",1,180],["L14","Learn","faces an industry workforce transition",2,270],
  ["L15","Learn","has a CXO exit with no successor named",1,120],
];
const sigMap = Object.fromEntries(SIGNALS.map((s) => [s[0], s]));

/* ================= PRACTICES ================= */
const PRACTICES = [
  { id:"hire", brand:"Konverz", name:"Hire (JobFit AI)", signals:["H1","H2","H3","H4","H5","H6","H7","H9","H10","H11"], proofShort:"Bharti AXA cut hiring time 60% and cost 40% with JobFit AI", pain:"volume hiring breaks screening consistency — and a public number makes it visible", buyer:"CHRO or Head of TA" },
  { id:"nurture", brand:"Konverz", name:"Nurture (Careers & Mobility)", signals:["L9","L13","L6","L15"], proofShort:"we built the career-mobility-succession marketplace at a national energy major", pain:"good people leave when they can't see a path", buyer:"CHRO" },
  { id:"learncoach", brand:"Konverz", name:"Learn + Coach", signals:["L2","L1","L5","L11"], proofShort:"Petronas turned passive learning into engaging growth with us", pain:"academies fail on transfer, not content", buyer:"CLO or CHRO" },
  { id:"skills", brand:"Konverz", name:"Skills AI", signals:["L13","L6","L14"], proofShort:"we mapped ~450,000 roles to skills at a global IT major", pain:"skills-based intent with roles never mapped consistently", buyer:"CHRO / HR tech lead" },
  { id:"org", brand:"Kognoz", name:"Organization Transformation", signals:["L13","L14","L3","L3b","L7"], proofShort:"we redesigned job architecture for a 150,000-person global firm", pain:"fast growth, and the structure is buckling under it", buyer:"CEO / COO / CHRO" },
  { id:"family", brand:"Kognoz", name:"Family Business Transformation", signals:["L4","L10","L8"], proofShort:"we guided the second-gen transition of a 10,000-strong media group", pain:"the next generation isn't ready, and everything still runs through one person", buyer:"the founder or next-gen" },
  { id:"culture", brand:"Kognoz", name:"Culture & EX", signals:["L3","L9","L8","L12"], proofShort:"we unified values for a major group post-merger", pain:"engagement scores look fine but the energy is gone", buyer:"CHRO / CEO" },
  { id:"talent", brand:"Kognoz", name:"Talent & Leadership", signals:["L3b","L15","L9","L1"], proofShort:"we ran CEO/CXO assessment through a demerger at a multinational resources group", pain:"a key person resigns and no one is ready to step up", buyer:"the board / CEO / CHRO" },
  { id:"hrtx", brand:"Kognoz", name:"AI-Led HR Transformation", signals:["L6","L1","L7"], proofShort:"we shifted ~1/3 of HR effort to strategic work with Konverz AI; Darwinbox implementation + AMS", pain:"HR buried in admin instead of shaping the workforce", buyer:"CHRO / CIO" },
  { id:"worktx", brand:"Kognoz", name:"Work Transformation / Human-AI", signals:["L7","L13","L14"], proofShort:"we build human-AI collaboration into role design with clear trust thresholds", pain:"AI pilots impress in the demo, then quietly stall", buyer:"CEO / COO" },
];
const SIG2PRAC = {};
PRACTICES.forEach((p) => p.signals.forEach((s) => { (SIG2PRAC[s] = SIG2PRAC[s] || []).push(p); }));
const pracById = Object.fromEntries(PRACTICES.map((p) => [p.id, p]));

/* ================= TOWERS ================= */
const TOWERS = {
  T1: { label:"Org & Family Business", pracs:["org","family","talent","culture"], target:4000000 },
  T2: { label:"HR Transformation & Darwinbox", pracs:["hrtx","worktx"], target:6000000 },
  T3: { label:"Konverz Hire", pracs:["hire"], target:5000000 },
  T4: { label:"Konverz Nurture / Learn", pracs:["nurture","learncoach","skills"], target:5000000 },
};
const TOWER_KEYS = ["T1","T2","T3","T4"];
const prac2tower = (pid) => TOWER_KEYS.find((t) => TOWERS[t].pracs.includes(pid)) || "T1";
const towerOfPracticeName = (name) => { const p = PRACTICES.find((x) => x.name.startsWith(name || "")); return p ? prac2tower(p.id) : "T1"; };
const TIER_VALUE = { wedge:75000, core:300000, whale:500000 };

/* ================= MARKETS ================= */
const MARKETS = [["All","All markets"],["India","India"],["Philippines","Philippines"],["Malaysia","Malaysia"],["Indonesia","Indonesia"],["Vietnam","Vietnam"],["Singapore","Singapore"],["UAE","UAE"],["Saudi Arabia","Saudi Arabia"]];
const BENCHED = ["Thailand","Qatar"];
const MKT = {
  "India": { headline:"GCC boom, skills-first hiring, thin succession benches", drivers:["1,700+ GCCs and Tier-2 cities now a third of hiring volume","Internal mobility is the retention lever — most roles are still filled outside","Skills-first is replacing degree filters faster than roles are being mapped"],
    sell:[{ prac:"hire", line:"Volume hiring at banks, insurers and NBFCs is public and measurable — the Bharti AXA proof travels fastest here" },{ prac:"hrtx", line:"Darwinbox country of origin — implementations plus post-go-live AMS is a repeating motion" },{ prac:"skills", line:"Skills-first intent is ahead of actual role-skill mapping — Skillmaps closes exactly that gap" },{ prac:"family", line:"A generational handover wave is running through the promoter groups" }] },
  "Philippines": { headline:"BPO scale, agency insurance growth, family groups professionalizing", drivers:["BPO/GBS volume hiring never stops — quality-of-hire is the pain word","Agency-force expansion at the insurers mirrors our Bharti AXA playbook","The big family houses are professionalizing management"],
    sell:[{ prac:"hire", line:"BPO and agency-force screening at scale — consistency is what breaks first" },{ prac:"learncoach", line:"Frontline-to-leader academies for GBS operations hungry for supervisors" },{ prac:"family", line:"Second and third-generation transitions at the conglomerates" }] },
  "Malaysia": { headline:"GLC transformation with our strongest local proof", drivers:["GLC transformation agendas create multi-year capability programs","Petronas and Sime Darby are referenceable next door","Family groups formalizing governance for the next stage"],
    sell:[{ prac:"learncoach", line:"Petronas turned passive learning into growth with us — the reference is one call away" },{ prac:"hrtx", line:"HCM modernization at GLCs — implementation plus AMS" },{ prac:"family", line:"YTL, Sunway, Genting-class groups formalizing succession and governance" }] },
  "Indonesia": { headline:"Bank digitalisation and conglomerate scale", drivers:["The big four banks are expanding and digitalising branch networks at once","Conglomerates and GLCs run academy-scale capability programs","Fast-scaling firms appointing first-time HR leadership"],
    sell:[{ prac:"hire", line:"Branch and agent expansion at Mandiri/BCA/BRI scale strains screening consistency" },{ prac:"hrtx", line:"HCM selections and go-lives across digitalising banks — implementation wedge, AMS annuity" },{ prac:"skills", line:"Skills mapping for digitalising banks and telcos" }] },
  "Vietnam": { headline:"Fastest salary growth in SEA — capability can't keep up", drivers:["7.1% salary growth — the region's highest — makes retention a board topic","FDI manufacturing shift creates first-time-manager gaps at scale","Local champions scaling past their structures"],
    sell:[{ prac:"learncoach", line:"First-time-manager development at FDI manufacturing scale" },{ prac:"hire", line:"Bank and manufacturing volume hiring with screening built for scale" }] },
  "Singapore": { headline:"Regional HQs buying for the whole region", drivers:["Decisions made here deploy across SEA","Skills-based organization talk is furthest ahead here","Human-AI operating models on every board agenda"],
    sell:[{ prac:"skills", line:"Skills-based org intent at HQs — mapping that deploys region-wide" },{ prac:"worktx", line:"Human-AI role redesign with trust thresholds — beyond the pilot graveyard" }] },
  "UAE": { headline:"Emiratization deadlines and family groups formalizing", drivers:["Emiratization/Nafis quotas with real deadlines and fines","Developers and retail groups hiring at project speed","Family conglomerates formalizing governance"],
    sell:[{ prac:"hire", line:"Emiratization quotas make screening volume and quality one visible problem — JobFit solves both" },{ prac:"learncoach", line:"Nationalization is a capability commitment, not just a hiring number — academies deliver it" },{ prac:"family", line:"Al-Futtaim/Al Ghurair-class groups formalizing succession" }] },
  "Saudi Arabia": { headline:"Vision 2030: hiring and capability at giga-project scale", drivers:["Saudization/Nitaqat targets tighten every year","NEOM-class giga-projects hire whole workforces from zero","New entities need job architecture from scratch"],
    sell:[{ prac:"hire", line:"Nitaqat plus giga-project hiring — screening at a scale nobody's process survives" },{ prac:"learncoach", line:"Saudization succeeds or fails on capability building — that's an academy motion" },{ prac:"org", line:"Greenfield entities need role architecture before headcount" }] },
};
function recommendFor(a, sigsForAcct) {
  const country = a?.country || "";
  const mk = MKT[country];
  if (sigsForAcct && sigsForAcct.length) {
    const best = [...sigsForAcct].sort((x, y) => (sigMap[x.signal]?.[3] || 3) - (sigMap[y.signal]?.[3] || 3))[0];
    const p = (SIG2PRAC[best.signal] || [])[0];
    if (p) { const mline = mk && mk.sell.find((s) => s.prac === p.id); return { p, line: mline ? mline.line : `${p.pain} — and ${p.proofShort}` }; }
  }
  if (mk) { const wantHire = a?.engine === "Hire"; const pick = mk.sell.find((s) => (wantHire ? s.prac === "hire" : s.prac !== "hire")) || mk.sell[0]; return { p: pracById[pick.prac], line: pick.line }; }
  const seg = (a?.segment || "").toLowerCase();
  const pid = seg.includes("family") ? "family" : /bank|insur|nbfc|bpo|qsr|retail|aviation/.test(seg) ? "hire" : seg.includes("conglomerate") ? "talent" : a?.engine === "Hire" ? "hire" : "learncoach";
  const p = pracById[pid];
  return { p, line: `${p.pain} — and ${p.proofShort}` };
}

/* ================= SEED UNIVERSE ================= */
const SEED_U = [];
const add = (engine, country, segment, anchor, names, status) => names.forEach((n) => SEED_U.push({ name:n, engine, country, segment, anchor, status: status || "Prospect" }));
add("Hire","India","Bank","Kotak / Yes Bank (clients)",["Kotak Mahindra Bank","Yes Bank"],"Client - expand");
add("Hire","India","Bank","Kotak Mahindra Bank",["HDFC Bank","ICICI Bank","Axis Bank","IDFC First Bank","IndusInd Bank","AU Small Finance Bank","Bandhan Bank","Federal Bank"]);
add("Hire","India","Insurer (agency)","Bharti AXA",["HDFC Life","ICICI Prudential Life","SBI Life","Max Life","Tata AIA Life","Bajaj Allianz Life","Aditya Birla Sun Life Insurance","PNB MetLife","Star Health & Allied Insurance","ICICI Lombard","Go Digit"]);
add("Hire","India","NBFC","Shriram Finance",["Bajaj Finance","Cholamandalam Inv & Finance","Muthoot Finance","Manappuram Finance","L&T Finance","Mahindra Finance","Tata Capital","IIFL Finance","Piramal Finance"]);
add("Hire","India","IT services / tech","Wipro / Genpact (clients)",["Wipro","Genpact","Sonata Software","Happiest Minds"],"Client - expand");
add("Hire","India","IT services / tech","Wipro",["LTIMindtree","Mphasis","Coforge","Persistent Systems"]);
add("Hire","India","QSR / retail frontline","Taco Bell",["Devyani International (KFC/PH)","Sapphire Foods","Jubilant FoodWorks (Domino's)","Westlife Foodworld (McDonald's)","Restaurant Brands Asia (BK)","Trent (Zudio/Westside)","Reliance Retail"]);
add("Learn","India","Industrial conglomerate","Existing clients",["Vedanta","APL Apollo","Mahindra Group","Aditya Birla Group","Hinduja Group","ArcelorMittal Nippon Steel India","Medi Assist"],"Client - expand");
add("Learn","India","Industrial conglomerate","Vedanta / ABG",["Tata Steel","Tata Motors","JSW Group","Adani Group","Jindal Steel & Power","Hindalco","UltraTech Cement","Larsen & Toubro","Dalmia Bharat"]);
add("Learn","India","Family conglomerate","Hinduja",["Godrej Industries","Murugappa Group","TVS Group","RPG Group"]);
add("Learn","India","Auto / manufacturing","Mahindra",["Hero MotoCorp","Bharat Forge"]);
add("Learn","India","Pharma","Medi Assist",["Sun Pharma","Dr. Reddy's","Cipla"]);
add("Learn","India","IT services","Wipro / Genpact (clients)",["Infosys","TCS","HCLTech","Tech Mahindra"]);
add("Learn","India","Founder-led high-growth","Country Delight / Pine Labs (clients)",["Country Delight","Pine Labs"],"Client - expand");
add("Learn","India","Founder-led high-growth","Pine Labs",["Eternal (Zomato)","Swiggy","Lenskart"]);
add("Hire","Philippines","Bank","Kotak Mahindra Bank",["BDO Unibank","BPI","Metrobank","Security Bank","RCBC"]);
add("Hire","Philippines","Insurer (agency)","Bharti AXA",["Sun Life Philippines","Pru Life UK Philippines","AIA Philippines"]);
add("Hire","Philippines","BPO / GBS","Genpact",["Concentrix PH","Teleperformance PH","TaskUs","Alorica PH"]);
add("Learn","Philippines","Family conglomerate","Hinduja",["Ayala Corporation","SM Investments","JG Summit","Aboitiz Group","LT Group"]);
add("Learn","Philippines","Conglomerate","Vedanta",["San Miguel Corporation","Metro Pacific Investments"]);
add("Hire","Malaysia","Bank","Sime Darby (client, MY)",["Maybank","CIMB","Public Bank","RHB","Hong Leong Bank"]);
add("Hire","Malaysia","Insurer (agency)","Bharti AXA",["AIA Malaysia","Great Eastern Malaysia","Prudential Malaysia"]);
add("Learn","Malaysia","GLC / conglomerate","Petronas / Sime Darby (clients)",["Petronas","Sime Darby"],"Client - expand");
add("Learn","Malaysia","GLC / conglomerate","Petronas",["Tenaga Nasional","Axiata","IHH Healthcare","Gamuda"]);
add("Learn","Malaysia","Family conglomerate","Sime Darby",["YTL Group","Sunway Group","Genting Group"]);
add("Hire","Indonesia","Bank","Kotak Mahindra Bank (motion)",["Bank Mandiri","Bank Central Asia (BCA)","Bank Rakyat Indonesia (BRI)","Bank Negara Indonesia (BNI)"]);
add("Hire","Indonesia","Insurer (agency)","Bharti AXA (motion)",["Prudential Indonesia","Allianz Life Indonesia"]);
add("Learn","Indonesia","Conglomerate / GLC","Petronas (GLC motion)",["Astra International","Sinar Mas Group","Salim Group","Telkom Indonesia","GoTo Group"]);
add("Hire","Vietnam","Bank","Kotak Mahindra Bank (motion)",["Vietcombank","BIDV","Techcombank","VPBank"]);
add("Learn","Vietnam","Conglomerate / tech","Vedanta (industrial motion)",["Vingroup","FPT Corporation","Masan Group","Viettel Group"]);
add("Hire","Singapore","Bank / regional hub","Kotak Mahindra Bank (motion)",["DBS Bank","OCBC","UOB","Grab"]);
add("Learn","Singapore","Conglomerate / GLC","Petronas (GLC motion)",["Sea Group","CapitaLand","Singtel","ST Engineering"]);
add("Hire","UAE","Bank","Sobha Realty (client, UAE)",["Emirates NBD","First Abu Dhabi Bank","ADCB","Mashreq","Dubai Islamic Bank"]);
add("Hire","UAE","Retail / frontline","Taco Bell",["Majid Al Futtaim Retail","Landmark Group","Lulu Group","Al-Futtaim Group","Emirates Group / dnata"]);
add("Learn","UAE","Developer / family","Sobha Realty (client)",["Sobha Realty"],"Client - expand");
add("Learn","UAE","Developer","Sobha Realty",["Emaar","Aldar","Damac","Nakheel"]);
add("Learn","UAE","Family conglomerate","Sobha Realty",["Majid Al Futtaim","Al-Futtaim Group","Al Ghurair Group","Chalhoub Group"]);
add("Learn","UAE","National champion","Petronas",["e& (Etisalat Group)","ADNOC Group","Emirates Group"]);
add("Hire","Saudi Arabia","Bank","Emirates NBD (Gulf motion)",["Al Rajhi Bank","Saudi National Bank (SNB)","Riyad Bank"]);
add("Learn","Saudi Arabia","National champion / giga-project","Vision 2030 programs",["Saudi Aramco","SABIC","stc","NEOM","ACWA Power","Ma'aden","Almarai"]);
add("Learn","SEA","FMCG / conglomerate","Lotte (client)",["Lotte (SEA operations)"],"Client - expand");

const SEED_PEOPLE = [
  { name:"Vijay Vaidyanathan", role:"CHRO (effective Apr 2026)", company:"HDFC Life", src:"People Matters", verified:"2026-08-18" },
  { name:"Vibhash Naik", role:"Group Head & CHRO (effective Feb 2026)", company:"HDFC Bank", src:"HDFC Bank management page", verified:"2026-08-18" },
  { name:"Sandeep Batra", role:"President & CHRO, Steel & Corporate (from Nov 2025)", company:"JSW Group", src:"Exchange filing / press", verified:"2026-08-18" },
  { name:"Shilpi Lal Sharma", role:"Group Head - Talent, L&D & DEI (from Dec 2025)", company:"JSW Group", src:"Press", verified:"2026-08-18" },
  { name:"Neha Saxena Shenoy", role:"CHRO (from Apr 2026)", company:"Emaar India", src:"People Matters", verified:"2026-08-18" },
  { name:"Eman Abdulrazzaq", role:"Group CHRO", company:"Emirates NBD", src:"Emaar board page", verified:"2026-08-18" },
];

/* ================= INDUSTRY LENS ================= */
const INDUSTRIES = ["Banking","Insurance","NBFC & Finance","BPO / GCC / IT","Retail & QSR","Real Estate","Industrial & Energy","Conglomerate & Family","Pharma & Health","Telecom & Tech","Other"];
function industryOf(seg) {
  const s = (seg || "").toLowerCase();
  if (/bank/.test(s)) return "Banking";
  if (/insur/.test(s)) return "Insurance";
  if (/nbfc|finance|fintech|payments/.test(s)) return "NBFC & Finance";
  if (/bpo|gbs|gcc|it services|shared service/.test(s)) return "BPO / GCC / IT";
  if (/qsr|retail|frontline|store|consumer|fmcg/.test(s)) return "Retail & QSR";
  if (/developer|real estate|property/.test(s)) return "Real Estate";
  if (/giga|energy|oil|power|mining|steel|auto|manufactur|plant|industrial|infrastructure|aviation|airline/.test(s)) return "Industrial & Energy";
  if (/pharma|health|hospital/.test(s)) return "Pharma & Health";
  if (/telecom|tech|high-growth|founder|digital|software/.test(s)) return "Telecom & Tech";
  if (/family|conglomerate|glc|holding|champion|group/.test(s)) return "Conglomerate & Family";
  return "Other";
}

/* ================= PROMPTS ================= */
const REGIONS = "India, Southeast Asia (Philippines, Malaysia, Indonesia, Vietnam, Singapore), and the Middle East (UAE, Saudi Arabia)";
const PRAC_TXT = PRACTICES.map((p) => `- ${p.name} (${p.brand}): pain: ${p.pain}. Proof: ${p.proofShort}. Buyer: ${p.buyer}. Signals: ${p.signals.join(",")}.`).join("\n");

const SYS = `You are the copilot of the Kognoz + Konverz GROWTH ENGINE — a partner-led sales intelligence system targeting $20M in 18 months across ${REGIONS}. You have web search; use it for anything current. Never answer "who currently holds role X" from memory; always search.
PRACTICES (Augmented Intelligence(TM) — behavioral science, scaled by AI, people always making the call):
${PRAC_TXT}
Proof clients: Bharti AXA, Shriram, Kotak, Yes Bank, Wipro, Genpact, Petronas, Sime Darby, Sobha Realty, Vedanta, APL Apollo, Mahindra, Aditya Birla, Hinduja, ArcelorMittal, Taco Bell, Country Delight, Pine Labs, Lotte, Medi Assist.
SIGNAL IDS (id|tier): ${SIGNALS.filter((s)=>s[3]<3).map((s)=>`${s[0]}|${s[3]}`).join(" ")}.
DOCTRINE: warm path first — always suggest who could introduce before a cold note; two-beat play for new CHROs (congratulate first, substance at week 3-4); partner-sized asks (exchange of notes, 25 minutes, coffee — never "demo" except volume-hiring); 3-touch cap then rotate door.
OPPORTUNITY TAGGING: If (and only if) your answer identifies concrete sales opportunities at specific companies, append at the VERY END, on its own line: OPPS_JSON: [{"account":"<company>","practice":"<short practice name>","why":"<one plain line: trigger + fit>","signal":"<best signal id or empty>","country":"<country>","segment":"<industry segment>"}] — max 5, real companies from your answer only. Otherwise omit the line.
STAKEHOLDER RULES (strict): ONLY professional public data — name, title, company, dates, source. NEVER search for, provide, or store emails, phone numbers, addresses, or personal socials; decline and suggest LinkedIn/official channels.
STYLE: plain language a busy partner gets in one read. Short sentences. No jargon, never "leverage/synergy/end-to-end/solution". Evidence-first, confidence stated. Cite sources when you searched.`;

const MAIL_SYS = `You write outreach for Kognoz (people consulting) + Konverz AI (talent intelligence platform), partner-led. Respond ONLY with JSON, no fences: {"subject":"<max 9 words, specific — for linkedin-pov a 5-8 word hook line>","body":"<plain text with \\n line breaks>"}
MAIL KIND shapes:
- first-touch: (1) trigger cited naturally with its number/fact; (2) implication for the reader's KPI in plain pain language; (3) one proof point matched to their segment; (4) one small ask sized for a senior exchange — a short exchange of notes, 25 minutes, or coffee when next in their city; a demo ONLY for volume-hiring triggers. Under 130 words.
- congrats: under 60 words. Warm congratulation on the new role. One specific line of respect about the mandate ahead. ZERO ask, zero pitch, zero company description.
- follow-up: under 80 words. Reference the earlier note in one graceful clause. Add ONE new angle. Restate the small ask.
- value-add: under 80 words. One genuinely useful insight tied to the trigger. No ask beyond "thought this was worth your time."
- meeting-confirm: under 70 words. Confirm, propose a crisp 3-point agenda, ask if they'd add anything.
- proposal-nudge: under 80 words. Zero pressure. One de-risking step: reference call, smaller pilot, or success-criteria review.
- linkedin-pov: 120-180 words in the author's personal voice. Open with a sharp observation from the pattern, 2-3 crisp insights, end with ONE question. No selling, max 2 hashtags, no signoff.
If an ANGLE is provided, build around it. If the brief notes a Saudi Arabia target, the sender writes from the UAE office — reference naturally if location comes up.
Rules: warm, direct, zero jargon — never "leverage/synergy/end-to-end/solution". Address by role if no name given. Sign off with sender name and title (except linkedin-pov). Never invent recipient contact details or personal facts. DRAFT for human review.`;


const INSIGHT_SYS = `You synthesize market intelligence for the Kognoz + Konverz Growth Engine. Input: a cell (a practice tower, a geography, or an industry) and the live signals found there in the last 30 days, plus our practices. Respond ONLY with JSON, no fences:
{"pattern":"<2 short sentences: what is visibly happening across these companies right now — name 2-3 companies with their numbers/facts. Plain words.>",
"play":"<1 sentence, imperative: the single practice and angle to take into this cell this week, and to whom (buyer role).>",
"first":"<1 sentence: the ONE company to open first and why — freshest tier-1 trigger or warmest path.>"}
Use ONLY the facts provided — never invent. No jargon, never leverage/synergy/end-to-end/solution.`;

const ROOM_SYS = `You are the account-intelligence engine of the Kognoz + Konverz Growth Engine. You have web search — ALWAYS search for the latest on the company before writing. Build a compact dossier where every part ends in a recommendation; a partner reads it between meetings.
OUR PRACTICES: ${PRAC_TXT}
DOCTRINE: warm path first; partner-sized asks; two-beat play for fresh CHRO appointments.
Respond ONLY with JSON, no fences:
{"story":"<2-3 plain sentences: what this company is visibly trying to do right now, from current news. Specific facts and numbers.>",
"posture":"<1-2 sentences: which ONE practice to lead with and why NOW. Imperative.>",
"angles":[{"t":"<angle name, 4-7 words>","why":"<1 sentence linking a specific fact about them to one of our proofs>","use":"<when to use it, few words>"}],
"warm_path":"<1 sentence: most plausible introduction route — a client, board/alumni overlap, or ecosystem referrer — or 'none obvious; open cold with the freshest trigger'>",
"people_reco":"<1 sentence: which role to verify or add next and why. Roles/titles only.>",
"channels":{"page":"<official contact or careers page URL, or empty string>","mailboxes":["<ONLY generic corporate mailboxes the company itself publishes — e.g. info@, hr@, careers@ — max 3, or empty>"]},
"next_move":"<ONE imperative sentence: the single best move this week>"}
2-3 angles. ONLY facts found or given. Plain language. STAKEHOLDER RULES: names/titles/companies/dates/sources only — NEVER individual emails, phones, or personal details. CHANNELS: only company-published corporate mailboxes; NEVER an individual's address; NEVER guess patterns.`;

const SWEEP_SYS = `You are the automated sweep engine of the Kognoz + Konverz Growth Engine (${REGIONS}).
Task: run the web searches described and return findings as JSON ONLY — no prose, no fences.
Schema: [{"account":"<exact name from provided list, or company name prefixed 'NEW: ' if not on the list>","engine":"Hire|Learn","country":"<country name>","segment":"<short industry segment>","signal":"<signal ID>","tier":1,"headline":"<max 12 words>","evidence":"<one sentence with the specific number/fact>","url":"<source url>","date":"YYYY-MM-DD","confidence":"high|medium|low","action":"<one-line next step>"}]
For NEW accounts, engine/country/segment are required. Engine: Hire = volume-hiring org (bank, insurer, NBFC, BPO, GCC, retail/QSR, aviation); Learn = conglomerate/enterprise for leadership, org, culture, succession, HR-transformation work.
Signal IDs: H1|1 mass-hiring number. H2|1 posting spike. H3|1 new GCC. H4|1 branch expansion. H5|1 new TA head/CHRO at volume hirer. H6|1 recruitment RFP. H7|1 nationalization quotas. H8|2 attrition pain. H9|2 license expansion. H11|2 store expansion. L1|1 new CHRO/CLO/talent head. L2|1 leadership academy. L3|1 M&A. L3b|1 demerger. L4|1 promoter generational transition. L5|1 plant/mega-project. L6|1 HCM go-live (Darwinbox etc.). L7|2 enterprise AI program. L8|2 new professional CEO. L10|2 IPO/PE family business. L11|2 nationalization commitments. L13|1 skills-based org. L14|2 industry-transition workforce. L15|1 CXO exit, no successor.
Rules: last ~30 days (except where a prompt says otherwise), real dated sources, max 6 items, [] if none. Never include personal contact details. Raw JSON only.`;

const makeSweeps = (universe) => {
  const namesBy = (f) => universe.filter(f).map((a) => a.name).join("; ");
  return [
    { id:"leaders", title:"leadership moves",
      prompt:`Search for newly appointed CHROs, Chief People Officers, CLOs, or Heads of Talent Acquisition at large companies in ${REGIONS}. Map to H5 (volume hirers) or L1 (conglomerates). Off-list companies welcome — prefix "NEW: " and classify. Priority list: ${namesBy(()=>true).slice(0,1500)}` },
    { id:"hiring", title:"hiring & expansion",
      prompt:`Search for recent mass-hiring announcements, branch-expansion or store-opening plans by banks, insurers, NBFCs, QSR and retail chains in India, Philippines, Malaysia, Indonesia, Vietnam, or Singapore. Signals: H1, H4, H11. Off-list welcome — prefix "NEW: ". Priority list: ${namesBy((a)=>a.engine==="Hire"&&!["UAE","Saudi Arabia"].includes(a.country)).slice(0,1200)}` },
    { id:"congl", title:"conglomerate & family moves",
      prompt:`Search for recent M&A, demergers, restructurings, next-generation succession moves or new professional CEOs at large conglomerates in India, Philippines, Malaysia, Indonesia, Vietnam, Singapore. Signals: L3, L3b, L4, L8, L10. Off-list welcome — prefix "NEW: ". Priority list: ${namesBy((a)=>a.engine==="Learn"&&!["UAE","Saudi Arabia"].includes(a.country)).slice(0,1200)}` },
    { id:"capability", title:"capability, HCM go-lives & AMS windows",
      prompt:`Search for recent leadership-academy launches, HCM/HRMS selections and go-lives (Darwinbox especially, also Workday, SuccessFactors, Cornerstone, Oracle), skills-based organization announcements, and enterprise AI programs in India, Southeast Asia, or the Gulf. Signals: L2, L6, L7, L13. ALSO find companies that went live on Darwinbox or another major HCM 6-18 MONTHS AGO (signal L6, use the go-live date) — post-implementation AMS prospects. Off-list welcome — prefix "NEW: ". Priority list: ${namesBy((a)=>a.engine==="Learn").slice(0,1200)}` },
    { id:"succession", title:"CXO exits",
      prompt:`Search for recently announced CEO, CFO, COO, or other CXO retirements, resignations, or exits at large enterprises in ${REGIONS}, especially with no successor named. Signal: L15 (also L4 if family-led). Off-list welcome — prefix "NEW: ". Priority list: ${namesBy((a)=>a.engine==="Learn").slice(0,1200)}` },
    { id:"gulf", title:"Gulf (UAE + KSA)",
      prompt:`Search for recent Gulf news: Emiratization/Nafis and Saudization/Nitaqat targets and deadlines, Vision 2030 giga-project hiring (NEOM, Red Sea, Diriyah), major hiring or expansion by Gulf banks, developers, airlines and retail groups, and leadership changes at family conglomerates and national champions in UAE and Saudi Arabia. Signals: H7, H1, H4, L4, L5, L11, L15. Off-list welcome — prefix "NEW: ". Priority list: ${namesBy((a)=>["UAE","Saudi Arabia"].includes(a.country))}` },
  ];
};
const ICP = `Companies with roughly 2,000+ employees OR $100M+ revenue, plus a scaling exception: 500+ announced hires, IPO/PE event, or a mega-project. In scope: banks, insurers, NBFCs/finance, BPO/GBS and GCCs, IT services, QSR/retail/consumer frontline, conglomerates and family groups, developers/real estate, energy/industrial/manufacturing, aviation, telecom, healthcare/pharma. Out: government ministries, holding shells, small companies below the floor.`;
const RADAR_DEFAULT = ["India","UAE","Saudi Arabia","Philippines","Malaysia"];
const makeRadar = (markets, universe) => {
  const known = universe.map((a) => a.name).join("; ").slice(0, 800);
  return (markets || []).map((m) => ({ id:"radar-" + m, title:`${m} radar`,
    prompt:`MARKET RADAR — ${m}. Hunt across the ENTIRE ${m} market for companies with fresh buying triggers, INCLUDING and especially companies NOT on our lists. Only companies meeting: ${ICP}
Search the last ~30 days for: mass-hiring or 500+ open roles; new GCC/captive/regional HQ; ${["UAE","Saudi Arabia"].includes(m) ? "nationalization quota pressure; " : ""}new CHRO/CLO at a scale employer; M&A or demerger; family IPO/PE or succession; leadership academy or HCM go-live (Darwinbox especially); mega-project or major plant.
Prefix every company not on the known list with "NEW: " and classify engine/country/segment. Known (skip): ${known}` }));
};

/* ================= API ================= */
async function apiCall(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.content) throw new Error(data.error?.message || "No response");
  return data;
}
const textOf = (data) => data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
function parseJsonBlock(text, open, close) {
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf(open), e = clean.lastIndexOf(close);
  if (s === -1 || e === -1) throw new Error("no json");
  return JSON.parse(clean.slice(s, e + 1));
}
async function callCopilot(history) {
  const data = await apiCall({ model:"claude-sonnet-4-6", max_tokens:1000, system:SYS, messages:history, tools:[{ type:"web_search_20250305", name:"web_search" }] });
  const searched = data.content.some((b) => b.type === "server_tool_use" || b.type === "web_search_tool_result");
  return { text: textOf(data).trim() || "(no text returned)", searched };
}
async function callMailWriter(brief) {
  const data = await apiCall({ model:"claude-sonnet-4-6", max_tokens:1000, system:MAIL_SYS, messages:[{ role:"user", content:brief }] });
  const obj = parseJsonBlock(textOf(data), "{", "}");
  return { subject: obj.subject || "", body: obj.body || "" };
}
async function callInsightWriter(ctx) {
  const data = await apiCall({ model:"claude-sonnet-4-6", max_tokens:1000, system:INSIGHT_SYS, messages:[{ role:"user", content:ctx }] });
  const obj = parseJsonBlock(textOf(data), "{", "}");
  return { pattern: obj.pattern || "", play: obj.play || "", first: obj.first || "" };
}
async function callRoomWriter(context) {
  const data = await apiCall({ model:"claude-sonnet-4-6", max_tokens:1000, system:ROOM_SYS, messages:[{ role:"user", content:context }], tools:[{ type:"web_search_20250305", name:"web_search" }] });
  const obj = parseJsonBlock(textOf(data), "{", "}");
  const ch = obj.channels && typeof obj.channels === "object" ? obj.channels : {};
  return { story: obj.story || "", posture: obj.posture || "", angles: Array.isArray(obj.angles) ? obj.angles.slice(0, 3) : [],
    warm_path: obj.warm_path || "", people_reco: obj.people_reco || "", next_move: obj.next_move || "",
    channels: { page: typeof ch.page === "string" ? ch.page : "", mailboxes: Array.isArray(ch.mailboxes) ? ch.mailboxes.filter((x) => typeof x === "string" && x.includes("@")).slice(0, 3) : [] } };
}
async function runOneSweep(sweep) {
  const data = await apiCall({ model:"claude-sonnet-4-6", max_tokens:1000, system:SWEEP_SYS, messages:[{ role:"user", content:sweep.prompt }], tools:[{ type:"web_search_20250305", name:"web_search" }] });
  try {
    const arr = parseJsonBlock(textOf(data), "[", "]");
    return Array.isArray(arr) ? arr.filter((x) => x && x.account && x.signal).map((x) => ({ ...x, sweep: sweep.id })) : [];
  } catch { return []; }
}

/* ================= STORAGE ================= */
async function sGet(key, fallback, shared = true) {
  try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : fallback; } catch { return fallback; }
}
async function sSet(key, val, shared = true) {
  try { await window.storage.set(key, JSON.stringify(val), shared); return true; } catch { return false; }
}

/* ================= INTERNALS ================= */
const csvCell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
function pipelineToZohoDealsCsv(pipe) {
  const head = ["Deal Name","Account Name","Stage","Amount","Closing Date","Next Step","Description","Lead Source"].map(csvCell).join(",");
  const rows = pipe.map((c) => [`${c.account} — ${c.practice}`, c.account, ZOHO_STAGE[c.stage] || "Qualification", c.value || "", c.due || addDays(90), c.next || "",
    `Signal ${c.signal || ""}: ${c.evidence || ""} · Tower ${c.tower || ""} · Partner ${c.partner || ""}`, "Growth Engine"].map(csvCell).join(","));
  return [head, ...rows].join("\n");
}
function peopleToZohoLeadsCsv(people) {
  const head = ["First Name","Last Name","Designation","Company","Lead Source","Description"].map(csvCell).join(",");
  const rows = people.map((p) => { const parts = (p.name || "").trim().split(/\s+/); const last = parts.length > 1 ? parts.pop() : (parts[0] || "Unknown");
    return [parts.join(" "), last, p.role, p.company, "Growth Engine", `Public source: ${p.src || ""} · verified ${p.verified || ""}`].map(csvCell).join(","); });
  return [head, ...rows].join("\n");
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function buildMailHtml(brand, subject, body, sender, senderTitle) {
  const B = BRANDS[brand];
  const paras = esc(body).split("\n").filter(Boolean).map((p) => `<p style="margin:0 0 14px 0;">${p}</p>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F2F6F9;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F6F9;padding:24px 0;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Poppins,Segoe UI,Arial,sans-serif;"><tr><td style="background:${B.ink};padding:22px 32px;"><div style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:.5px;">${esc(B.wordmark)}</div><div style="font-size:11px;color:${B.accent};margin-top:2px;">${esc(B.tagline)}</div><div style="height:3px;width:64px;background:${B.primary};margin-top:12px;border-radius:2px;"></div></td></tr><tr><td style="padding:28px 32px 8px 32px;font-size:14.5px;line-height:1.7;color:#22323E;">${paras}</td></tr><tr><td style="padding:4px 32px 26px 32px;"><div style="font-size:14px;font-weight:600;color:${B.primary};">${esc(sender || "")}</div><div style="font-size:12px;color:#4A6274;">${esc(senderTitle || "")}</div></td></tr><tr><td style="background:#F2F6F9;padding:14px 32px;font-size:10.5px;color:#7A8C99;">${esc(B.label)} · Behavioral science, scaled by AI — your people always making the call.</td></tr></table></td></tr></table></body></html>`;
}
const XP = { mail:10, add:15, meeting:50, won:100, person:5 };
const itemKey = (it) => `${it.account}|${it.signal}|${it.date || ""}`;
const cleanName = (n) => String(n || "").replace(/^NEW:\s*/, "").trim();
const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
const pracBrandKey = (practice) => (PRACTICES.find((p) => p.name.startsWith(practice || ""))?.brand === "Konverz" ? "konverz" : "kognoz");
const ageDays = (d) => d ? (Date.now() - new Date(d).getTime()) / 86400000 : 999;
const agoText = (dateStr) => {
  if (!dateStr) return "recently";
  const d = Math.floor(ageDays(dateStr));
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : d < 14 ? "last week" : d < 60 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`;
};
const whyNow = (it) => { const s = sigMap[it.signal]; return `${s ? s[2] : "made a move"} ${agoText(it.date)}`; };
const monthOf = (startStr) => Math.max(1, Math.floor((Date.now() - new Date(startStr || todayStr()).getTime()) / (30.44 * 86400000)) + 1);
const curveTarget = (m) => m <= 6 ? 1500000 * (m / 6) : m <= 12 ? 1500000 + 5000000 * ((m - 6) / 6) : Math.min(20000000, 6500000 + 13500000 * ((m - 12) / 6));
const FAMILIES = [["SUCCESSION",["L4","L15","L8","L3b"]],["HIRING SURGE",["H1","H2","H3","H4","H11"]],["CAPABILITY BUILD",["L2","L6","L7","L13"]],["NATIONALIZATION",["H7","L11"]],["DEAL FLOW",["L3","L10"]]];
const towerOfSignal = (sig, engine) => { const p = (SIG2PRAC[sig] || [])[0]; return p ? prac2tower(p.id) : (engine === "Hire" ? "T3" : "T1"); };

/* ================= THE LENS ENGINE — Where → Who → What → Do ================= */
/* enrich: every live trigger becomes a target row with practice tower, geography, industry */
function enrichTargets({ items, universe, pipe, log, people, dnc }) {
  const uniBy = Object.fromEntries(universe.map((a) => [a.name, a]));
  const activeBy = {};
  (pipe || []).forEach((c) => { if (!["Won","Lost"].includes(c.stage)) activeBy[c.account] = c; });
  const blocked = new Set(dnc || []);
  const byAcct = {};
  const push = (name, it, extraFlags = {}) => {
    if (blocked.has(name)) return;
    const a = uniBy[name];
    const country = it.country || (a ? a.country : "") || "—";
    if (BENCHED.includes(country)) return;
    const industry = industryOf(it.segment || (a ? a.segment : ""));
    const tower = towerOfSignal(it.signal, it.engine || (a ? a.engine : ""));
    const tier = sigMap[it.signal]?.[3] || 3;
    const age = ageDays(it.date);
    const win = sigMap[it.signal]?.[4] || 90;
    const fresh = Math.max(0, 1 - age / win);
    const isNew = !a || a.status === "Auto-discovered";
    const isClient = a && a.status === "Client - expand";
    let score = (tier === 1 ? 40 : tier === 2 ? 22 : 8) + 35 * fresh + (isNew ? 12 : isClient ? 8 : 5);
    if (extraFlags.ams) score = 30;
    const row = { name, country, industry, tower, it, tier, age, score, isNew, isClient, inPipe: !!activeBy[name], card: activeBy[name] || null,
      person: (people || []).find((p) => p.company === name) || null,
      warm: a && a.anchor && !isClient && !/motion|find|tagged/i.test(a.anchor) ? a.anchor : null, ...extraFlags };
    if (!byAcct[name] || byAcct[name].score < score) byAcct[name] = row;
  };
  (items || []).forEach((it) => push(cleanName(it.account), it));
  /* AMS: L6 aged 6-18 months, no live thread → T2 annuity target */
  (log || []).forEach((e) => {
    if (e.signal !== "L6" || !e.date) return;
    const age = ageDays(e.date);
    if (age < 180 || age > 540 || activeBy[e.account] || byAcct[e.account]) return;
    push(e.account, { signal:"L6", evidence:`HCM live ~${Math.round(age / 30)} months — AMS window`, date:e.date, headline:"AMS window" }, { ams:true });
  });
  /* recent radar finds without a live item */
  universe.filter((a) => a.status === "Auto-discovered" && a.date && ageDays(a.date) <= 14 && !byAcct[a.name] && !activeBy[a.name])
    .forEach((a) => push(a.name, { signal:"", evidence: a.evidence || "Radar find", date: a.date, headline:"Radar find", engine:a.engine, segment:a.segment, country:a.country }, { radarOnly:true }));
  return Object.values(byAcct).sort((x, y) => y.score - x.score);
}
function buildCells(targets, pipe) {
  const cells = { tower:{}, geo:{}, industry:{} };
  const bump = (dim, key, t) => { const c = cells[dim][key] = cells[dim][key] || { key, n:0, hot:0, newN:0, rows:[], sub:{} }; c.n++; if (t.tier === 1 && t.age <= 14) c.hot++; if (t.isNew) c.newN++; c.rows.push(t); };
  targets.forEach((t) => {
    bump("tower", t.tower, t); bump("geo", t.country, t); bump("industry", t.industry, t);
    const tc = cells.tower[t.tower]; tc.sub[t.country] = (tc.sub[t.country] || 0) + 1;
    const gc = cells.geo[t.country]; gc.sub[t.industry] = (gc.sub[t.industry] || 0) + 1;
    const ic = cells.industry[t.industry]; ic.sub[t.country] = (ic.sub[t.country] || 0) + 1;
  });
  const active = (pipe || []).filter((c) => !["Won","Lost"].includes(c.stage));
  TOWER_KEYS.forEach((t) => { const c = cells.tower[t] = cells.tower[t] || { key:t, n:0, hot:0, newN:0, rows:[], sub:{} }; c.pipe = active.filter((x) => x.tower === t).reduce((s, x) => s + (x.value || 0), 0); });
  return cells;
}
const topSub = (sub, k = 3) => Object.entries(sub || {}).sort((a, b) => b[1] - a[1]).slice(0, k);

/* partner packet — one-tap forwardable dispatch */
function buildPacket(card, opts = {}) {
  const tower = TOWERS[card.tower] || {};
  return [
    `OPPORTUNITY — ${card.account}${opts.country ? ` (${opts.country})` : ""}`,
    `Tower: ${tower.label || card.tower || "—"} → ${card.partner || "unassigned"}`,
    `Value (working): ${card.value ? fmtK(card.value) : "—"} · ${card.tier || "core"}${card.whale ? " · WHALE" : ""}`,
    card.evidence ? `Trigger: ${card.evidence}${card.url ? ` (${card.url})` : ""}` : null,
    opts.rec ? `Take them: ${opts.rec}` : (card.practice && card.practice !== "TBD" ? `Take them: ${card.practice}` : null),
    opts.door ? `Door: ${opts.door}` : `Door: to be found — LinkedIn or official channels`,
    opts.warm ? `Warm path: ${opts.warm}` : null,
    opts.draft ? `\nDRAFT (plain text, edit before sending):\nSubject: ${opts.draft.subject}\n\n${opts.draft.body}` : null,
    `\n— Growth Engine · ${todayStr()} · verify before acting`,
  ].filter(Boolean).join("\n");
}

/* ================= CHAT ENGINE — prompt-first protocol (table output) ================= */
const ENGINE_SYS = `You are the Kognoz + Konverz GROWTH ENGINE — a conversational sales-intelligence partner for a lean, partner-led firm targeting $20M in 18 months across ${REGIONS}. You have web search: use it for anything current, and ALWAYS search before naming who holds a role today.
PRACTICES (Augmented Intelligence(TM)):
${PRAC_TXT}
TOWERS: T1 Org & Family Business (org, family, talent, culture) · T2 HR Transformation & Darwinbox incl. post-go-live AMS (hrtx, worktx) · T3 Konverz Hire (hire) · T4 Konverz Nurture/Learn (nurture, learncoach, skills).
DOCTRINE: warm path first (who could introduce?); two-beat play for new CHROs (congratulate first, substance at week 3-4); partner-sized asks (exchange of notes, 25 minutes, coffee — never "demo" except volume-hiring); 3-touch cap then rotate door; Saudi targets are worked from the UAE office.
ICP: ${ICP}
HOW TO ANSWER: like a sharp chief of staff in a chat — lead with the insight, then evidence, then what to do. Short paragraphs. Use the LIVE STATE below before searching; search to go deeper or verify. Name specific companies with numbers and dates. Plain language, no jargon, never "leverage/synergy/end-to-end/solution". When asked to draft a note, write it in the reply as plain text (subject + body, under 130 words, partner-sized ask).
STRUCTURED OUTPUT (mandatory): after the prose, on the last line, append exactly:
ENGINE_JSON: {"chart":<null or {"type":"bar"|"line","title":"<short>","data":[{"name":"<label>","value":<number>}]}>,"rows":[{"solution":"<short practice name from the list, e.g. Hire (JobFit AI)>","company":"<company>","contact_name":"<full name of the right buyer if known from LIVE STATE or your search, else empty>","contact_title":"<their title, else the target role e.g. CHRO>","country":"<country>","industry":"<industry>","trigger":"<one plain line: the dated fact + why it fits>","signal":"<signal id or empty>","value":<75000|300000|500000>,"url":"<source url or empty>"}]}
Rules: rows are the ACTION TABLE — one row per concrete company with a real trigger (max 8; empty array if the question isn't about companies). contact_name ONLY when you actually know it from LIVE STATE (verified people) or from a search result naming the person; otherwise leave empty and put the target role in contact_title. Chart only when a comparison genuinely helps (max 8 bars). Never include emails, phones, or personal details anywhere.`;

const compactTriggers = (targets) => targets.slice(0, 45).map((t) => `${t.name}|${t.country}|${t.industry}|${t.it.signal || "radar"}|${(t.it.evidence || t.it.headline || "").slice(0, 110)}|${t.it.date || ""}|${t.isClient ? "client" : t.isNew ? "new" : "watch"}`).join("\n");
const compactPipe = (pipe) => (pipe || []).filter((c) => !["Won","Lost"].includes(c.stage)).slice(0, 40).map((c) => `${c.account}|${c.stage}|${c.value || 0}|${c.partner || ""}|${c.next || ""}|${c.due || ""}|touches ${c.touches || 0}`).join("\n");
const compactPeople = (people) => (people || []).slice(0, 60).map((p) => `${p.name}|${p.role}|${p.company}|${p.src}`).join("\n");
function buildState({ targets, pipe, people, settings, activity, progMonth, pipelineV, closedV, target }) {
  const partners = TOWER_KEYS.map((t, i) => `${t}: ${(settings.partners || [])[i] || "unnamed"}`).join(", ");
  const meetings = (activity || []).filter((a) => a.type === "meeting").length;
  return `LIVE STATE (${todayStr()}):
PROGRAM: month ${progMonth}/18 · pipeline ${fmtM(pipelineV)} · closed ${fmtM(closedV)} vs pace ${fmtM(target)} · meetings logged ${meetings} · partners: ${partners}
TRIGGERS FOUND IN THE LAST 30 DAYS (account|country|industry|signal|evidence|date|relationship):
${compactTriggers(targets) || "none yet today"}
VERIFIED PEOPLE (name|title|company|source) — use these for contact_name when the company matches:
${compactPeople(people) || "none"}
PIPELINE (account|stage|value|partner|next|due):
${compactPipe(pipe) || "empty"}`;
}
const normRow = (r) => ({ solution: String(r.solution || r.practice || "TBD"), company: cleanName(r.company || r.account || ""), contact_name: String(r.contact_name || ""), contact_title: String(r.contact_title || ""),
  country: String(r.country || ""), industry: String(r.industry || ""), trigger: String(r.trigger || r.why || ""), signal: String(r.signal || ""), value: Number(r.value) || TIER_VALUE.core, url: String(r.url || "") });
async function callEngine(history, state) {
  const data = await apiCall({ model:"claude-sonnet-4-6", max_tokens:1000, system: ENGINE_SYS + "\n\n" + state, messages: history, tools:[{ type:"web_search_20250305", name:"web_search" }] });
  const searched = data.content.some((b) => b.type === "server_tool_use" || b.type === "web_search_tool_result");
  const raw = textOf(data).trim();
  let text = raw, chart = null, rows = [];
  const m = raw.match(/ENGINE_JSON:\s*(\{[\s\S]*\})\s*$/);
  if (m) {
    text = raw.slice(0, m.index).trim();
    try { const o = JSON.parse(m[1]); chart = o.chart && Array.isArray(o.chart.data) && o.chart.data.length ? o.chart : null; rows = (Array.isArray(o.rows) ? o.rows : Array.isArray(o.leads) ? o.leads : []).filter((r) => r && (r.company || r.account)).slice(0, 8).map(normRow); } catch { /* prose only */ }
  }
  return { text: text || "(no text returned)", chart, rows, searched };
}
const rowFromTarget = (t, people) => {
  const p = (people || []).find((x) => x.company === t.name);
  const rec = recommendFor({ country:t.country, engine:t.it.engine, segment:t.it.segment }, t.it.signal ? [t.it] : []);
  return normRow({ solution: rec.p.name, company: t.name, contact_name: p ? p.name : "", contact_title: p ? p.role : rec.p.buyer, country: t.country, industry: t.industry,
    trigger: `${whyNow(t.it)} — ${t.it.evidence || ""}`.slice(0, 170), signal: t.it.signal || "", value: TIER_VALUE.core, url: t.it.url || "" });
};
/* local intents — instant, no API call */
function localAnswer(q, { targets, pipe, people, dues, progMonth, pipelineV, closedV, target, activity }) {
  const s = q.toLowerCase().trim();
  const active = (pipe || []).filter((c) => !["Won","Lost"].includes(c.stage));
  if (/^(pipeline|pipeline health|how('s| is) (the |my )?pipeline)\??$/.test(s)) {
    const byStage = FLOW.map((st) => ({ name: statusWord(st), value: Math.round(active.filter((c) => c.stage === st).reduce((a, c) => a + (c.value || 0), 0) / 1000) }));
    const meetings = (activity || []).filter((a) => a.type === "meeting").length;
    return { text: `Month ${progMonth} of 18. Live pipeline ${fmtM(pipelineV)} across ${active.length} opportunities; closed ${fmtM(closedV)} against a pace of ${fmtM(target)} — ${closedV >= target ? "on the curve" : `behind by ${fmtM(target - closedV)}; the curve back-loads, so build now`}. ${meetings} meetings logged. ${dues.length ? `${dues.length} follow-up${dues.length > 1 ? "s" : ""} due today.` : "Nothing overdue."}`,
      chart: { type:"bar", title:"Pipeline by stage ($K)", data: byStage }, rows: [] };
  }
  if (/^(what('s| is) due|due today|follow[- ]?ups?)\??$/.test(s)) {
    return { text: dues.length ? `Due today:\n${dues.map((c) => `• **${c.account}** — ${c.next || "move it"} (${statusWord(c.stage)}, ${c.partner})`).join("\n")}` : "Nothing due today. Go hunting.", chart: null, rows: [] };
  }
  if (/^(who (should i|do i) open first|open first|top leads?|best leads?)( today)?\??$/.test(s)) {
    const top = targets.filter((t) => !t.inPipe).slice(0, 6);
    return { text: top.length ? "Ranked by trigger strength and freshness — these are the doors to open first today." : "No fresh triggers ranked yet — the sweep may still be running.", chart: null, rows: top.map((t) => rowFromTarget(t, people)) };
  }
  const geo = MARKETS.map(([id]) => id).filter((id) => id !== "All").find((id) => s.includes(id.toLowerCase()) || (id === "Saudi Arabia" && /saudi|ksa/.test(s)) || (id === "UAE" && /uae|dubai|emirates/.test(s)));
  if (geo && /^(what('s| is) (moving|happening|new)|show me|triggers?) /.test(s) && !/search|latest|news|deep|pattern/.test(s)) {
    const rowsT = targets.filter((t) => t.country === geo);
    if (rowsT.length === 0) return null;
    const byInd = {}; rowsT.forEach((r) => { byInd[r.industry] = (byInd[r.industry] || 0) + 1; });
    return { text: `${geo}: ${rowsT.length} live trigger${rowsT.length > 1 ? "s" : ""} in the last 30 days${MKT[geo] ? ` — ${MKT[geo].headline.toLowerCase()}` : ""}. Freshest first in the table. Ask "read the pattern in ${geo}" for a synthesized view with search.`,
      chart: { type:"bar", title:`${geo} — triggers by industry`, data: Object.entries(byInd).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })) }, rows: rowsT.slice(0, 8).map((t) => rowFromTarget(t, people)) };
  }
  return null;
}
function morningMessage(targets, cells, people) {
  const byGeo = Object.values(cells.geo).sort((a, b) => b.n - a.n).slice(0, 8).map((c) => ({ name: c.key, value: c.n }));
  const hot = targets.filter((t) => t.tier === 1 && t.age <= 14).length;
  const newN = targets.filter((t) => t.isNew).length;
  const top = targets.filter((t) => !t.inPipe).slice(0, 6);
  const text = targets.length
    ? `Morning. Overnight I swept 8 markets and 5 radars: **${targets.length} live triggers**, ${hot} fresh tier-1, ${newN} companies new to us. Here's where they landed, and the doors I'd open first — add any row to the pipeline or export the table to Zoho.`
    : `Morning. The sweep is running — triggers will land here as they're found. Meanwhile, ask anything: "what's moving in India", "best plays for Hire this week", or "pipeline".`;
  return { role:"engine", ts: Date.now(), text, chart: byGeo.length ? { type:"bar", title:"Live triggers by market", data: byGeo } : null, rows: top.map((t) => rowFromTarget(t, people)) };
}
/* Zoho export of an action table */
function rowsToZohoDealsCsv(rows) {
  const head = ["Deal Name","Account Name","Stage","Amount","Closing Date","Contact Name","Next Step","Description","Lead Source"].map(csvCell).join(",");
  const body = rows.map((r) => [`${r.company} — ${r.solution}`, r.company, "Qualification", r.value, addDays(90), r.contact_name || "", "Send the first note", `${r.trigger}${r.signal ? ` (signal ${r.signal})` : ""}${r.url ? ` · ${r.url}` : ""} · ${r.country} · ${r.industry}`, "Growth Engine"].map(csvCell).join(","));
  return [head, ...body].join("\n");
}
function rowsToZohoLeadsCsv(rows) {
  const head = ["First Name","Last Name","Designation","Company","Country","Industry","Lead Source","Description"].map(csvCell).join(",");
  const body = rows.filter((r) => r.contact_name).map((r) => { const parts = r.contact_name.trim().split(/\s+/); const last = parts.length > 1 ? parts.pop() : parts[0];
    return [parts.join(" "), last, r.contact_title, r.company, r.country, r.industry, "Growth Engine", `Solution: ${r.solution} · ${r.trigger}`].map(csvCell).join(","); });
  return [head, ...body].join("\n");
}

/* ================= STAGES (Prospect = Zoho Lead; the rest = Zoho Deal) ================= */
const STAGES = ["Prospect","Plan reach-out","Reached out","In conversation","Meeting set","Proposal","Won","Lost"];
const FLOW = ["Prospect","Plan reach-out","Reached out","In conversation","Meeting set","Proposal"];
const statusWord = (stage) => ({ "Prospect":"Prospect", "Plan reach-out":"Tagged", "Reached out":"Contacted", "In conversation":"Talking", "Meeting set":"Meeting", "Proposal":"Proposal", "Won":"Won", "Lost":"Closed" }[stage] || stage);
const ZOHO_STAGE = { "Prospect":"Qualification","Plan reach-out":"Qualification","Reached out":"Qualification","In conversation":"Needs Analysis","Meeting set":"Value Proposition","Proposal":"Proposal/Price Quote","Won":"Closed Won","Lost":"Closed Lost" };
const stageKind = (stage) => ({ "Prospect":"first-touch", "Plan reach-out":"first-touch", "Reached out":"follow-up", "In conversation":"value-add", "Meeting set":"meeting-confirm", "Proposal":"proposal-nudge" }[stage] || "value-add");
function dealsCsv(cards) {
  const head = ["Deal Name","Account Name","Stage","Amount","Closing Date","Contact Name","Next Step","Description","Lead Source"].map(csvCell).join(",");
  return [head, ...cards.map((c) => [`${c.account} — ${c.practice}`, c.account, ZOHO_STAGE[c.stage] || "Qualification", c.value || "", c.due || addDays(90), (c.contact || "").includes("(") ? c.contact.split(" (")[0] : "", c.next || "",
    `${c.evidence || ""}${c.signal ? ` (signal ${c.signal})` : ""}${c.url ? ` · ${c.url}` : ""} · ${c.country || ""} · ${c.industry || ""} · tower ${c.tower || ""} · partner ${c.partner || ""}`, "Growth Engine"].map(csvCell).join(","))].join("\n");
}
function leadsCsv(cards) {
  const head = ["First Name","Last Name","Designation","Company","Country","Industry","Lead Status","Lead Source","Description"].map(csvCell).join(",");
  return [head, ...cards.map((c) => { const nm = (c.contact || "").split(" (")[0].trim(); const title = ((c.contact || "").match(/\(([^)]*)\)/) || [])[1] || (c.contact && !c.contact.includes("(") ? c.contact : "");
    const parts = nm && c.contact.includes("(") ? nm.split(/\s+/) : []; const last = parts.length > 1 ? parts.pop() : (parts[0] || "Unknown");
    return [parts.join(" "), last, title, c.account, c.country || "", c.industry || "", "Not Contacted", "Growth Engine", `Solution: ${c.practice} · ${c.evidence || ""}${c.url ? ` · ${c.url}` : ""} · value ${c.value || ""} · tower ${c.tower || ""} · partner ${c.partner || ""}`].map(csvCell).join(","); })].join("\n");
}
/* pure: a table row → a pipeline card */
function makeCard(r, partner, stage) {
  const practice = String(r.solution || "TBD").split(" (")[0];
  const tw = towerOfPracticeName(practice);
  const value = Number(r.value) || TIER_VALUE.core;
  const tier = value >= 500000 ? "whale" : value >= 250000 ? "core" : "wedge";
  return { id: String(Date.now()) + Math.random().toString(16).slice(2), account: cleanName(r.company), practice, signal: r.signal || "", evidence: r.trigger || "", url: r.url || "",
    contact: r.contact_name ? `${r.contact_name} (${r.contact_title || ""})` : (r.contact_title || ""), country: r.country || "", industry: r.industry || "",
    stage: stage || "Prospect", next: stage && stage !== "Prospect" ? "Send the first note" : "Draft the first note", due: stage && stage !== "Prospect" ? addDays(2) : "",
    tower: tw, partner: partner(tw), tier, value, whale: tier === "whale", touches: 0, dispatchedAt: "", created: todayStr(), updatedAt: todayStr(), zohoSyncedAt: "" };
}

/* ================= UI ================= */
const N = { bg:"#FFFFFF", panel:"#F7F7F8", text:"#1A1A1A", muted:"#6B7280", faint:"#9CA3AF", line:"#E5E7EB", accent:"#1A1A1A", link:"#374151", ok:"#15803D", warn:"#B45309", bad:"#B91C1C", okBg:"#ECFDF3", warnBg:"#FFF7ED" };
const FONT = "Inter, -apple-system, 'Segoe UI', system-ui, sans-serif";
const TOWER_SHORT = { T1:"Org & Family", T2:"HR Tx & Darwinbox", T3:"Hire", T4:"Nurture / Learn" };
const Tag = ({ children, tone }) => (
  <span className="text-xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap" style={tone === "hot" ? { background:"#FEF2F2", color:N.bad } : tone === "warm" ? { background:N.warnBg, color:N.warn } : tone === "green" ? { background:N.okBg, color:N.ok } : { background:N.panel, color:N.muted, border:`1px solid ${N.line}` }}>{children}</span>
);
const Btn = ({ onClick, children, primary, tone, small, disabled, title }) => (
  <button title={title} onClick={onClick} disabled={disabled} className={(small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm") + " rounded-lg font-medium whitespace-nowrap"}
    style={disabled ? { background:N.panel, color:N.faint } : primary ? { background:N.accent, color:"#fff" } : tone === "danger" ? { background:"#FEF2F2", color:N.bad } : tone === "ok" ? { background:N.okBg, color:N.ok } : { background:"#fff", color:N.text, border:`1px solid ${N.line}` }}>{children}</button>
);
function Chart({ spec }) {
  if (!spec || !spec.data || !spec.data.length) return null;
  const data = spec.data.map((d) => ({ name: String(d.name).slice(0, 14), value: Number(d.value) || 0 }));
  return (
    <div className="mt-3 rounded-lg p-3" style={{ border:`1px solid ${N.line}` }}>
      <div className="text-xs font-medium mb-1" style={{ color:N.muted }}>{spec.title}</div>
      <div style={{ width:"100%", height: 160 }}><ResponsiveContainer>
        {spec.type === "line" ? <LineChart data={data} margin={{ top:6, right:8, left:-18, bottom:0 }}><XAxis dataKey="name" tick={{ fontSize:10, fill:N.muted }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize:10, fill:N.muted }} axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="value" stroke={N.text} strokeWidth={1.5} dot={{ r:2.5 }} /></LineChart>
        : <BarChart data={data} margin={{ top:6, right:8, left:-18, bottom:0 }}><XAxis dataKey="name" tick={{ fontSize:10, fill:N.muted }} interval={0} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize:10, fill:N.muted }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill:N.panel }} /><Bar dataKey="value" fill="#9CA3AF" radius={[4,4,0,0]} /></BarChart>}
      </ResponsiveContainer></div>
    </div>
  );
}

/* ================= APP ================= */
export default function App() {
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pipeOpen, setPipeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [people, setPeople] = useState(null);
  const [log, setLog] = useState(null);
  const [pipe, setPipe] = useState(null);
  const [settings, setSettings] = useState(null);
  const [extra, setExtra] = useState(null);
  const [me, setMe] = useState(null);
  const [activity, setActivity] = useState(null);
  const [intel, setIntel] = useState(null);
  const [dnc, setDnc] = useState([]);
  const [sweeping, setSweeping] = useState(false);
  const [toast, setToast] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const [lastAdded, setLastAdded] = useState(null);
  const endRef = useRef(null);
  const sweepStarted = useRef(false);
  const R = useRef({ pipe:[], extra:[], people:[], log:[], dnc:[], settings:null });
  R.current.pipe = pipe || R.current.pipe; R.current.extra = extra || R.current.extra; R.current.people = people || R.current.people; R.current.log = log || R.current.log; R.current.dnc = dnc || R.current.dnc; R.current.settings = settings || R.current.settings;
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2800); };
  const universe = [...SEED_U, ...((extra || []).filter((a) => !BENCHED.includes(a.country)))];
  const pushMsg = (m) => setThread((prev) => { const nx = [...prev, { ts: Date.now(), ...m }].slice(-80); sSet("kv-thread", nx); return nx; });

  useEffect(() => {
    (async () => {
      const p = await sGet("kv-stakeholders", null); const ppl = p === null ? SEED_PEOPLE : p; if (p === null) sSet("kv-stakeholders", SEED_PEOPLE); setPeople(ppl);
      const lg = await sGet("kv-signal-log", []); setLog(lg);
      const pp = await sGet("kv-pipeline", []); setPipe(pp); R.current.pipe = pp;
      const st = await sGet("kv-settings", {}); const stFull = { zohoBcc:"", sender:"", senderTitle:"", programStart:todayStr(), lastZohoSync:"", partners:["","","",""], ...st }; if (!st.programStart) sSet("kv-settings", stFull); setSettings(stFull);
      const ex = await sGet("kv-universe-extra", []); setExtra(ex);
      const meVal = await sGet("kv-me", { name:"" }, false); setMe(meVal);
      setActivity(await sGet("kv-activity", [], false));
      const dn = await sGet("kv-dnc", []); setDnc(dn);
      const th = await sGet("kv-thread", []); setThread(th);
      const iv = await sGet("kv-intel", null); setIntel(iv || { date:null, items:[], dismissed:[] });
      const lastMorning = [...th].reverse().find((m) => m.role === "engine" && m.morning);
      const todayPosted = lastMorning && new Date(lastMorning.ts).toISOString().slice(0, 10) === todayStr();
      const uni = [...SEED_U, ...ex.filter((a) => !BENCHED.includes(a.country))];
      if ((!iv || iv.date !== todayStr()) && !sweepStarted.current) {
        sweepStarted.current = true;
        if (th.length === 0) setThread([{ ts: Date.now(), role:"engine", text:"Welcome to the Growth Engine. I'm sweeping 8 markets and 5 radars now — the morning brief lands here when it's done. Meanwhile, ask about a market, a practice, a company, or the pipeline." }]);
        runFullSweep(iv, uni, meVal.radar || RADAR_DEFAULT, { pipe: pp, log: lg, people: ppl, dnc: dn });
      } else if (iv && !todayPosted) {
        const items = (iv.items || []).filter((it) => !(iv.dismissed || []).includes(itemKey(it)));
        const tg = enrichTargets({ items, universe: uni, pipe: pp, log: lg, people: ppl, dnc: dn });
        pushMsg({ ...morningMessage(tg, buildCells(tg, []), ppl), morning:true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [thread, busy]);

  async function absorbNewAccounts(items, uni, exNow) {
    const known = new Set(uni.map((a) => a.name.toLowerCase())); const fresh = [];
    items.forEach((it) => { if (!/^NEW:/.test(it.account)) return; const nm = cleanName(it.account); if (!nm || known.has(nm.toLowerCase()) || BENCHED.includes(it.country)) return; known.add(nm.toLowerCase());
      fresh.push({ name:nm, engine: it.engine === "Hire" ? "Hire" : "Learn", country: it.country || "India", segment: it.segment || "Auto-classified", anchor:"Radar find", status:"Auto-discovered", date: todayStr(), evidence: it.evidence || "" }); });
    if (fresh.length) { const nextEx = [...fresh, ...exNow]; R.current.extra = nextEx; setExtra(nextEx); sSet("kv-universe-extra", nextEx); return nextEx; }
    return exNow;
  }
  async function runFullSweep(prev, uniAtStart, radarList, ctx) {
    const dismissed = (prev && prev.dismissed) || []; let exNow = R.current.extra || []; let items = [];
    const sweeps = [...makeSweeps(uniAtStart), ...makeRadar(radarList || RADAR_DEFAULT, uniAtStart)];
    setSweeping(true);
    for (let i = 0; i < sweeps.length; i++) {
      try {
        const found = await runOneSweep(sweeps[i]);
        const seen = new Set(items.map(itemKey)); found.forEach((f) => { if (!seen.has(itemKey(f))) { items.push(f); seen.add(itemKey(f)); } });
        exNow = await absorbNewAccounts(found, [...SEED_U, ...exNow], exNow);
        const next = { date:todayStr(), sweptAt:new Date().toISOString(), items, dismissed }; setIntel(next); sSet("kv-intel", next).then((ok)=>!ok&&setStorageOk(false));
      } catch (e) { /* keep going */ }
    }
    setSweeping(false);
    const uniNow = [...SEED_U, ...exNow.filter((a) => !BENCHED.includes(a.country))];
    const tg = enrichTargets({ items, universe: uniNow, pipe: R.current.pipe, log: R.current.log, people: R.current.people, dnc: R.current.dnc });
    pushMsg({ ...morningMessage(tg, buildCells(tg, []), R.current.people), morning:true });
  }

  const savePipe = async (next) => { R.current.pipe = next; setPipe(next); const ok = await sSet("kv-pipeline", next); if (!ok) setStorageOk(false); };
  const saveSettings = async (next) => { R.current.settings = next; setSettings(next); await sSet("kv-settings", next); };
  const saveMe = async (next) => { setMe(next); await sSet("kv-me", next, false); };
  const saveDnc = async (next) => { R.current.dnc = next; setDnc(next); await sSet("kv-dnc", next); };
  const recordActivity = (type) => { const next = [{ type, date: todayStr() }, ...(activity || [])].slice(0, 900); setActivity(next); sSet("kv-activity", next, false); };
  const partnerOf = (tower) => { const st = R.current.settings || {}; const nm = st.partners && st.partners[TOWER_KEYS.indexOf(tower)]; return nm && nm.trim() ? nm.trim() : `${TOWER_SHORT[tower] || tower} partner`; };
  const countryOf = (name) => (universe.find((u) => u.name === name) || {}).country || "";

  /* ===== DIRECT ADD — one call, no forms ===== */
  const addRow = async (r, opts = {}) => {
    const account = cleanName(r.company);
    if (!account) return null;
    if (R.current.dnc.includes(account)) { flash(`${account} is on the do-not-contact list.`); return null; }
    const cur = R.current.pipe || [];
    const existing = cur.find((c) => c.account === account && !["Won","Lost"].includes(c.stage));
    if (existing) { if (!opts.quiet) flash(`${account} is already in the pipeline.`); return existing; }
    const card = makeCard(r, partnerOf, opts.stage);
    await savePipe([card, ...cur]);
    if (!universe.some((u) => u.name === account)) { const nextEx = [{ name:account, engine: /hire/i.test(card.practice) ? "Hire" : "Learn", country: card.country || "—", segment: card.industry || "Engine-tagged", anchor:"Engine", status:"Auto-discovered", date:todayStr(), evidence: card.evidence }, ...(R.current.extra || [])]; R.current.extra = nextEx; setExtra(nextEx); sSet("kv-universe-extra", nextEx); }
    if (r.contact_name && !(R.current.people || []).some((p) => p.name === r.contact_name && p.company === account)) { const nextP = [{ name: r.contact_name, role: r.contact_title || "", company: account, src:"Engine — verify", verified: todayStr() }, ...(R.current.people || [])]; R.current.people = nextP; setPeople(nextP); sSet("kv-stakeholders", nextP); }
    if (!SEED_U.some((u) => u.name === account)) recordActivity("newlogo");
    recordActivity("add");
    setLastAdded(card.id);
    if (!opts.quiet) flash(`Added ${account} — ${card.practice}, ${fmtK(card.value)} → ${card.partner}`);
    return card;
  };
  const addRows = async (rows) => { let n = 0; for (const r of rows || []) { const before = (R.current.pipe || []).length; const c = await addRow(r, { quiet:true }); if (c && (R.current.pipe || []).length > before) n++; } flash(`${n} added to the pipeline.`); };
  const dropCard = async (id) => { await savePipe((R.current.pipe || []).filter((c) => c.id !== id)); if (sel === id) setSel(null); };
  const updateCard = async (id, patch) => { await savePipe((R.current.pipe || []).map((x) => (x.id === id ? { ...x, ...patch, updatedAt: todayStr() } : x))); };

  /* ===== chat ===== */
  const parseAdd = (q) => {
    const m = q.match(/^add\s+(.+?)(?:\s+to\s+(?:the\s+)?pipeline)?(?:\s+(?:for|as|with)\s+(.+?))?(?:\s+(?:at|for|worth|value)\s+\$?\s*([\d.,]+)\s*([kKmM])?)?\s*\.?$/i);
    if (!m) return null;
    const company = m[1].replace(/\s+to\s+(?:the\s+)?pipeline$/i, "").trim();
    if (!company || /^(it|this|them|that)$/i.test(company)) return null;
    const term = (m[2] || "").toLowerCase();
    const keys = [["hire","hire"],["jobfit","hire"],["nurture","nurture"],["mobility","nurture"],["career","nurture"],["learn","learncoach"],["coach","learncoach"],["academy","learncoach"],["skill","skills"],["org","org"],["family","family"],["culture","culture"],["talent","talent"],["leadership","talent"],["succession","talent"],["darwinbox","hrtx"],["hr transformation","hrtx"],["hrtx","hrtx"],["ams","hrtx"],["human-ai","worktx"],["work transformation","worktx"]];
    const hit = keys.find(([k]) => term.includes(k));
    let value = m[3] ? Number(m[3].replace(/,/g, "")) : NaN;
    if (!isNaN(value)) { if (/k/i.test(m[4] || "")) value *= 1000; if (/m/i.test(m[4] || "")) value *= 1000000; if (!m[4] && value < 5000) value *= 1000; }
    return { company, practice: hit ? pracById[hit[1]] : null, value: isNaN(value) ? TIER_VALUE.core : Math.round(value) };
  };
  const sendPrompt = async (text) => {
    const q = (text || "").trim(); if (!q || busy) return;
    setInput(""); setSettingsOpen(false); setPipeOpen(false);
    pushMsg({ role:"user", text:q });
    const add = parseAdd(q);
    if (add) {
      const u = universe.find((x) => x.name.toLowerCase() === add.company.toLowerCase()); const name = u ? u.name : add.company;
      const rec = add.practice ? { p: add.practice } : recommendFor(u || { country:"", engine:"Learn", segment:"" }, []);
      const person = (people || []).find((p) => p.company === name);
      const row = normRow({ solution: rec.p.name, company: name, contact_name: person ? person.name : "", contact_title: person ? person.role : rec.p.buyer, country: u ? u.country : "", industry: u ? industryOf(u.segment) : "", trigger: "Added by operator", value: add.value });
      const card = await addRow(row, { stage:"Plan reach-out" });
      pushMsg({ role:"engine", text: card ? `Added **${name}** — ${rec.p.name}, ${fmtK(add.value)}, routed to ${card.partner}. It's in the pipeline as Tagged.` : `Couldn't add ${name}.`, rows: card ? [row] : [] });
      return;
    }
    const local = localAnswer(q, { targets, pipe, people, dues, progMonth, pipelineV, closedV, target, activity });
    if (local) { pushMsg({ role:"engine", ...local }); return; }
    setBusy(true);
    try {
      const hist = [...thread.filter((m) => (m.role === "user" || m.role === "engine") && !m.draft).slice(-10).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: (m.text || "").slice(0, 1500) })), { role:"user", content:q }];
      const r = await callEngine(hist, buildState({ targets, pipe, people, settings, activity, progMonth, pipelineV, closedV, target }));
      pushMsg({ role:"engine", text:r.text, chart:r.chart, rows:r.rows, searched:r.searched });
    } catch (e) { pushMsg({ role:"engine", text:"That didn't go through — try once more. (" + e.message + ")" }); }
    setBusy(false);
  };
  const draftFor = async (card, kind) => {
    setBusy(true); setPipeOpen(false); setSel(null);
    pushMsg({ role:"user", text:`Draft the ${kind === "congrats" ? "congratulation (beat 1)" : kind === "first-touch" ? "first note" : "next note"} for ${card.account}` });
    try {
      const person = (people || []).find((p) => p.company === card.account); const country = card.country || countryOf(card.account); const k = kind || stageKind(card.stage);
      const brief = `MAIL KIND: ${k}\nRecipient: ${person ? `${person.name}, ${person.role}` : (card.contact && card.contact.includes("(") ? card.contact.replace(" (", ", ").replace(")", "") : "the senior HR/talent leader (no name — address by role)")} at ${card.account}${country ? ` (${country})` : ""}.\nTrigger: ${card.evidence || card.practice + " conversation"}${card.signal ? ` (signal ${card.signal})` : ""}.\nPractice: ${card.practice}. Our thread: ${statusWord(card.stage)}. Touches so far: ${card.touches || 0}.\n${country === "Saudi Arabia" ? "Note: Saudi Arabia target — the sender writes from the UAE office." : ""}\nSender: ${settings.sender || "the partner"}, ${settings.senderTitle || (TOWERS[card.tower] ? TOWERS[card.tower].label + " partner" : "Partner")}.`;
      const d = await callMailWriter(brief);
      pushMsg({ role:"engine", text: k === "congrats" ? `Beat 1 for ${card.account} — a congratulation with zero ask. Beat 2 comes in three weeks.` : `${k.replace("-", " ")} for ${card.account}${person ? ` (to ${person.name})` : ""} — plain text, yours to edit.`, draft:{ ...d, cardId: card.id, kind: k } });
    } catch (e) { pushMsg({ role:"engine", text:"The draft didn't come through — try again." }); }
    setBusy(false);
  };
  const markSent = async (draft) => {
    const c = (R.current.pipe || []).find((x) => x.id === draft.cardId); if (!c) return;
    const touches = (c.touches || 0) + 1;
    await updateCard(c.id, { stage: ["Prospect","Plan reach-out"].includes(c.stage) ? "Reached out" : c.stage, next: draft.kind === "congrats" ? "Beat 2 — the substantive note" : "Nudge if quiet", due: addDays(draft.kind === "congrats" ? 21 : 5), touches });
    recordActivity("mail"); flash(touches >= 3 ? "3 touches on this door — rotate or park 90 days." : "Logged as sent — follow-up scheduled.");
  };
  const whatHappened = async (c, what) => {
    const patch = { replied:{ stage:"In conversation", next:"Send something useful", due:addDays(4), dispatchedAt:"" }, meeting:{ stage:"Meeting set", next:"Confirm and prep", due:addDays(1), dispatchedAt:"" }, quiet:{ next:"Gentle nudge or rotate door", due:addDays(0) }, proposal:{ stage:"Proposal", next:"De-risking nudge", due:addDays(4), dispatchedAt:"" }, park:{ next:"Parked — revisit", due:addDays(90) }, won:{ stage:"Won" }, dead:{ stage:"Lost" } }[what];
    if (!patch) return;
    if (what === "meeting") recordActivity("meeting"); if (what === "won") { recordActivity("won"); if (c.tier === "wedge") recordActivity("wedgewin"); }
    await updateCard(c.id, patch); flash(what === "won" ? "Logged as won." : "Updated.");
  };
  const setCardValue = async (c, v) => { const val = Math.max(0, Math.round(Number(v) || 0)); if ((c.value || 0) < 100000 && val >= 250000) recordActivity("wedgeconv"); await updateCard(c.id, { value: val, tier: val >= 500000 ? "whale" : val >= 250000 ? "core" : "wedge", whale: val >= 500000 || c.whale }); };
  const dispatchCard = async (c) => { const packet = buildPacket(c, { country: c.country || countryOf(c.account), door: c.contact || "" }); await updateCard(c.id, { dispatchedAt: todayStr(), ...(c.stage === "Prospect" ? { stage:"Plan reach-out", next:"Partner to open", due: addDays(3) } : {}) }); const ok = await copyText(packet); flash(ok ? `Packet copied — paste to ${c.partner}.` : "Copy failed."); };
  const pushZoho = () => {
    const all = R.current.pipe || [];
    const delta = all.filter((c) => !c.zohoSyncedAt || (c.updatedAt && c.updatedAt > c.zohoSyncedAt)); const set = delta.length ? delta : all;
    const leads = set.filter((c) => c.stage === "Prospect"); const deals = set.filter((c) => c.stage !== "Prospect");
    if (leads.length) download(`zoho-leads-${todayStr()}.csv`, leadsCsv(leads), "text/csv");
    if (deals.length) download(`zoho-deals-${todayStr()}.csv`, dealsCsv(deals), "text/csv");
    const now = todayStr(); savePipe(all.map((c) => ({ ...c, zohoSyncedAt: now }))); saveSettings({ ...(R.current.settings || {}), lastZohoSync: now });
    flash(`Zoho files ready: ${leads.length} lead${leads.length === 1 ? "" : "s"}, ${deals.length} deal${deals.length === 1 ? "" : "s"}.`);
  };
  const exportRows = (rows) => { download(`zoho-leads-table-${todayStr()}.csv`, leadsCsv(rows.map((r) => makeCard(r, partnerOf))), "text/csv"); flash("Zoho leads file downloaded."); };

  /* ===== computed ===== */
  const liveItems = intel ? (intel.items || []).filter((it) => !(intel.dismissed || []).includes(itemKey(it))) : [];
  const targets = enrichTargets({ items: liveItems, universe, pipe, log, people, dnc });
  const activeOpps = (pipe || []).filter((c) => !["Won","Lost"].includes(c.stage));
  const pipelineV = activeOpps.filter((c) => c.stage !== "Prospect").reduce((s, c) => s + (c.value || 0), 0);
  const closedV = (pipe || []).filter((c) => c.stage === "Won").reduce((s, c) => s + (c.value || 0), 0);
  const progMonth = settings ? monthOf(settings.programStart) : 1;
  const target = curveTarget(progMonth);
  const dues = activeOpps.filter((c) => c.due && c.due <= todayStr());
  const unsynced = (pipe || []).filter((c) => !c.zohoSyncedAt || (c.updatedAt && c.updatedAt > c.zohoSyncedAt)).length;

  const props = { thread, busy, input, setInput, sendPrompt, endRef, addRow, addRows, dropCard, exportRows, draftFor, markSent, pipe, people, settings, dues, targets, sweeping, flash, sel, setSel, whatHappened, setCardValue, updateCard, dispatchCard, pushZoho, unsynced, progMonth, pipelineV, closedV, target, activity, lastAdded, setPipeOpen };
  if (!settings || !pipe) return <div className="h-screen flex items-center justify-center text-sm" style={{ background:N.bg, color:N.muted, fontFamily:FONT }}>Starting the Growth Engine…</div>;
  return (
    <div className="h-screen flex flex-col" style={{ background:N.bg, fontFamily:FONT, color:N.text }}>
      <style>{`::selection{background:#E5E7EB} .fadein{animation:fi .2s ease} @keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .pulse{animation:pulse 1.6s ease-in-out infinite} @keyframes hl{0%{background:#ECFDF3}100%{background:#fff}} .hl{animation:hl 2s ease} textarea:focus,input:focus,select:focus{outline:none}`}</style>
      <div style={{ borderBottom:`1px solid ${N.line}` }}>
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="text-sm font-semibold">Growth Engine <span className="font-normal" style={{ color:N.faint }}>· Kognoz ▸ Konverz</span><span className="ml-3 text-xs font-medium" style={{ color: sweeping ? N.warn : N.ok }}>{sweeping ? "● scanning" : "● live"}</span></div>
          <div className="flex items-center gap-3 text-xs" style={{ color:N.muted }}>
            <span className="hidden sm:inline">M{progMonth}/18 · {fmtM(pipelineV)} open · {fmtM(closedV)} closed</span>
            {unsynced > 0 && <button onClick={pushZoho} className="font-medium px-2 py-0.5 rounded-md" style={{ background:N.warnBg, color:N.warn }}>Push {unsynced} to Zoho</button>}
            <button onClick={() => { setSettingsOpen(!settingsOpen); setPipeOpen(false); }} className="text-sm" style={{ color: settingsOpen ? N.text : N.faint }}>Settings</button>
          </div>
        </div>
      </div>
      {toast && <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 text-sm px-4 py-2 rounded-lg text-white fadein" style={{ background:N.text, maxWidth:"90vw" }}>{toast}</div>}
      {!storageOk && <div className="text-xs text-center py-1" style={{ background:N.warnBg, color:N.warn }}>Saving isn't available here — changes last only this session.</div>}
      <div className="flex-1 min-h-0 max-w-6xl mx-auto w-full md:grid md:grid-cols-[1fr_400px]">
        <div className="min-h-0 flex flex-col">
          {settingsOpen ? <div className="overflow-y-auto p-4"><SettingsPane settings={settings} saveSettings={saveSettings} me={me} saveMe={saveMe} dnc={dnc} saveDnc={saveDnc} flash={flash} pushZoho={pushZoho} onBack={() => setSettingsOpen(false)} /></div> : <Chat {...props} />}
        </div>
        <div className="hidden md:flex md:flex-col min-h-0 md:border-l" style={{ borderColor:N.line, background:N.panel }}><PipelineWindow {...props} /></div>
      </div>
      {/* mobile: always-visible pipeline bar + full window */}
      <div className="md:hidden" style={{ borderTop:`1px solid ${N.line}`, background:N.panel }}>
        <button onClick={() => setPipeOpen(true)} className="w-full px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="font-medium">Pipeline · {activeOpps.length}</span><span style={{ color:N.muted }}>{fmtM(pipelineV)} open{unsynced ? ` · ${unsynced} to push` : ""}</span><span style={{ color:N.faint }}>Open ▲</span>
        </button>
      </div>
      {pipeOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col fadein" style={{ background:N.panel }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom:`1px solid ${N.line}`, background:"#fff" }}><span className="text-sm font-semibold">Pipeline</span><button onClick={() => setPipeOpen(false)} className="text-sm" style={{ color:N.link }}>Close ▼</button></div>
          <PipelineWindow {...props} />
        </div>
      )}
    </div>
  );
}

/* ================= CHAT ================= */
function renderText(t) {
  return String(t || "").split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => /^\*\*[^*]+\*\*$/.test(p) ? <b key={j}>{p.slice(2, -2)}</b> : p);
    return <div key={i} className={line.trim() === "" ? "h-2" : ""}>{parts}</div>;
  });
}
function ActionTable({ rows, pipe, addRow, addRows, dropCard, exportRows, draftFor, sendPrompt, setPipeOpen }) {
  if (!rows || !rows.length) return null;
  const cardFor = (r) => (pipe || []).find((c) => c.account === cleanName(r.company) && !["Won","Lost"].includes(c.stage));
  const filed = rows.filter((r) => cardFor(r)).length;
  const th = "text-left text-xs font-medium py-2 pr-3 whitespace-nowrap";
  return (
    <div className="mt-3 rounded-lg overflow-hidden" style={{ border:`1px solid ${N.line}` }}>
      <div className="flex items-center justify-between px-3 py-2 gap-2 flex-wrap" style={{ background:N.panel, borderBottom:`1px solid ${N.line}` }}>
        <span className="text-xs font-medium" style={{ color:N.muted }}>{rows.length} recommended{filed ? ` · ${filed} in pipeline` : ""}</span>
        <div className="flex gap-1.5">{filed < rows.length && <Btn small primary onClick={() => addRows(rows)}>＋ Add all</Btn>}<Btn small onClick={() => exportRows(rows)}>Export to Zoho</Btn></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 700 }}>
          <thead><tr style={{ color:N.muted, borderBottom:`1px solid ${N.line}` }}><th className={th + " pl-3"}></th><th className={th}>Company</th><th className={th}>Solution</th><th className={th}>Contact</th><th className={th}>Trigger</th><th className={th + " pr-3"}>Value</th></tr></thead>
          <tbody>
            {rows.map((r, i) => { const card = cardFor(r); const isChro = ["L1","H5"].includes(r.signal);
              return (
                <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${N.line}` : "none" }}>
                  <td className="py-2 pl-3 pr-2 align-top whitespace-nowrap">
                    {!card ? <Btn small primary onClick={() => addRow(r)}>＋ Add</Btn>
                      : <span className="inline-flex items-center gap-1"><span className="text-xs font-medium" style={{ color:N.ok }}>✓</span><Btn small onClick={() => draftFor(card, isChro && !card.touches ? "congrats" : !card.touches ? "first-touch" : null)}>{isChro && !card.touches ? "Congratulate" : !card.touches ? "Draft" : "Next note"}</Btn></span>}
                  </td>
                  <td className="py-2 pr-3 align-top"><div className="font-medium">{r.company}</div><div className="text-xs" style={{ color:N.faint }}>{[r.country, r.industry].filter(Boolean).join(" · ")}{card ? ` · ${statusWord(card.stage)}` : ""}</div></td>
                  <td className="py-2 pr-3 align-top whitespace-nowrap">{r.solution}</td>
                  <td className="py-2 pr-3 align-top">{r.contact_name ? <><div>{r.contact_name}</div><div className="text-xs" style={{ color:N.faint }}>{r.contact_title}</div></> : <div className="text-xs" style={{ color:N.faint }}>{r.contact_title || "to identify"} · <button onClick={() => sendPrompt(`Who currently holds the ${r.contact_title || "CHRO"} role at ${r.company}${r.country ? ` (${r.country})` : ""}? Search the latest. Name, title, date, source only.`)} className="underline" style={{ color:N.link }}>find</button></div>}</td>
                  <td className="py-2 pr-3 align-top text-xs" style={{ color:N.muted, minWidth: 200 }}>{r.trigger}{r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="ml-1 underline" style={{ color:N.link }}>source</a>}</td>
                  <td className="py-2 pr-3 align-top whitespace-nowrap">{fmtK(r.value)}</td>
                </tr>
              ); })}
          </tbody>
        </table>
      </div>
      {filed > 0 && <div className="md:hidden px-3 py-2 text-xs" style={{ background:N.panel, borderTop:`1px solid ${N.line}` }}><button onClick={() => setPipeOpen(true)} className="underline" style={{ color:N.link }}>Open the pipeline ▲</button></div>}
    </div>
  );
}
function DraftCard({ draft, markSent, settings, flash }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [sent, setSent] = useState(false);
  const bcc = settings.zohoBcc ? `&bcc=${encodeURIComponent(settings.zohoBcc)}` : "";
  const href = `mailto:?subject=${encodeURIComponent(subject)}${bcc}&body=${encodeURIComponent(body)}`;
  return (
    <div className="rounded-lg p-3 mt-2" style={{ border:`1px solid ${N.line}` }}>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md px-2.5 py-1.5 text-sm font-medium mb-2" style={{ border:`1px solid ${N.line}` }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className="w-full rounded-md px-2.5 py-1.5 text-sm" style={{ border:`1px solid ${N.line}`, lineHeight:1.6 }} />
      <div className="mt-2 flex gap-1.5 flex-wrap items-center">
        <a href={href} onClick={() => { if (!sent) { markSent(draft); setSent(true); } }} className="px-3.5 py-2 rounded-lg text-sm font-medium text-white" style={{ background:N.accent }}>Open in mail{settings.zohoBcc ? " · BCC Zoho" : ""}</a>
        <Btn onClick={async () => { (await copyText(`Subject: ${subject}\n\n${body}`)) && flash("Copied."); if (!sent) { markSent(draft); setSent(true); } }}>Copy</Btn>
        {sent && <span className="text-xs" style={{ color:N.ok }}>Logged as sent</span>}
      </div>
    </div>
  );
}
function Chat({ thread, busy, input, setInput, sendPrompt, endRef, addRow, addRows, dropCard, exportRows, draftFor, markSent, pipe, settings, dues, targets, sweeping, flash, setPipeOpen }) {
  const geos = Object.entries(targets.reduce((m, t) => { m[t.country] = (m[t.country] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  const chips = [...(dues.length ? ["What's due today?"] : []), "Who should I open first?", ...geos.map((g) => `What's moving in ${g}?`), "Best plays for Konverz Hire this week", "Darwinbox go-lives 6-18 months back — AMS windows", "Family businesses with succession moves this month", "Pipeline"].slice(0, 7);
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-5 pb-2 space-y-6">
        {thread.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end fadein"><div className="rounded-2xl px-4 py-2.5 text-sm" style={{ background:N.panel, maxWidth:"80%" }}>{m.text}</div></div>
        ) : (
          <div key={i} className="fadein max-w-3xl">
            {m.searched && <div className="text-xs mb-1" style={{ color:N.faint }}>Searched the web</div>}
            <div className="text-sm leading-relaxed">{renderText(m.text)}</div>
            {m.chart && <Chart spec={m.chart} />}
            {m.rows && <ActionTable rows={m.rows} pipe={pipe} addRow={addRow} addRows={addRows} dropCard={dropCard} exportRows={exportRows} draftFor={draftFor} sendPrompt={sendPrompt} setPipeOpen={setPipeOpen} />}
            {m.draft && <DraftCard draft={m.draft} markSent={markSent} settings={settings} flash={flash} />}
          </div>
        ))}
        {busy && <div className="text-sm pulse" style={{ color:N.muted }}>Thinking…</div>}
        <div ref={endRef} />
      </div>
      <div className="px-4 md:px-8 pb-3 pt-1">
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">{chips.map((c) => <button key={c} onClick={() => sendPrompt(c)} className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap" style={{ border:`1px solid ${N.line}`, color:N.muted, background:"#fff" }}>{c}</button>)}</div>
        <div className="flex gap-2 items-end rounded-2xl p-2" style={{ border:`1px solid ${N.line}`, boxShadow:"0 1px 8px rgba(0,0,0,0.05)" }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(input); } }} rows={1}
            placeholder={sweeping ? "Sweeping the markets… ask anything meanwhile" : "Ask about a market, a practice, a company — or type: add Emaar for Hire at 300K"}
            className="flex-1 resize-none px-2 py-2 text-sm" style={{ background:"transparent", minHeight:36, maxHeight:140 }} />
          <button onClick={() => sendPrompt(input)} disabled={busy || !input.trim()} className="w-9 h-9 rounded-lg text-sm font-medium text-white flex items-center justify-center" style={{ background: busy || !input.trim() ? N.line : N.accent }}>↑</button>
        </div>
      </div>
    </>
  );
}

/* ================= PIPELINE WINDOW ================= */
const GROUPS = [["Prospects", ["Prospect"]], ["Working", ["Plan reach-out","Reached out","In conversation"]], ["Meetings & proposals", ["Meeting set","Proposal"]], ["Won", ["Won"]]];
function PipelineWindow({ pipe, sel, setSel, draftFor, whatHappened, setCardValue, updateCard, dispatchCard, dropCard, pushZoho, unsynced, pipelineV, closedV, target, activity, sendPrompt, settings, lastAdded }) {
  const meetings = (activity || []).filter((a) => a.type === "meeting").length;
  const live = (pipe || []).filter((c) => c.stage !== "Lost");
  const synced = (x) => x.zohoSyncedAt && !(x.updatedAt > x.zohoSyncedAt);
  const dw = (x) => Math.floor(ageDays(x.dispatchedAt));
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 pt-3 pb-2" style={{ borderBottom:`1px solid ${N.line}`, background:"#fff" }}>
        <div className="flex items-center justify-between"><div className="text-sm font-semibold">Pipeline <span className="font-normal" style={{ color:N.faint }}>· {live.filter((c) => c.stage !== "Won").length} live</span></div>
          <Btn small primary={unsynced > 0} onClick={pushZoho}>{unsynced ? `Push ${unsynced} to Zoho` : "Zoho synced"}</Btn></div>
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {[[fmtM(pipelineV), "open (deals)"],[fmtM(closedV), `closed · pace ${fmtM(target)}`],[meetings, "meetings"]].map(([v, l], i) => <div key={i} className="rounded-md py-1.5 text-center" style={{ background:N.panel, border:`1px solid ${N.line}` }}><div className="text-sm font-semibold">{v}</div><div className="text-xs" style={{ color:N.muted }}>{l}</div></div>)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {live.length === 0 && <p className="text-sm p-2" style={{ color:N.muted }}>Empty. Press <b>＋ Add</b> on any row in the chat — it lands here instantly.</p>}
        {GROUPS.map(([label, stages]) => {
          const rows = live.filter((c) => stages.includes(c.stage)).sort((a, b) => ((a.due || "9") <= todayStr() ? 0 : 1) - ((b.due || "9") <= todayStr() ? 0 : 1) || (b.created || "").localeCompare(a.created || ""));
          if (!rows.length) return null;
          const sum = rows.reduce((s, c) => s + (c.value || 0), 0);
          return (
            <div key={label}>
              <div className="flex items-center justify-between px-1 mb-1.5"><span className="text-xs font-semibold" style={{ color:N.muted }}>{label.toUpperCase()} · {rows.length}</span><span className="text-xs" style={{ color:N.faint }}>{fmtM(sum)}</span></div>
              <div className="space-y-1.5">
                {rows.map((x) => (
                  <div key={x.id} className={"rounded-lg " + (x.id === lastAdded ? "hl" : "")} style={{ background:"#fff", border:`1px solid ${sel === x.id ? N.text : N.line}` }}>
                    <button onClick={() => setSel(sel === x.id ? null : x.id)} className="w-full text-left px-3 py-2">
                      <div className="flex items-center gap-2"><span className="text-sm font-medium flex-1 truncate">{x.account}</span>{x.whale && <span className="text-xs" style={{ color:N.muted }}>whale</span>}<span className="text-sm font-medium">{fmtK(x.value || 0)}</span></div>
                      <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color:N.muted }}><span className="truncate">{x.practice}</span><span>·</span><span className="truncate">{x.partner}</span>{x.contact && <><span>·</span><span className="truncate">{x.contact.split(" (")[0]}</span></>}
                        {x.dispatchedAt && <Tag tone={dw(x) > 3 ? "hot" : "warm"}>with partner {dw(x)}d</Tag>}<span className="ml-auto" style={{ color: synced(x) ? N.ok : N.warn }}>{synced(x) ? "Zoho ✓" : "Zoho ·"}</span></div>
                      {x.next && <div className="text-xs mt-0.5" style={{ color: x.due && x.due <= todayStr() ? N.bad : N.faint }}>{statusWord(x.stage)} · {x.next}{x.due ? (x.due <= todayStr() ? " · due now" : ` · by ${x.due}`) : ""}</div>}
                    </button>
                    {sel === x.id && (
                      <div className="px-3 pb-3 fadein" style={{ borderTop:`1px solid ${N.line}` }}>
                        <div className="mt-2 flex gap-1.5 flex-wrap">
                          <Btn small primary onClick={() => draftFor(x, (x.touches || 0) === 0 ? (["L1","H5"].includes(x.signal) ? "congrats" : "first-touch") : null)}>{(x.touches || 0) === 0 ? "Draft first note" : "Draft next note"}</Btn>
                          <Btn small onClick={() => dispatchCard(x)}>Packet → {x.partner}</Btn>
                          <Btn small onClick={() => sendPrompt(`Prep me for ${x.account}: latest news, our angle (${x.practice}), who we should be talking to (names and titles only), and three questions to open with.`)}>Prep me</Btn>
                          <Btn small tone="danger" onClick={() => dropCard(x.id)}>Remove</Btn>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-1">
                          {[["replied","Replied"],["meeting","Meeting"],["quiet","Quiet"],["proposal","Proposal"],["park","Park 90d"],["won","Won"],["dead","Dead"]].map(([k, l]) => <button key={k} onClick={() => whatHappened(x, k)} className="py-1.5 rounded-md text-xs" style={{ background:N.panel, color:N.text, border:`1px solid ${N.line}` }}>{l}</button>)}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs flex-wrap" style={{ color:N.muted }}>
                          <span>Value $</span><input defaultValue={x.value || 0} key={x.id + (x.value || 0)} inputMode="numeric" onBlur={(e) => { const v = Number(String(e.target.value).replace(/[^0-9]/g, "")); if (v !== x.value) setCardValue(x, v); }} className="w-24 rounded-md px-2 py-1 text-xs" style={{ border:`1px solid ${N.line}` }} />
                          <select value={x.stage} onChange={(e) => updateCard(x.id, { stage: e.target.value })} className="rounded-md px-2 py-1 text-xs" style={{ border:`1px solid ${N.line}`, background:"#fff" }}>{STAGES.map((s) => <option key={s} value={s}>{statusWord(s)}</option>)}</select>
                          <select value={x.practice} onChange={(e) => { const tw = towerOfPracticeName(e.target.value); updateCard(x.id, { practice: e.target.value, tower: tw }); }} className="rounded-md px-2 py-1 text-xs" style={{ border:`1px solid ${N.line}`, background:"#fff" }}>{PRACTICES.map((p) => <option key={p.id} value={p.name.split(" (")[0]}>{p.name}</option>)}</select>
                          <button onClick={() => updateCard(x.id, { whale: !x.whale, tier: !x.whale ? "whale" : x.tier, value: !x.whale && (x.value || 0) < 500000 ? 500000 : x.value })} className="underline" style={{ color:N.link }}>{x.whale ? "unmark whale" : "mark whale"}</button>
                        </div>
                        {x.evidence && <p className="text-xs mt-2" style={{ color:N.faint }}>{x.evidence}{x.url && <a href={x.url} target="_blank" rel="noopener noreferrer" className="ml-1 underline" style={{ color:N.link }}>source</a>}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= SETTINGS ================= */
const Sec = ({ t, children }) => <div className="rounded-lg p-4" style={{ border:`1px solid ${N.line}` }}><div className="text-xs font-medium mb-2" style={{ color:N.muted }}>{t}</div>{children}</div>;
function SettingsPane({ settings, saveSettings, me, saveMe, dnc, saveDnc, flash, pushZoho, onBack }) {
  const [dncInput, setDncInput] = useState("");
  const inp = (v, set, ph, type = "text") => <input type={type} value={v || ""} onChange={(e) => set(e.target.value)} placeholder={ph} className="w-full rounded-md px-3 py-2 text-sm mb-2" style={{ border:`1px solid ${N.line}` }} />;
  return (
    <div className="space-y-3 fadein max-w-xl">
      <button onClick={onBack} className="text-sm underline" style={{ color:N.link }}>Back to chat</button>
      <Sec t="Partners — one per tower">{TOWER_KEYS.map((t, i) => <div key={t}><div className="text-xs mb-0.5" style={{ color:N.faint }}>{TOWERS[t].label} · {fmtM(TOWERS[t].target)} target</div>{inp((settings.partners || [])[i], (v) => { const ps = [...(settings.partners || ["","","",""])]; ps[i] = v; saveSettings({ ...settings, partners: ps }); }, "Partner name")}</div>)}</Sec>
      <Sec t="Operator & signature">{inp(me && me.name, (v) => saveMe({ ...me, name: v }), "Your name")}{inp(settings.sender, (v) => saveSettings({ ...settings, sender: v }), "Default sender name on drafts")}{inp(settings.senderTitle, (v) => saveSettings({ ...settings, senderTitle: v }), "Title (e.g. Partner, Kognoz)")}</Sec>
      <Sec t="Zoho — system of record">{inp(settings.zohoBcc, (v) => saveSettings({ ...settings, zohoBcc: v }), "Zoho BCC dropbox address")}
        <p className="text-xs mb-2" style={{ color:N.faint }}>Every "Open in mail" BCCs this address so activity logs itself. "Push to Zoho" writes two import files — Leads (prospects) and Deals (everything past prospect) — and marks cards synced. Last push: {settings.lastZohoSync || "never"}. A live two-way API needs a backend — first Phase 2 item.</p>
        <Btn primary onClick={pushZoho}>Push changes to Zoho now</Btn></Sec>
      <Sec t="Market radar — daily"><div className="flex flex-wrap gap-1.5">{MARKETS.filter(([id]) => id !== "All").map(([id, label]) => { const cur = (me && me.radar) || RADAR_DEFAULT; const s = cur.includes(id);
        return <button key={id} onClick={() => { const next = s ? cur.filter((x) => x !== id) : [...cur, id]; if (next.length) saveMe({ ...me, radar: next }); }} className="px-3 py-1 rounded-md text-xs" style={s ? { background:N.text, color:"#fff" } : { background:"#fff", border:`1px solid ${N.line}`, color:N.muted }}>{label}</button>; })}</div><p className="text-xs mt-2" style={{ color:N.faint }}>Applies from tomorrow's sweep.</p></Sec>
      <Sec t="Program clock">{inp(settings.programStart, (v) => saveSettings({ ...settings, programStart: v }), "", "date")}<p className="text-xs" style={{ color:N.faint }}>The 18-month curve starts here.</p></Sec>
      <Sec t="Do-not-contact"><div className="flex gap-2 mb-2"><input value={dncInput} onChange={(e) => setDncInput(e.target.value)} placeholder="Exact company or person name" className="flex-1 rounded-md px-3 py-2 text-sm" style={{ border:`1px solid ${N.line}` }} /><Btn onClick={() => { if (dncInput.trim()) { saveDnc([...dnc, dncInput.trim()]); setDncInput(""); flash("Added."); } }}>Add</Btn></div>
        {dnc.map((n, i) => <div key={i} className="flex items-center gap-2 text-sm py-0.5"><span className="flex-1">{n}</span><button onClick={() => saveDnc(dnc.filter((_, j) => j !== i))} className="text-xs underline" style={{ color:N.link }}>remove</button></div>)}{dnc.length === 0 && <p className="text-xs" style={{ color:N.faint }}>Empty.</p>}</Sec>
    </div>
  );
}
