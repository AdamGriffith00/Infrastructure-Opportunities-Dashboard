// Frameworks (Compact List) + Yellow Star + Starred Count + Drawer + Stepper Wizard
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("frameworks-root");
  if (!root) return;

  // ---------- Shell ----------
  root.innerHTML = `
    <div class="fw-controls">
      <input id="fw-search" class="fw-input" placeholder="Search frameworks, clients…"/>
      <select id="fw-sector" class="fw-input">
        <option>All</option><option>Aviation</option><option>Utilities</option>
        <option>Maritime & Ports</option><option>Highways</option><option>Rail</option>
      </select>

      <label class="fw-check"><input type="checkbox" id="fw-starred-only"/> Show starred only</label>
      <span class="fw-star-count" id="fw-star-count">⭐ 0</span>

      <span class="fw-time">Last refreshed: <span id="fw-lastref">—</span></span>
    </div>

    <div id="fw-error" class="muted" style="margin:6px 0 12px;color:#b00020;display:none"></div>

    <div class="fw-table-wrap">
      <table class="fw-table">
        <thead>
          <tr>
            <th>Framework</th>
            <th>Region</th>
            <th>Value</th>
            <th>Award Date</th>
            <th>Analyse</th>
          </tr>
        </thead>
        <tbody id="fw-tbody"></tbody>
      </table>
    </div>

    <!-- Drawer -->
    <div id="fw-drawer" class="fw-drawer" hidden>
      <div class="fw-drawer-backdrop"></div>
      <aside class="fw-drawer-panel" role="dialog" aria-modal="true">
        <div class="fw-modal-head">
          <div>
            <div class="fw-kicker">Framework Detail</div>
            <h3 id="dw-title"></h3>
            <div class="muted" id="dw-sub"></div>
          </div>
          <button id="dw-close" class="btn-secondary">Close</button>
        </div>
        <div id="dw-body" style="padding:14px 16px; overflow:auto"></div>
      </aside>
    </div>

    <!-- Wizard -->
    <div class="fw-modal" id="fw-modal" aria-hidden="true" hidden>
      <div class="fw-modal-card">
        <div class="fw-modal-head">
          <div><div class="fw-kicker" id="wiz-kicker">Bid Analyser</div><h3 id="wiz-title"></h3></div>
          <button id="wiz-close" class="btn-secondary">Close</button>
        </div>
        <div class="stepper-wrap"><div id="wiz-stepper" class="stepper"></div></div>
        <div id="wiz-steps"></div>
        <div id="wiz-results" hidden></div>
        <div class="fw-modal-foot">
          <div class="fw-progress" id="wiz-progress"></div>
          <div>
            <button id="wiz-back" class="btn-secondary" hidden>Back</button>
            <button id="wiz-next" class="btn">Next</button>
            <button id="wiz-generate" class="btn" hidden>Generate Assessment</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const tbody = $("fw-tbody");
  const search = $("fw-search");
  const sectorSel = $("fw-sector");
  const starredOnly = $("fw-starred-only");
  const starCount = $("fw-star-count");
  const errorBox = $("fw-error");
  const lastRef = $("fw-lastref");

  // ---------- Stars ----------
  const STAR_KEY = "fw_starred";
  function getStarMap(){ try { return JSON.parse(localStorage.getItem(STAR_KEY) || "{}"); } catch { return {}; } }
  function setStarMap(map){ localStorage.setItem(STAR_KEY, JSON.stringify(map)); }
  function isStarred(id){ return !!getStarMap()[id]; }
  function updateStarBadge(allRows){
    const map = getStarMap();
    const ids = new Set((allRows || []).map(r=>r.id));
    let count = 0;
    for (const k of Object.keys(map)){ if (ids.has(k)) count++; }
    starCount.textContent = `⭐ ${count}`;
  }

  // ---------- Drawer ----------
  const drawerEl = $("fw-drawer");
  const dwTitle = $("dw-title");
  const dwSub = $("dw-sub");
  const dwBody = $("dw-body");
  $("dw-close").onclick = () => closeDrawer();
  drawerEl.addEventListener("click", (e)=>{ if (e.target.classList.contains("fw-drawer-backdrop")) closeDrawer(); });

  function openDrawer(fr){
    const moneyText = (v) => v?.amount ? `£${Number(v.amount).toLocaleString()}${v.is_estimate?" (est.)":""}` : (v?.note||"—");
    const fmt = (d) => d ? new Date((d.length>10?d:d+"T00:00:00Z")).toLocaleDateString() : "—";

    dwTitle.textContent = fr.name || "Framework";
    dwSub.textContent = `${fr.client || "Client"} · ${fr.sector || ""} · ${fr.region || ""} · Budget: ${moneyText(fr.value)}`;
    dwBody.innerHTML = `
      <div class="fw-row">
        <div class="fw-section fw-card"><div class="fw-card-body">
          <h4>Gleeds Positioning</h4>
          <div class="muted">Role: <strong>${fr.position?.role || "Monitor"}</strong> — ${fr.position?.rationale || ""}</div>
        </div></div>
        <div class="fw-section fw-card"><div class="fw-card-body">
          <h4>Why partner?</h4>
          <ul class="plain">
            <li>Amplify track record using Tier-1 delivery credentials.</li>
            <li>Retain ownership of cost, controls and governance workstreams.</li>
            <li>De-risk resourcing through shared bench and surge teams.</li>
          </ul>
        </div></div>
      </div>

      <div class="fw-row">
        <div class="fw-section fw-card"><div class="fw-card-body">
          <h4>Key dates</h4>
          <div class="timeline">
            ${(fr.key_dates||[]).map(d=>`
              <div class="titem"><div class="tlabel">${d.name||d.label}</div>
              <div class="muted">${fmt(d.date)} ${d.link?`· <a href="${d.link}" target="_blank" rel="noreferrer">link</a>`:""}</div></div>
            `).join("")}
          </div>
        </div></div>
        <div class="fw-section fw-card"><div class="fw-card-body">
          <h4>Incumbents & competition</h4>
          <div class="pills">${(fr.incumbents||[]).map(n=>`<span class="pill">${n}</span>`).join("")}</div>
          ${fr.competition_watch?.length ? `<div class="muted" style="margin-top:8px"><strong>Watch:</strong> ${fr.competition_watch.join(", ")}</div>` : ""}
          ${fr.competition_notes ? `<div class="muted" style="margin-top:8px">${fr.competition_notes}</div>` : ""}
        </div></div>
      </div>

      <div class="fw-section fw-card"><div class="fw-card-body">
        <h4>Recruitment needs</h4>
        <div class="recruit-grid">
          ${(fr.recruitment||[]).map(r=>`
            <div class="recruit">
              <div class="r-head"><div class="r-title">${r.title}</div><span class="r-badge">${r.priority || "High"}</span></div>
              <div class="r-body"><div class="r-meta"><span>Target: ${r.target ?? 1}</span><span>Status: ${r.status || "TBC"}</span></div>
              ${r.skills?.length ? `<div class="muted">Skills: ${r.skills.join(", ")}</div>` : ""}</div>
            </div>
          `).join("")}
        </div>
      </div></div>

      ${(fr.key_people?.length) ? `
      <div class="fw-row">
        <div class="fw-section fw-card"><div class="fw-card-body">
          <h4>Key people (client & network)</h4>
          <ul class="plain" style="margin-left:1rem">
            ${fr.key_people.map(p=>`<li><strong>${p.name}</strong> — ${p.title || ""}${p.org ? `, ${p.org}`:""} ${p.contact_url ? `· <a href="${p.contact_url}" target="_blank">profile</a>`:""}</li>`).join("")}
          </ul>
        </div></div>
        <div class="fw-section fw-card"><div class="fw-card-body">
          <h4>Bid insights (Gleeds strengths)</h4>
          <ul class="plain" style="margin-left:1rem">
            ${(fr.bid_insights || ["Lead with cost certainty; back with KPI trend charts.","Show programme advisory case studies.","Use partner’s delivery credentials to strengthen interface management."]).map(w=>`<li>${w}</li>`).join("")}
          </ul>
        </div></div>
      </div>` : ""}

    `;
    drawerEl.hidden = false;
    drawerEl.classList.add("open");
  }
  function closeDrawer(){ drawerEl.hidden = true; drawerEl.classList.remove("open"); }

  // ---------- Wizard ----------
  const modalEl = $("fw-modal");
  const wizTitle   = $("wiz-title");
  const wizKicker  = $("wiz-kicker");
  const wizSteps   = $("wiz-steps");
  const wizResults = $("wiz-results");
  const wizBack    = $("wiz-back");
  const wizNext    = $("wiz-next");
  const wizGen     = $("wiz-generate");
  const wizProg    = $("wiz-progress");
  const wizStepper = $("wiz-stepper");
  $("wiz-close").onclick = () => closeWizard();
  modalEl.addEventListener("click", (e)=>{ if (e.target.id === "fw-modal") closeWizard(); });
  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") closeWizard(); });

  function closeWizard(){
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden","true");
    modalEl.classList.remove("open");
  }
  function openWizardShell(){
    modalEl.hidden = false;
    modalEl.removeAttribute("aria-hidden");
    modalEl.classList.add("open");
  }

  const steps = [
    { id:"capability", title:"Capability & Capacity", fields:[
      { id:"qs_count", type:"counter", label:"Cost Managers (QS) with sector experience" },
      { id:"pm_count", type:"counter", label:"Project Managers (sector)" },
      { id:"pc_count", type:"counter", label:"Project Controls (schedule/risk/reporting)" },
      { id:"pmo_count", type:"counter", label:"Programme Advisory / PMO Leads" },
      { id:"case_studies", type:"text", label:"Relevant case studies (last 3 years)", placeholder:"List titles / clients" }
    ]},
    { id:"relationships", title:"Client & Partners", fields:[
      { id:"client_rel", type:"boolean", label:"Existing relationship with client/framework team?" },
      { id:"incumbent_rel", type:"boolean", label:"Existing relationships with incumbents/target partners?" },
      { id:"warm_intros", type:"text", label:"Warm intros / key people you can access", placeholder:"Names / roles" }
    ]},
    { id:"diff_risks", title:"Differentiators & Risks", fields:[
      { id:"diffs", type:"checkbox", label:"Differentiators you can evidence", options:["Cost certainty","Programme assurance","Interface management","Operational environment delivery","Change control","Portfolio reporting"] },
      { id:"risks", type:"text", label:"Top risks you foresee", placeholder:"Resourcing, timeframes, compliance…" }
    ]},
    { id:"resourcing", title:"Resourcing & Approach", fields:[
      { id:"approach", type:"select", label:"Intended approach", options:["Prime","Partner","Monitor"] },
      { id:"partners", type:"text", label:"Target partners (if Partner)", placeholder:"Tier 1s / SMEs" },
      { id:"recruit_roles", type:"text", label:"Roles you’re willing to open", placeholder:"e.g., Senior QS, Controls Lead" }
    ]},
    { id:"compliance", title:"Compliance & Logistics", fields:[
      { id:"local_commit", type:"boolean", label:"Can meet locality/social value commitments?" },
      { id:"governance",   type:"boolean", label:"Governance readiness (NEC, reporting, assurance)?" },
      { id:"bid_setup",    type:"select",  label:"Submission logistics", options:["Ready","Needs setup"] }
    ]}
  ];

  function renderStepper(stepIdx){
    wizStepper.innerHTML = "";
    steps.forEach((s,i)=>{
      const wrap = document.createElement("div");
      wrap.className = "step" + (i<stepIdx ? " is-complete" : i===stepIdx ? " is-active" : "");
      wrap.innerHTML = `<div class="dot">${i+1}</div><div class="label">${s.title}</div>`;
      wizStepper.appendChild(wrap);
      if (i < steps.length-1){
        const bar = document.createElement("div"); bar.className = "bar"; wizStepper.appendChild(bar);
      }
    });
  }

  let __currentFramework = null;
  let __lastResult = null;

  function openWizard(fr){
    __currentFramework = fr;
    openWizardShell();
    wizTitle.textContent = fr.name || "Selected framework";
    wizKicker.textContent = `Bid Analyser · ${fr.sector || "Infrastructure"}`;
    wizResults.hidden = true; wizSteps.hidden = false;

    let answers = {}; let stepIdx = 0;

    function renderStep(){
      const s = steps[stepIdx];
      wizProg.textContent = `${stepIdx+1} / ${steps.length}`;
      renderStepper(stepIdx);

      wizSteps.innerHTML =
        `<h4 style="margin:12px 18px 0;font-size:1rem">${s.title}</h4>`+
        `<div class="grid" style="padding:12px 18px">`+
        s.fields.map(f=>{
          const val = answers[f.id] ?? "";
          if (f.type==="counter"){
            return `<div><label class="lab">${f.label}</label>
              <div class="counter">
                <button class="btn-secondary" data-minus="${f.id}">−</button>
                <span class="count" id="count-${f.id}">${val||0}</span>
                <button class="btn-secondary" data-plus="${f.id}">+</button>
              </div>
            </div>`;
          }
          if (f.type==="boolean"){
            return `<div><label class="lab">${f.label}</label>
              <select class="fw-input" data-id="${f.id}">
                <option value="">Select…</option><option>Yes</option><option>No</option>
              </select></div>`;
          }
          if (f.type==="checkbox"){
            return `<div><label class="lab">${f.label}</label>
              <div class="chips">${(f.options||[]).map(o=>
                `<label class="chip-opt"><input type="checkbox" data-check="${f.id}" value="${o}"/> ${o}</label>`
              ).join("")}</div></div>`;
          }
          if (f.type==="select"){
            return `<div><label class="lab">${f.label}</label>
              <select class="fw-input" data-id="${f.id}"><option value="">Select…</option>
                ${(f.options||[]).map(o=>`<option>${o}</option>`).join("")}
              </select></div>`;
          }
          return `<div><label class="lab">${f.label}</label>
            <textarea class="fw-input" rows="3" data-id="${f.id}" placeholder="${f.placeholder||""}">${val||""}</textarea></div>`;
        }).join("") + `</div>`;

      wizSteps.querySelectorAll("[data-minus]").forEach(b=>{
        b.addEventListener("click",()=>{ const id=b.getAttribute("data-minus"); const span=document.getElementById(`count-${id}`); const n=Math.max(0,+span.textContent-1); span.textContent=n; answers[id]=n; });
      });
      wizSteps.querySelectorAll("[data-plus]").forEach(b=>{
        b.addEventListener("click",()=>{ const id=b.getAttribute("data-plus"); const span=document.getElementById(`count-${id}`); const n=+span.textContent+1; span.textContent=n; answers[id]=n; });
      });
      wizSteps.querySelectorAll("[data-id]").forEach(el=>{
        el.addEventListener("change",()=>{ const id=el.getAttribute("data-id"); let v=el.value; if (v==="Yes"||v==="No") v=(v==="Yes"); answers[id]=v; });
      });
      wizSteps.querySelectorAll("[data-check]").forEach(ch=>{
        ch.addEventListener("change",()=>{ const id=ch.getAttribute("data-check"); const vs=[...wizSteps.querySelectorAll(`input[data-check="${id}"]:checked`)].map(x=>x.value); answers[id]=vs; });
      });

      wizBack.hidden = stepIdx===0;
      wizNext.hidden = stepIdx===steps.length-1;
      wizGen.hidden  = !wizNext.hidden;
    }

    wizBack.onclick = ()=>{ if (stepIdx>0){ stepIdx--; renderStep(); } };
    wizNext.onclick = ()=>{ if (stepIdx<steps.length-1){ stepIdx++; renderStep(); } };
    wizGen.onclick  = async ()=>{
      wizGen.disabled = true; wizGen.textContent = "Generating…";
      const r = await fetch("/.netlify/functions/bid-analyser", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ frameworkId: fr.id, sector: fr.sector, answers })
      });
      const data = await r.json();
      __lastResult = data;

      wizSteps.hidden = true; wizBack.hidden = true; wizGen.hidden = true;
      wizProg.textContent = "Assessment ready";
      renderStepper(steps.length-1);

      wizResults.hidden = false;
      wizResults.innerHTML = `
        <div class="cards" style="display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr));padding:0 18px 12px;">
          <div class="card" style="background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);">
            <div class="card-title" style="font-weight:800;padding:10px 12px;border-bottom:1px solid var(--line);">Summary</div>
            <div style="padding:10px 12px">${data.summary || "Assessment generated."}</div>
          </div>
          <div class="card" style="background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);">
            <div class="card-title" style="font-weight:800;padding:10px 12px;border-bottom:1px solid var(--line);">Gaps</div>
            <ul class="plain" style="margin:10px 18px 14px">${(data.gaps||[]).map(g=>`<li>${g}</li>`).join("")}</ul>
          </div>
        </div>
        <div style="margin:0 18px 18px; display:flex; gap:8px;">
          <button id="wiz-export" class="btn-secondary">Export (.docx)</button>
        </div>
      `;
      const exp = document.getElementById("wiz-export");
      if (exp) exp.onclick = () => exportDocx();
    };

    renderStep();
  }

  async function exportDocx(){
    const fr = __currentFramework || {};
    const r = await fetch("/.netlify/functions/export-docx", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ framework: { name: fr.name, sector: fr.sector, client: fr.client, expected_award_date: fr.expected_award_date }, result: __lastResult })
    });
    if (!r.ok){ alert("Export failed."); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${(fr.name || "Bid_Assessment").replace(/[^\w]+/g,"_")}_Bid_Assessment.docx`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ---------- Data load ----------
  async function load() {
    const params = new URLSearchParams();
    if (sectorSel.value && sectorSel.value !== "All") params.set("sector", sectorSel.value);
    if (search.value) params.set("q", search.value);
    errorBox.style.display = "none"; errorBox.textContent = "";
    try {
      const r = await fetch(`/.netlify/functions/frameworks?${params.toString()}`);
      if (!r.ok) throw new Error(`frameworks returned ${r.status}`);
      const rows = await r.json();
      lastRef.textContent = new Date().toLocaleString();
      updateStarBadge(rows);
      renderTable(rows);
    } catch (e) {
      renderTable([]);
      updateStarBadge([]);
      errorBox.textContent = `Error loading frameworks: ${e.message}`;
      errorBox.style.display = "block";
    }
  }

  function moneyText(v){
    if (!v) return "—";
    if (v.amount) return `£${Number(v.amount).toLocaleString()}${v.is_estimate ? " (est.)" : ""}`;
    return v.note || "—";
  }
  function fmtDate(d){ return d ? new Date((d.length>10?d:d+"T00:00:00Z")).toLocaleDateString() : "—"; }

  // ---------- Compact table renderer (with yellow star) ----------
  function renderTable(rows){
    const filtered = starredOnly.checked ? rows.filter((r)=>isStarred(r.id)) : rows;
    tbody.innerHTML = "";
    if (!filtered.length){
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">No frameworks found</td></tr>`;
      return;
    }

    const starMap = getStarMap();

    filtered.forEach((r)=>{
      const tr = document.createElement("tr");
      const starred = !!starMap[r.id];
      tr.innerHTML = `
        <td>
          <button class="fw-star ${starred ? "active" : ""}" aria-label="Star" title="Star" data-star="${r.id}">★</button>
          <span class="fw-name"><a href="#" data-open="${r.id}">${r.name}</a></span>
          <div class="muted">${r.client || ""} · ${r.sector || ""} · ${r.region || ""} · ${moneyText(r.value)}</div>
          ${r.source_url ? `<a class="muted" href="${r.source_url}" target="_blank" rel="noreferrer">Source</a>` : ""}
        </td>
        <td>${r.region || "—"}</td>
        <td>${moneyText(r.value)}</td>
        <td><strong>${fmtDate(r.expected_award_date)}</strong></td>
        <td><button class="btn" data-analyse="${r.id}">Analyse</button></td>
      `;
      tbody.appendChild(tr);
    });

    // events
    tbody.querySelectorAll("[data-open]").forEach((a)=>{
      a.addEventListener("click",(e)=>{
        e.preventDefault();
        const id = a.getAttribute("data-open");
        const fr = filtered.find(x=>x.id===id) || {};
        openDrawer(fr);
      });
    });
    tbody.querySelectorAll("button[data-analyse]").forEach((btn)=>{
      btn.addEventListener("click",()=>{
        const id = btn.getAttribute("data-analyse");
        const fr = filtered.find(x=>x.id===id) || {};
        openWizard(fr);
      });
    });
    tbody.querySelectorAll("button[data-star]").forEach((btn)=>{
      btn.addEventListener("click",()=>{
        const id = btn.getAttribute("data-star");
        const map = getStarMap();
        if (map[id]) delete map[id]; else map[id] = true;
        setStarMap(map);
        load(); // re-render + refresh badge
      });
    });
  }

  // ---------- Wire controls & load ----------
  sectorSel.addEventListener("change", load);
  search.addEventListener("input", load);
  starredOnly.addEventListener("change", load);
  load();
});
