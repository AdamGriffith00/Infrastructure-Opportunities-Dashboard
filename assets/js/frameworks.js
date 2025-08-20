// Frameworks table + Detail Drawer + Bid Analyser (Stepper) + DOCX export
// Features: Search, sector filter, starring (localStorage), "Show starred only"
// Data: loads from /.netlify/functions/frameworks
// Wizard: posts to /.netlify/functions/bid-analyser
// Export: posts to /.netlify/functions/export-docx

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("frameworks-root");
  if (!root) return;

  // ---------- Shell UI ----------
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
            <th>Framework</th>
            <th>Position</th>
            <th>Expected Award Date</th>
            <th>Key Dates</th>
            <th>Incumbents/Competition</th>
            <th>Key People</th>
            <th>Recruitment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="fw-tbody"></tbody>
      </table>
    </div>

    <!-- Drawer (detail) -->
    <div id="fw-drawer" class="fw-drawer" hidden>
      <div class="fw-drawer-backdrop"></div>
      <aside class="fw-drawer-panel">
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

    <!-- Wizard modal -->
    <div id="fw-modal" class="fw-modal" aria-hidden="true" hidden>
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

  // ---------- El refs ----------
  const $ = (id) => document.getElementById(id);
  const tbody = $("fw-tbody");
  const search = $("fw-search");
  const sectorSel = $("fw-sector");
  const starredOnly = $("fw-starred-only");
  const errorBox = $("fw-error");
  const lastRef = $("fw-lastref");

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

  const drawerEl = $("fw-drawer");
  const dwClose  = $("dw-close");
  const dwTitle  = $("dw-title");
  const dwSub    = $("dw-sub");
  const dwBody   = $("dw-body");

  // keep modal closed on load
  if (modalEl) {
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden","true");
    modalEl.style.display = "none";
  }
  function closeWizard() {
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden","true");
    modalEl.style.display = "none";
    modalEl.classList.remove("open");
  }
  function openWizardShell() {
    modalEl.hidden = false;
    modalEl.removeAttribute("aria-hidden");
    modalEl.style.display = "flex";
    modalEl.classList.add("open");
  }

  // ---------- Stars ----------
  const STAR_KEY = "fw_starred";
  const getStarMap = () => { try { return JSON.parse(localStorage.getItem(STAR_KEY) || "{}"); } catch { return {}; } };
  const setStar = (id, val) => { const m = getStarMap(); m[id] = !!val; localStorage.setItem(STAR_KEY, JSON.stringify(m)); };
  const isStarred = (id) => !!getStarMap()[id];

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
      renderTable(rows);
    } catch (e) {
      renderTable([]);
      errorBox.textContent = `Error loading frameworks: ${e.message}`;
      errorBox.style.display = "block";
    }
  }

  // ---------- Render helpers ----------
  const moneyText = (v) => {
    if (!v) return "—";
    if (v.amount) return `£${Number(v.amount).toLocaleString()}${v.is_estimate ? " (est.)" : ""}`;
    return v.note || "—";
  };
  const fmtDate = (d) => d ? new Date((d.length===10? d : d.slice(0,10)) + "T00:00:00Z").toLocaleDateString() : "—";
  const roleBadge = (role) => {
    const bg = role === "Prime" ? "#DCFCE7" : role === "Partner" ? "#E0EAFF" : "#F3F4F6";
    return `<span class="chip" style="background:${bg}">${role}</span>`;
  };

  function renderTable(rows) {
    const filtered = starredOnly.checked ? rows.filter((r) => isStarred(r.id)) : rows;
    tbody.innerHTML = "";
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;padding:16px">No frameworks found</td></tr>`;
      return;
    }

    filtered.forEach((r) => {
      const keyDates = (r.key_dates || [])
        .slice(0, 3)
        .map((d) => `<li><strong>${d.name || d.label}</strong>: ${fmtDate(d.date)} ${d.link ? `<a href="${d.link}" target="_blank" rel="noreferrer">link</a>` : ""}</li>`)
        .join("");
      const people = (r.key_people || [])
        .slice(0, 2)
        .map((p) => `<li><strong>${p.name}</strong> — ${p.title || ""}${p.org ? `, ${p.org}` : ""} ${p.contact_url ? `<a href="${p.contact_url}" target="_blank">contact</a>` : ""}</li>`)
        .join("");
      const reqs = (r.recruitment || [])
        .slice(0, 3)
        .map((n) => `<li>${n.title} (${n.target || 1}) — ${n.status || "TBC"}</li>`)
        .join("");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="star-cell">
          <button class="star-btn" aria-label="Star framework" data-star="${r.id}" title="Star">
            ${isStarred(r.id) ? "★" : "☆"}
          </button>
        </td>
        <td>
          <div class="fw-name">
            <a href="#" class="fw-open-link" data-open="${r.id}">${r.name}</a>
          </div>
          <div class="muted">${r.client || ""} · ${r.sector || ""} · ${r.region || ""} · ${moneyText(r.value)}</div>
          ${r.source_url ? `<a class="muted" href="${r.source_url}" target="_blank">Source</a>` : ""}
        </td>
        <td>${roleBadge(r.position?.role || "Monitor")}<div class="muted" style="margin-top:6px">${r.position?.rationale || ""}</div></td>
        <td>
          <div class="fw-bold">${fmtDate(r.expected_award_date || r.expected_award)}</div>
          ${r.countdown_days != null ? `<div class="chip">${r.countdown_days >= 0 ? `${r.countdown_days} days` : "past due"}</div>` : ""}
        </td>
        <td><ul class="plain">${keyDates}</ul></td>
        <td>
          <div class="muted"><strong>Incumbents:</strong> ${(r.incumbents || []).join(", ") || "—"}</div>
          <div class="muted"><strong>Competition:</strong> ${(r.competition_watch || []).join(", ") || "—"}</div>
        </td>
        <td><ul class="plain">${people}</ul></td>
        <td><ul class="plain">${reqs}</ul></td>
        <td>
          <button class="btn" data-analyse="${r.id}">Analyse</button>
        </td>
      `;
      tbody.appendChild(row);
      // attach the full record to the element for quick lookup
      row.dataset.rowJson = JSON.stringify(r);
    });

    // stars
    tbody.querySelectorAll("button[data-star]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.star;
        const now = !isStarred(id);
        setStar(id, now);
        btn.textContent = now ? "★" : "☆";
        if (starredOnly.checked) load();
      });
    });

    // open drawer (framework name click)
    tbody.querySelectorAll(".fw-open-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const tr = a.closest("tr");
        const fr = JSON.parse(tr.dataset.rowJson || "{}");
        openDrawer(fr);
      });
    });

    // open analyser (button)
    tbody.querySelectorAll("button[data-analyse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        const fr = JSON.parse(tr.dataset.rowJson || "{}");
        openWizard(fr);
      });
    });
  }

  // ---------- Drawer ----------
  function openDrawer(fr){
    dwTitle.textContent = fr.name || "Framework";
    dwSub.textContent = `${fr.client || "Client"} · ${fr.sector || ""} · ${fr.region || ""} · Budget: ${moneyText(fr.value)}`;
    dwBody.innerHTML = `
      <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px;">
        <div class="card">
          <div class="card-title">Gleeds Positioning</div>
          <div class="card-body">
            <div class="muted">Role: <strong>${fr.position?.role || "Monitor"}</strong> — ${fr.position?.rationale || ""}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Why partner?</div>
          <div class="card-body">
            <ul class="plain">
              <li>Amplify track record using Tier-1 delivery credentials.</li>
              <li>Retain ownership of cost, controls and governance workstreams.</li>
              <li>De-risk resourcing through shared bench and surge teams.</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:10px;">
        <div class="card">
          <div class="card-title">Key dates</div>
          <div class="card-body">
            <div class="timeline">
              ${(fr.key_dates||[]).map(d=>`
                <div class="titem">
                  <div class="tlabel">${d.name || d.label}</div>
                  <div class="muted">${fmtDate(d.date)} ${d.link?`· <a href="${d.link}" target="_blank" rel="noreferrer">link</a>`:""}</div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Incumbents & competition</div>
          <div class="card-body">
            <div class="pills">${(fr.incumbents||[]).map(n=>`<span class="pill">${n}</span>`).join("")}</div>
            ${fr.competition_watch?.length ? `<div class="muted" style="margin-top:8px"><strong>Watch:</strong> ${fr.competition_watch.join(", ")}</div>` : ""}
            ${fr.competition_notes ? `<div class="muted" style="margin-top:6px">${fr.competition_notes}</div>` : ""}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:10px">
        <div class="card-title">Recruitment needs</div>
        <div class="card-body">
          <div class="recruit-grid">
            ${(fr.recruitment||[]).map(r=>`
              <div class="recruit">
                <div class="r-head"><div class="r-title">${r.title}</div><span class="r-badge">${r.priority || "High"}</span></div>
                <div class="r-body">
                  <div class="r-meta"><span>Target: ${r.target || 1}</span><span>Status: ${r.status || "TBC"}</span></div>
                  ${Array.isArray(r.skills) && r.skills.length ? `<div class="muted">Skills: ${r.skills.join(", ")}</div>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:10px;">
        <div class="card">
          <div class="card-title">Key people (client & network)</div>
          <div class="card-body">
            <ul class="plain" style="margin-left:1rem">
              ${(fr.key_people||[]).map(p=>`
                <li><strong>${p.name}</strong>${p.title?` — ${p.title}`:""}${p.org?`, ${p.org}`:""} ${p.contact_url?`· <a href="${p.contact_url}" target="_blank" rel="noreferrer">profile</a>`:""}</li>
              `).join("")}
            </ul>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Bid insights (Gleeds strengths)</div>
          <div class="card-body">
            <ul class="plain" style="margin-left:1rem">
              ${(fr.bidInsights || fr.bid_insights || [
                "Lead with cost certainty narrative; back with KPI trend charts.",
                "Show programme advisory case studies in operational environments.",
                "Use partner delivery credentials to strengthen interface management."
              ]).map(x=>`<li>${x}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>
    `;
    drawerEl.hidden = false;
    drawerEl.classList.add("open");
  }
  dwClose.onclick = () => { drawerEl.hidden = true; drawerEl.classList.remove("open"); };
  drawerEl.addEventListener("click", (e)=>{ if (e.target.classList.contains("fw-drawer-backdrop")) { drawerEl.hidden = true; drawerEl.classList.remove("open"); }});
  document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") { if (!modalEl.hidden) closeWizard(); if (!drawerEl.hidden){ drawerEl.hidden=true; drawerEl.classList.remove("open"); } }});

  // ---------- Wizard (Stepper) ----------
  const steps = [
    { id: "capability", title: "Capability & Capacity", fields: [
      { id: "qs_count",     type: "counter", label: "Cost Managers (QS) with sector experience" },
      { id: "pm_count",     type: "counter", label: "Project Managers (sector)" },
      { id: "pc_count",     type: "counter", label: "Project Controls (schedule/risk/reporting)" },
      { id: "pmo_count",    type: "counter", label: "Programme Advisory / PMO Leads" },
      { id: "case_studies", type: "text",    label: "Relevant case studies (last 3 years)", placeholder: "List titles / clients" }
    ]},
    { id: "relationships", title: "Client & Partners", fields: [
      { id: "client_rel",   type: "boolean", label: "Existing relationship with client/framework team?" },
      { id: "incumbent_rel",type: "boolean", label: "Relationships with incumbents/target partners?" },
      { id: "warm_intros",  type: "text",    label: "Warm intros / key people you can access", placeholder: "Names / roles" }
    ]},
    { id: "diff_risks", title: "Differentiators & Risks", fields: [
      { id: "diffs",        type: "text",    label: "Differentiators you can evidence (cost certainty, programme assurance, etc.)" },
      { id: "risks",        type: "text",    label: "Top risks you foresee (resourcing, timeframes, compliance…)" }
    ]},
    { id: "resourcing", title: "Resourcing & Approach", fields: [
      { id: "approach",     type: "select",  label: "Intended approach", options: ["Prime","Partner","Monitor"] },
      { id: "partners",     type: "text",    label: "Target partners (if Partner)", placeholder: "Tier 1s / SMEs" },
      { id: "recruit_roles",type: "text",    label: "Roles you’re willing to open", placeholder: "e.g., Senior QS, Controls Lead" }
    ]},
    { id: "compliance", title: "Compliance & Logistics", fields: [
      { id: "local_commit", type: "boolean", label: "Can meet locality/social value commitments?" },
      { id: "governance",   type: "boolean", label: "Governance readiness (NEC, reporting, assurance)?" },
      { id: "bid_setup",    type: "select",  label: "Submission logistics", options: ["Ready","Needs setup"] }
    ]}
  ];

  let __lastResult = null;
  let __currentFramework = null;

  function renderStepper(idx){
    wizStepper.innerHTML = "";
    steps.forEach((s,i) => {
      const wrap = document.createElement("div");
      wrap.className = "step" + (i<idx ? " is-complete" : i===idx ? " is-active" : "");
      wrap.innerHTML = `<div class="dot">${i+1}</div><div class="label">${s.title}</div>`;
      wizStepper.appendChild(wrap);
      if (i < steps.length-1){
        const bar = document.createElement("div"); bar.className = "bar"; wizStepper.appendChild(bar);
      }
    });
  }

  function openWizard(fr) {
    __currentFramework = fr;

    // reset wizard state every time the modal opens
    let answers = {};
    let stepIdx = 0;

    openWizardShell();

    wizTitle.textContent = fr.name || "Selected framework";
    wizKicker.textContent = `Bid Analyser · ${fr.sector || "Infrastructure"}`;
    wizResults.hidden = true;
    wizSteps.hidden = false;
    wizSteps.innerHTML = "";

    function renderStep() {
      const s = steps[stepIdx];
      wizProg.textContent = `${stepIdx + 1} / ${steps.length}`;
      renderStepper(stepIdx);

      wizSteps.innerHTML =
        `<h4 style="margin:12px 18px 0;font-size:1rem">${s.title}</h4><div class="grid" style="padding:12px 18px">` +
        s.fields.map((f) => {
          const val = answers[f.id] ?? "";
          if (f.type === "counter") {
            return `<div><label class="lab">${f.label}</label>
              <div class="counter">
                <button class="btn-secondary" data-minus="${f.id}">−</button>
                <span class="count" id="count-${f.id}">${val || 0}</span>
                <button class="btn-secondary" data-plus="${f.id}">+</button>
              </div>
            </div>`;
          }
          if (f.type === "boolean") {
            return `<div><label class="lab">${f.label}</label>
              <select class="fw-input" data-id="${f.id}">
                <option value="">Select…</option>
                <option ${val === true ? "selected" : ""}>Yes</option>
                <option ${val === false ? "selected" : ""}>No</option>
              </select>
            </div>`;
          }
          if (f.type === "checkbox") {
            return `<div><label class="lab">${f.label}</label>
              <div class="chips">${(f.options || [])
                .map((o) => `<label class="chip-opt">
                  <input type="checkbox" data-check="${f.id}" value="${o}" ${(Array.isArray(val) && val.includes(o)) ? "checked" : ""}/> ${o}
                </label>`).join("")}
              </div></div>`;
          }
          if (f.type === "select") {
            return `<div><label class="lab">${f.label}</label>
              <select class="fw-input" data-id="${f.id}">
                <option value="">Select…</option>
                ${(f.options || []).map((o) => `<option ${val === o ? "selected" : ""}>${o}</option>`).join("")}
              </select>
            </div>`;
          }
          return `<div><label class="lab">${f.label}</label>
            <textarea class="fw-input" rows="3" data-id="${f.id}" placeholder="${f.placeholder || ""}">${val || ""}</textarea></div>`;
        }).join("") + `</div>`;

      // wire inputs
      wizSteps.querySelectorAll("[data-minus]").forEach((b) => {
        b.addEventListener("click", () => {
          const id = b.getAttribute("data-minus");
          const span = document.getElementById(`count-${id}`);
          const curr = +(span.textContent || 0);
          const next = Math.max(0, curr - 1);
          span.textContent = next; answers[id] = next;
        });
      });
      wizSteps.querySelectorAll("[data-plus]").forEach((b) => {
        b.addEventListener("click", () => {
          const id = b.getAttribute("data-plus");
          const span = document.getElementById(`count-${id}`);
          const curr = +(span.textContent || 0);
          const next = curr + 1;
          span.textContent = next; answers[id] = next;
        });
      });
      wizSteps.querySelectorAll("[data-id]").forEach((el) => {
        el.addEventListener("change", () => {
          const id = el.getAttribute("data-id");
          let v = el.value;
          if (el.tagName === "SELECT" && (v === "Yes" || v === "No")) v = (v === "Yes");
          answers[id] = v;
        });
      });
      wizSteps.querySelectorAll("[data-check]").forEach((ch) => {
        ch.addEventListener("change", () => {
          const id = ch.getAttribute("data-check");
          const checked = Array.from(wizSteps.querySelectorAll(`input[data-check="${id}"]:checked`)).map((x) => x.value);
          answers[id] = checked;
        });
      });

      wizBack.hidden = (stepIdx === 0);
      wizNext.hidden = (stepIdx === steps.length - 1);
      wizGen.hidden  = !wizNext.hidden;
    }

    // footer actions
    wizBack.onclick = () => { if (stepIdx > 0) { stepIdx--; renderStep(); } };
    wizNext.onclick = () => { if (stepIdx < steps.length - 1) { stepIdx++; renderStep(); } };
    wizGen.onclick  = async () => {
      wizGen.disabled = true; wizGen.textContent = "Generating…";
      const r = await fetch("/.netlify/functions/bid-analyser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameworkId: fr.id, sector: fr.sector, answers })
      });
      const data = await r.json();
      __lastResult = data;
      wizSteps.hidden = true;
      wizBack.hidden = true;
      wizGen.hidden = true;
      wizProg.textContent = "Assessment ready";
      renderStepper(steps.length - 1);

      const wr = $("wiz-results");
      wr.hidden = false;
      wr.innerHTML = `
        <div class="scoreband ${data.readinessScore >= 75 ? "good" : data.readinessScore >= 55 ? "ok" : "bad"}">
          <div class="score">${data.readinessScore}%</div>
          <div>${data.summary}</div>
        </div>
        <div class="cards">
          <div class="card"><div class="card-title">Gap Analysis</div><ul class="plain">${(data.gaps||[]).map((g)=>`<li>${g}</li>`).join("")}</ul></div>
          <div class="card"><div class="card-title">Suggested Recruitment</div><ul class="plain">${(data.recruitment||[]).map((r)=>`<li><strong>${r.title}</strong>${Array.isArray(r.skills)&&r.skills.length?` — ${r.skills.join(", ")}`:""}</li>`).join("")}</ul></div>
          <div class="card"><div class="card-title">Win Strategy (Gleeds strengths)</div><ul class="plain">${(data.winStrategy||[]).map((w)=>`<li>${w}</li>`).join("")}</ul></div>
          <div class="card"><div class="card-title">Comprehensive Checklist</div><ol>${(data.checklist||[]).map((c)=>`<li>${c}</li>`).join("")}</ol></div>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button id="wiz-export" class="btn-secondary">Export (.docx)</button>
        </div>
      `;
      const exp = document.getElementById("wiz-export");
      if (exp) exp.onclick = () => exportDocx();
    };

    // open and render first step
    renderStep();
  }

  // Close modal (backdrop + button + Esc)
  modalEl.addEventListener("click", (e) => { if (e.target.id === "fw-modal") closeWizard(); });
  $("wiz-close").onclick = () => closeWizard();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWizard(); });

  // ---------- Export helper ----------
  async function exportDocx() {
    const fr = __currentFramework || {};
    const r = await fetch("/.netlify/functions/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        framework: {
          name: fr.name, sector: fr.sector, client: fr.client,
          expected_award_date: fr.expected_award_date || fr.expected_award
        },
        result: __lastResult
      })
    });
    if (!r.ok) { alert("Export failed."); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fr.name || "Bid_Assessment").replace(/[^\w]+/g, "_")}_Bid_Assessment.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Events + initial load ----------
  sectorSel.addEventListener("change", load);
  search.addEventListener("input", load);
  starredOnly.addEventListener("change", load);
  load();
});
