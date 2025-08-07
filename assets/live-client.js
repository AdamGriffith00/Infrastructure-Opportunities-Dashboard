(function () {
  const target = document.querySelector("#live-opportunities");
  const stamp = document.querySelector("#lastUpdated");
  const emptyMsg = document.querySelector("#emptyMessage");

  // ---- helpers
  const SECTOR_MAP = [
    { name: "Rail", keywords: ["rail", "railway", "station"], className: "sector-rail" },
    { name: "Highways", keywords: ["highway", "highways", "road", "roads", "bridge"], className: "sector-highways" },
    { name: "Aviation", keywords: ["aviation", "airport", "runway", "terminal"], className: "sector-aviation" },
    { name: "Maritime", keywords: ["maritime", "port", "dock", "harbour", "harbor"], className: "sector-maritime" },
    { name: "Utilities", keywords: ["utilities", "water", "wastewater", "gas", "telecom"], className: "sector-utilities" }
  ];
  function getSectorBadge(title, buyer) {
    const t = `${title||""} ${buyer||""}`.toLowerCase();
    for (const s of SECTOR_MAP) if (s.keywords.some(k => t.includes(k))) {
      return `<span class="sector-badge ${s.className}">${s.name}</span>`;
    }
    return `<span class="sector-badge sector-other">Other</span>`;
  }
  function daysRemaining(deadline) {
    if (!deadline) return "";
    const end = new Date(deadline); if (isNaN(end)) return "";
    const diff = Math.ceil((end - new Date()) / 86400000);
    if (diff < 0) return "Closed";
    if (diff === 0) return "Closes today";
    if (diff === 1) return "1 day left";
    return `${diff} days left`;
  }

  // ---- renderer
  function render(items) {
    try {
      if (!target) return;
      if (!items || !items.length) {
        if (emptyMsg) emptyMsg.style.display = "block";
        target.innerHTML = "";
        return;
      }
      if (emptyMsg) emptyMsg.style.display = "none";

      const sorted = [...items].sort((a,b) => {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return da - db;
      });

      target.innerHTML = sorted.map(i => `
        <tr>
          <td><a href="${i.url}" target="_blank" rel="noopener">${i.title || ""}</a></td>
          <td>${i.organisation || ""}</td>
          <td>${i.region || ""}</td>
          <td>${i.deadline ? new Date(i.deadline).toLocaleString() : ""}</td>
          <td>${daysRemaining(i.deadline)}</td>
          <td>${
            (i.valueLow || i.valueHigh)
              ? ((i.valueLow ? "£" + Math.round(i.valueLow).toLocaleString() : "£?")
                + (i.valueHigh ? "–£" + Math.round(i.valueHigh).toLocaleString() : ""))
              : ""
          }</td>
          <td>${getSectorBadge(i.title, i.organisation)}</td>
        </tr>`).join("");
    } catch (e) {
      showError(e);
    }
  }

  function hydrate(payload) {
    try {
      if (stamp) stamp.textContent = new Date(payload?.updatedAt || Date.now()).toLocaleString();
      render(payload?.items || []);
    } catch (e) {
      showError(e);
    }
  }

  // ---- fetch logic (always fetch immediately)
  async function tick() {
    try {
      const res = await fetch("/.netlify/functions/latest?cb=" + Date.now(), { cache: "no-store" });
      if (res.ok) hydrate(await res.json());
      else showError(new Error("latest returned " + res.status));
    } catch (e) {
      showError(e);
    }
  }

  // Start right away, then poll every 60s
  tick();
  setInterval(tick, 60000);

  // Optional SSE (won’t block our first fetch)
  try {
    const es = new EventSource("/events");
    es.addEventListener("update", (e) => hydrate(JSON.parse(e.data)));
    es.onerror = () => { try { es.close(); } catch(_){} };
  } catch (_) {}

  // Show any JS errors on-page so you can see them on mobile
  function showError(e) {
    let box = document.getElementById("liveErrors");
    if (!box) {
      box = document.createElement("div");
      box.id = "liveErrors";
      box.style.cssText = "margin-top:1rem;color:#b00020;font-size:.9rem;";
      document.body.appendChild(box);
    }
    box.textContent = "Error: " + (e?.message || e);
  }
})();
