const packs = {
  "Highways": {
    weights: { capability:0.4, relationships:0.25, differentiators:0.2, compliance:0.15 },
    defaultRecruitment: [
      { title:"Senior Project Manager – Highways", skills:["Programme delivery","Stakeholder mgmt","NEC"] },
      { title:"Cost Manager (QS) – Civils",       skills:["Estimating","Benchmarking","Change control"] },
      { title:"Project Controls Lead",            skills:["Schedule","Risk","Reporting"] }
    ],
    winAngles: [
      "Lead with cost certainty through robust estimating, benchmarking and change control.",
      "Demonstrate programme assurance across multi-lot portfolios with clear governance.",
      "Evidence delivery in live operational environments with strong interface management.",
      "Core services: Cost Management, Project Management, Project Controls, Programme Advisory."
    ]
  },
  "Rail": {
    weights: { capability:0.4, relationships:0.25, differentiators:0.2, compliance:0.15 },
    defaultRecruitment: [
      { title:"Commercial Manager – Rail", skills:["Rail lifecycle","Supply chain","NEC4"] },
      { title:"Project Controls Manager – Rail", skills:["Schedule","Risk","Cost integration"] }
    ],
    winAngles: [
      "Whole-life value through rigorous commercial governance.",
      "Programme advisory aligned to control periods with proven controls integration.",
      "Core services: Cost Management, Project Management, Project Controls, Programme Advisory."
    ]
  },
  "Utilities": {
    weights: { capability:0.4, relationships:0.25, differentiators:0.2, compliance:0.15 },
    defaultRecruitment: [
      { title:"Cost Manager – Water/Utilities", skills:["AMP cycles","Cost audit","Framework mgmt"] },
      { title:"Programme Controls Lead", skills:["Portfolio reporting","Risk","Change"] }
    ],
    winAngles: [
      "Embed cost management discipline across AMP portfolios.",
      "Portfolio-level reporting to improve investment decisions.",
      "Core services: Cost Management, Project Management, Project Controls, Programme Advisory."
    ]
  },
  "Aviation": {
    weights: { capability:0.4, relationships:0.25, differentiators:0.2, compliance:0.15 },
    defaultRecruitment: [
      { title:"Senior PM – Airfield/Critical Infrastructure", skills:["Operational interfaces","Night works","Stakeholders"] },
      { title:"Senior QS – Aviation", skills:["Cost planning","Estimating","Change control"] }
    ],
    winAngles: [
      "Cost control in live operational environments.",
      "Programme readiness and schedule protection for airside projects.",
      "Core services: Cost Management, Project Management, Project Controls, Programme Advisory."
    ]
  },
  "Maritime & Ports": {
    weights: { capability:0.4, relationships:0.25, differentiators:0.2, compliance:0.15 },
    defaultRecruitment: [
      { title:"QS – Marine Civils", skills:["Dredging","Piling","Contract admin"] },
      { title:"PM – Maritime", skills:["Interface mgmt","H&S","Stakeholders"] }
    ],
    winAngles: [
      "Cost certainty on marine works via accurate estimating and change management.",
      "Programme advisory across tidal windows and weather risks.",
      "Core services: Cost Management, Project Management, Project Controls, Programme Advisory."
    ]
  }
};

const clamp = (n, lo=0, hi=100)=> Math.max(lo, Math.min(hi, n));
const scoreCapability = a => Math.min(100, ((+a.qs_count||0)+(+a.pm_count||0)+(+a.pc_count||0)+(+a.pmo_count||0))*15 + ((a.case_studies||"").trim().length>10?20:0));
const scoreRelationships = a => clamp((a.client_rel?55:0) + (a.incumbent_rel?35:0) + ((a.warm_intros||"").trim()?10:0));
const scoreDifferentiators = a => clamp((Array.isArray(a.diffs)?a.diffs.length:0)*15 + ((a.risks||"").trim()?10:0));
const scoreCompliance = a => clamp((a.local_commit?40:0) + (a.governance?40:0) + (a.bid_setup==="Ready"?20:0));
const readiness = (w,a)=> Math.round(scoreCapability(a)*w.capability + scoreRelationships(a)*w.relationships + scoreDifferentiators(a)*w.differentiators + scoreCompliance(a)*w.compliance);

function buildGaps(pack,a){
  const gaps=[];
  if ((+a.qs_count||0)<1) gaps.push("Add Senior Cost Manager (QS) with recent sector experience.");
  if ((+a.pc_count||0)<1) gaps.push("Add Project Controls Lead to strengthen schedule/risk integration.");
  if ((+a.pm_count||0)<1) gaps.push("Add Senior Project Manager with stakeholder/interface track record.");
  if (!(a.case_studies||"").trim()) gaps.push("Add 2–3 recent case studies aligned to scope and outcomes.");
  if (!a.client_rel) gaps.push("Create a client engagement plan and secure warm introductions.");
  if (a.approach==="Partner" && !(a.partners||"").trim()) gaps.push("Identify and secure a Tier 1 partner (MOU) aligned to the lot.");
  if (!a.local_commit) gaps.push("Define tangible local/social value commitments by region.");
  if (!a.governance) gaps.push("Confirm NEC/reporting governance and assurance processes.");
  if (a.bid_setup!=="Ready") gaps.push("Stand up a bid core team (lead, reviewers, graphics) and timeline.");
  return gaps;
}
function buildRecruitment(pack,a){ const rec=[...pack.defaultRecruitment]; return (+a.qs_count||0)>=1 ? rec.filter(r=>r.title!=="Cost Manager (QS) – Civils") : rec; }
function buildChecklist(a){
  const list=[
    "Confirm bid core team (lead, SMEs, reviewers, graphics) and timeline.",
    "Secure partner MOU (if Partner approach) and align scope/roles.",
    "Gather and tailor 3 sector-relevant case studies with measurable outcomes.",
    "Prepare cost management approach (benchmarking, estimating, change control).",
    "Prepare project controls approach (schedule health, risk management, reporting cadence).",
    "Define social value plan tied to the framework’s regions and objectives.",
    "Create client engagement plan and book meetings with key contacts.",
    "Draft response structure aligned to evaluation criteria and weightings.",
    "Set up compliance checks (NEC, policies, insurances, accreditations).",
    "Book a Red Team review and presentation rehearsal dates."
  ];
  if (a.approach==="Prime") list.unshift("Confirm prime responsibilities and resourcing plan.");
  if (a.approach==="Partner") list.unshift("Agree division of responsibilities with prime and interface protocol.");
  return list;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { frameworkId, sector, answers } = JSON.parse(event.body || "{}");
  const pack = packs[sector];
  if (!pack) return { statusCode: 400, body: JSON.stringify({ error: "Unsupported sector" }) };

  const score = readiness(pack.weights, answers||{});
  return {
    statusCode: 200,
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      frameworkId, sector,
      readinessScore: score,
      summary: score>=75 ? "Strong fit; proceed to bid with minor actions."
             : score>=55 ? "Promising; address gaps before committing to bid."
             : "Weak readiness; develop capability/partners before bidding.",
      gaps: buildGaps(pack, answers||{}),
      recruitment: buildRecruitment(pack, answers||{}),
      winStrategy: pack.winAngles,
      checklist: buildChecklist(answers||{})
    })
  };
};
