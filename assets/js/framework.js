// Frameworks table + Bid Analyser wizard + DOCX export
// Includes: ⭐ starring (localStorage), "Show starred only" toggle, click name to Analyse
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("frameworks-root");
  if (!root) return;

  root.innerHTML = `
    <div class="fw-controls">
      <input id="fw-search" class="fw-input" placeholder="Search frameworks, clients…"/>
      <select id="fw-sector" class="fw-input">
        <option>All</option><option>Aviation</option><option>Utilities</option>
        <option>Maritime & Ports</option><option>Highways</option><option>Rail</option>
      </select>
      <label class="fw-check">
        <input type="checkbox" id="fw-starred-only"/> Show starred only
      </label>
      <span class="fw-time">Last refreshed: <span id="fw-lastref">—</span></span>
    </div>
    <div id="fw-error" class="muted" style="margin:6px 0 12px;color:#b00020;display:none"></div>
    <div class="fw-table-wrap">
      <table class="fw-table">
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th>Framework</th><th>Position</th><th>Expected Award Date</th><th>Key Dates</th>
            <th>Incumbents/Competition</th><th>Key People</th><th>Recruitment</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="fw-tbody"></tbody>
      </table>
    </div>
    <div id="fw-modal" class="fw-modal" hidden>
      <div class="fw-modal-card">
        <div class="fw-modal-head">
          <div><div class="fw-kicker" id="wiz-kicker"></div><h3 id="wiz-title"></h3></div>
          <button id="wiz-close" class="btn-secondary">Close</button>
        </div>
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

  const $ = (id)=>document.getElementById(id);
  const tbody = $("fw-tbody");
  const search = $("fw-search");
  const sectorSel = $("fw-sector");
  const starredOnly = $("fw-starred-only");
  const errorBox = $("fw-error");
  const lastRef = $("fw-lastref");

  // --- Star helpers (persist by framework id) ---
  const STAR_KEY = "fw_starred";
  function getStarMap(){
    try { return JSON.parse(localStorage.getItem(STAR_KEY)||"{}"); } catch{ return {}; }
  }
  function setStar(id, val){
    const m = getStarMap(); m[id] = !!val; localStorage.setItem(STAR_KEY, JSON.stringify(m));
  }
  function isStarred(id){
    const m = getStarMap(); return !!m[id];
  }

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
      renderTable(rows);
    } catch (e) {
      renderTable([]); // clear table
      errorBox.textContent = `Error loading frameworks: ${e.message}`;
      errorBox.style.display = "block";
    }
  }

  function moneyText(v){
    if(!v) return "—";
    if(v.amount) return `£${Number(v.amount).toLocaleString()}${v.is_estimate?" (est.)":""}`;
    return v.note || "—";
  }
  function fmtDate(d){ return d ? new Date(d+"T00:00:00Z").toLocaleDateString() : "—"; }
  function roleBadge(role){
    const bg = role==="Prime" ? "#DCFCE7" : role==="Partner" ? "#E0EAFF" : "#F3F4F6";
    return `<span class="chip" style="background:${bg}">${role}</span>`;
  }

  function renderTable(rows){
    const filtered = starredOnly.checked ? rows.filter(r => isStarred(r.id)) : rows;

    tbody.innerHTML = "";
    if (!filtered.length){
      tbody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;padding:16px">No frameworks found</td></tr>`;
      return;
    }

    filtered.forEach(r=>{
      const keyDates = (r.key_dates||[]).slice(0,3).map(d=>`<li><strong>${d.name}</strong>: ${fmtDate(d.date)} ${d.link?`<a href="${d.link}" target="_blank" rel="noreferrer">link</a>`:""}</li>`).join("");
      const people = (r.key_people||[]).slice(0,2).map(p=>`<li><strong>${p.name}</strong> — ${p.title}, ${p.org} ${p.contact_url?`<a href="${p.contact_url}" target="_blank">contact</a>`:""}</li>`).join("");
      const reqs = (r.recruitment||[]).slice(0,3).map(n=>`<li>${n.title} (${n.target}) — ${n.status}</li>`).join("");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="star-cell">
          <button class="star-btn" aria-label="Star framework" data-star="${r.id}" title="Star">
            ${isStarred(r.id) ? "★" : "☆"}
          </button>
        </td>
        <td>
          <div class="fw-name">
            <a href="#" class="fw-analyse-link" data-analyse="${r.id}" data-name="${r.name}" data-sector="${r.sector}" data-client="${r.client}" data-award="${r.expected_award_date||""}">${r.name}</a>
          </div>
          <div class="muted">${r.client} · ${r.sector} · ${r.region} · ${moneyText(r.value)}</div>
          ${r.source_url?`<a class="muted" href="${r.source_url}" target="_blank">Source</a>`:""}
        </td>
        <td>${roleBadge(r.position?.role || "Monitor")}<div class="muted" style="margin-top:6px">${r.position?.rationale||""}</div></td>
        <td>
          <div class="fw-bold">${fmtDate(r.expected_award_date)}</div>
          ${r.countdown_days!=null ? `<div class="chip">${r.countdown_days>=0? `${r.countdown_days} days` : 'past due'}</div>`:""}
        </td>
        <td><ul class="plain">${keyDates}</ul></td>
        <td>
          <div class="muted"><strong>Incumbents:</strong> ${(r.incumbents||[]).join(", ")||"—"}</div>
          <div class="muted"><strong>Competition:</strong> ${(r.competition_watch||[]).join(", ")||"—"}</div>
        </td>
        <td><ul class="plain">${people}</ul></td>
        <td><ul class="plain">${reqs}</ul></td>
        <td>
          <button class="btn" data-analyse="${r.id}" data-name="${r.name}" data-sector="${r.sector}" data-client="${r.client}" data-award="${r.expected_award_date||""}">Analyse</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // hook star buttons
    tbody.querySelectorAll("button[data-star]").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const id = btn.dataset.star;
        const now = !isStarred(id);
        setStar(id, now);
        btn.textContent = now ? "★" : "☆";
        if (starredOnly.checked) load(); // refresh list if filtering
      });
    });

    // hook analyse buttons and title links
    const open = (el)=>{
      openWizard({
        id: el.dataset.analyse,
        name: el.dataset.name,
        sector: el.dataset.sector,
        client: el.dataset.client,
        expected_award_date: el.dataset.award
      });
    };
    tbody.querySelectorAll("button[data-analyse]").forEach(btn=>{
      btn.addEventListener("click", ()=>open(btn));
    });
    tbody.querySelectorAll(".fw-analyse-link").forEach(a=>{
      a.addEventListener("click", (e)=>{ e.preventDefault(); open(a); });
    });
  }

  // Wizard config (shared across sectors)
  const steps = [
    { id:"capability", title:"Capability & Capacity", fields:[
      { id:"qs_count",      type:"counter", label:"Cost Managers (QS) with sector experience" },
      { id:"pm_count",      type:"counter", label:"Project Managers (sector)" },
      { id:"pc_count",      type:"counter", label:"Project Controls (schedule/risk/reporting)" },
      { id:"pmo_count",     type:"counter", label:"Programme Advisory / PMO Leads" },
      { id:"case_studies",  type:"text",    label:"Relevant case studies (last 3 years)", placeholder:"List titles / clients" }
    ]},
    { id:"relationships", title:"Client & Partners", fields:[
      { id:"client_rel",    type:"boolean", label:"Existing relationship with client/framework team?" },
      { id:"incumbent_rel", type:"boolean", label:"Existing relationships with incumbents/target partners?" },
      { id:"warm_intros",   type:"text",    label:"Warm intros / key people you can access", placeholder:"Names / roles" }
    ]},
    { id:"diff_risks", title:"Differentiators & Risks", fields:[
      { id:"diffs",         type:"checkbox", label:"Differentiators you can evidence", options:["Cost certainty","Programme assurance","Interface management","Operational environment delivery","Change control","Portfolio reporting"] },
      { id:"risks",         type:"text",     label:"Top risks you foresee", placeholder:"Resourcing, timeframes, compliance…" }
    ]},
    { id:"resourcing", title:"Resourcing & Approach", fields:[
      { id:"approach",      type:"select",   label:"Intended approach", options:["Prime","Partner","Monitor"] },
      { id:"partners",      type:"text",     label:"Target partners (if Partner)", placeholder:"Tier 1s / SMEs" },
      { id:"recruit_roles", type:"text",     label:"Roles you’re willing to open", placeholder:"e.g., Senior QS, Controls Lead" }
    ]},
    { id:"compliance", title:"Compliance & Logistics", fields:[
      { id:"local_commit",  type:"boolean",  label:"Can meet locality/social value commitments?" },
      { id:"governance",    type:"boolean",  label:"Governance readiness (NEC, reporting, assurance)?" },
      { id:"bid_setup",     type:"select",   label:"Submission logistics", options:["Ready","Needs setup"] }
    ]}
  ];

  let __lastResult = null;
  let __currentFramework = null;

  function openWizard(fr){
    __currentFramework = fr;

    const modal = document.getElementById("fw-modal");
    const wizTitle = document.getElementById("wiz-title");
    const wizKicker = document.getElementById("wiz-kicker");
    const wizSteps = document.getElementById("wiz-steps");
    const wizResults = document.getElementById("wiz-results");
    const wizBack = document.getElementById("wiz-back");
    const wizNext = document.getElementById("wiz-next");
    const wizGen = document.getElementById("wiz-generate");
    const wizProg = document.getElementById("wiz-progress");
    let answers = {};
    let stepIdx = 0;

    wizTitle.textContent = fr.name;
    wizKicker.textContent = `Bid Analyser · ${fr.sector}`;
    wizResults.hidden = true;
    wizSteps.innerHTML = "";
    modal.hidden = false;

    function renderStep(){
      wizResults.hidden = true;
      wizSteps.hidden = false;
      const s = steps[stepIdx];
      wizProg.textContent = `${stepIdx+1} / ${steps.length}`;
      wizSteps.innerHTML = `<h4>${s.title}</h4><div class="grid">` + s.fields.map(f=>{
        const val = answers[f.id] ?? "";
        if(f.type==="counter"){
          return `<div><label class="lab">${f.label}</label>
            <div class="counter">
              <button class="btn-secondary" data-minus="${f.id}">−</button>
              <span class="count" id="count-${f.id}">${val||0}</span>
              <button class="btn-secondary" data-plus="${f.id}">+</button>
            </div>
          </div>`;
        }
        if(f.type==="boolean"){
          return `<div><label class="lab">${f.label}</label>
            <select class="fw-input" data-id="${f.id}">
              <option value="">Select…</option>
              <option ${val===true?"selected":""}>Yes</option>
              <option ${val===false?"selected":""}>No</option>
            </select>
          </div>`;
        }
        if(f.type==="checkbox"){
          return `<div><label class="lab">${f.label}</label>
            <div class="chips">${(f.options||[]).map(o=>`<label class="chip-opt">
              <input type="checkbox" data-check="${f.id}" value="${o}" ${(Array.isArray(val)&&val.includes(o))?"checked":""}/> ${o}
            </label>`).join("")}</div></div>`;
        }
        if(f.type==="select"){
          return `<div><label class="lab">${f.label}</label>
            <select class="fw-input" data-id="${f.id}">
              <option value="">Select…</option>
              ${(f.options||[]).map(o=>`<option ${val===o?"selected":""}>${o}</option>`).join("")}
            </select>
          </div>`;
        }
        return `<div><label class="lab">${f.label}</label>
          <textarea class="fw-input" rows="3" data-id="${f.id}" placeholder="${f.placeholder||""}">${val||""}</textarea></div>`;
      }).join("") + `</div>`;

      // hook counters & inputs
      wizSteps.querySelectorAll("[data-minus]").forEach(b=>{
        b.addEventListener("click", ()=>{
          const id = b.getAttribute("data-minus");
          const span = document.getElementById(`count-${id}`);
          const curr = +(span.textContent||0);
          const next = Math.max(0, curr-1);
          span.textContent = next; answers[id] = next;
        });
      });
      wizSteps.querySelectorAll("[data-plus]").forEach(b=>{
        b.addEventListener("click", ()=>{
          const id = b.getAttribute("data-plus");
          const span = document.getElementById(`count-${id}`);
          const curr = +(span.textContent||0);
          const next = curr+1;
          span.textContent = next; answers[id] = next;
        });
      });
      wizSteps.querySelectorAll("[data-id]").forEach(el=>{
        el.addEventListener("change", ()=>{
          const id = el.getAttribute("data-id");
          let v = el.value;
          if (el.tagName==="SELECT" && (v==="Yes" || v==="No")) v = (v==="Yes");
          answers[id] = v;
        });
      });
      wizSteps.querySelectorAll("[data-check]").forEach(ch=>{
        ch.addEventListener("change", ()=>{
          const id = ch.getAttribute("data-check");
          const checked = Array.from(wizSteps.querySelectorAll(`input[data-check="${id}"]:checked`)).map(x=>x.value);
          answers[id] = checked;
        });
      });

      wizBack.hidden = (stepIdx===0);
      wizNext.hidden = stepIdx === steps.length-1;
      wizGen.hidden = !wizNext.hidden;
    }

    wizBack.onclick = ()=> { if(stepIdx>0){ stepIdx--; renderStep(); } };
    wizNext.onclick = ()=> { if(stepIdx < steps.length-1){ stepIdx++; renderStep(); } };
    wizGen.onclick = async ()=>{
      wizGen.disabled = true; wizGen.textContent = "Generating…";
      const r = await fetch("/.netlify/functions/bid-analyser", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ frameworkId: fr.id, sector: fr.sector, answers })
      });
      const data = await r.json();
      renderResults(data);
      wizBack.hidden = true;
      wizGen.hidden = true;
    };

    function renderResults(data){
      __lastResult = data;
      wizProg.textContent = "Assessment ready";
      wizSteps.hidden = true;
      const wizResults = document.getElementById("wiz-results");
      wizResults.hidden = false;
      wizResults.innerHTML = `
        <div class="scoreband ${data.readinessScore>=75?"good":data.readinessScore>=55?"ok":"bad"}">
          <div class="score">${data.readinessScore}%</div>
          <div>${data.summary}</div>
        </div>
        <div class="cards">
          <div class="card"><div class="card-title">Gap Analysis</div><ul class="plain">${data.gaps.map(g=>`<li>${g}</li>`).join("")}</ul></div>
          <div class="card"><div class="card-title">Suggested Recruitment</div><ul class="plain">${data.recruitment.map(r=>`<li><strong>${r.title}</strong> — ${r.skills.join(", ")}</li>`).join("")}</ul></div>
          <div class="card"><div class="card-title">Win Strategy (Gleeds strengths)</div><ul class="plain">${data.winStrategy.map(w=>`<li>${w}</li>`).join("")}</ul></div>
          <div class="card"><div class="card-title">Comprehensive Checklist</div><ol>${data.checklist.map(c=>`<li>${c}</li>`).join("")}</ol></div>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button id="wiz-export" class="btn-secondary">Export (.docx)</button>
        </div>
      `;
      const exp = document.getElementById("wiz-export");
      if (exp) exp.onclick = () => exportDocx();
    }

    document.getElementById("wiz-close").onclick = ()=> { document.getElementById("fw-modal").hidden = true; };

    renderStep(); // first step when modal opens (sets controls)

    // --- Export helper (now inside scope so it sees current state) ---
    async function exportDocx(){
      const fr = __currentFramework || {};
      const r = await fetch("/.netlify/functions/export-docx", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          framework: {
            name: fr.name, sector: fr.sector, client: fr.client,
            expected_award_date: fr.expected_award_date
          },
          result: __lastResult
        })
      });
      if (!r.ok) { alert("Export failed."); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(fr.name||"Bid_Assessment").replace(/[^\w]+/g, "_")}_Bid_Assessment.docx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

  });// DOMContentLoaded end

});
