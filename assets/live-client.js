(function () {
  const target = document.querySelector("#live-opportunities");
  const stamp = document.querySelector("#lastUpdated");
  const emptyMsg = document.querySelector("#emptyMessage");

  const SECTOR_MAP = [
    { name: "Rail", keywords: ["rail"], className: "sector-rail" },
    { name: "Highways", keywords: ["highway", "road", "roads"], className: "sector-highways" },
    { name: "Aviation", keywords: ["aviation", "airport"], className: "sector-aviation" },
    { name: "Maritime", keywords: ["maritime", "port", "dock", "harbour", "harbor"], className: "sector-maritime" },
    { name: "Utilities", keywords: ["utilities", "water", "gas", "telecom"], className: "sector-utilities" }
  ];

  function getSectorBadge(title, buyer) {
    const text = `${title || ""} ${buyer || ""}`.toLowerCase();
    for (const sector of SECTOR_MAP) {
      if (sector.keywords.some(k => text.includes(k))) {
        return `<span class="sector-badge ${sector.className}">${sector.name}</span>`;
      }
    }
    return `<span class="sector-badge sector-other">Other</span>`;
  }

  function daysRemaining(deadline) {
    if (!deadline) return "";
    const now = new Date();
    const end = new Date(deadline);
    const diffMs = end - now;
    if (isNaN(diffMs)) return "";
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "Closed";
    if (diffDays === 0) return "Closes today";
    if (diffDays === 1) return "1 day left";
    return `${diffDays} days left`;
  }

  function render(items) {
    if (!target) return;

    if (!items || items.length === 0) {
      if (emptyMsg) emptyMsg.style.display = "block";
      target.innerHTML = "";
      return;
    }
    if (emptyMsg) emptyMsg.style.display = "none";

    const sorted = [...items].sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });

    if (target.tagName === "TBODY") {
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
    }
  }

  function hydrate(payload) {
    if (!payload) return;
    if (stamp) stamp.textContent = new Date(payload.updatedAt || Date.now()).toLocaleString();
    render(payload.items || []);
  }

  function fallbackPoll() {
    async function tick() {
      try {
        const res = await fetch("/.netlify/functions/latest", { cache: "no-store" });
        if (res.ok) hydrate(await res.json());
      } catch (_) {}
    }
    tick();
    setInterval(tick, 60000);
  }

  try {
    const es = new EventSource("/events");
    es.addEventListener("update", (e) => hydrate(JSON.parse(e.data)));
    es.onerror = () => { try { es.close(); } catch (_) {} fallbackPoll(); };
  } catch (_) { fallbackPoll(); }
})();
