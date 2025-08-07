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
        const db = b.deadline ? new Date(b.deadline).
