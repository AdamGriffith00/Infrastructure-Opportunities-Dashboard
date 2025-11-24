(function () {
  const target = document.querySelector("#live-opportunities"); // a <tbody> or <div>
  const stamp = document.querySelector("#lastUpdated");         // a <span> for timestamp

  function render(items) {
    if (!target) return;
    if (target.tagName === "TBODY") {
      target.innerHTML = items.map(i => `
        <tr>
          <td><a href="${i.url}" target="_blank" rel="noopener">${i.title || ""}</a></td>
          <td>${i.organisation || ""}</td>
          <td>${i.region || ""}</td>
          <td>${i.deadline ? new Date(i.deadline).toLocaleString() : ""}</td>
          <td>${
            (i.valueLow || i.valueHigh)
              ? ((i.valueLow ? "£" + Math.round(i.valueLow).toLocaleString() : "£?")
                + (i.valueHigh ? "–£" + Math.round(i.valueHigh).toLocaleString() : ""))
              : ""
          }</td>
        </tr>`).join("");
    } else {
      target.innerHTML = items.map(i => `<div class="card">
        <h4><a href="${i.url}" target="_blank" rel="noopener">${i.title || ""}</a></h4>
        <p>${i.organisation || ""} — ${i.region || ""}</p>
        <p>Deadline: ${i.deadline ? new Date(i.deadline).toLocaleString() : "TBC"}</p>
      </div>`).join("");
    }
  }

  function hydrate(payload) {
    if (!payload) return;
    if (stamp) stamp.textContent = new Date(payload.updatedAt || Date.now()).toLocaleString();
    render(payload.items || []);
  }

  // Prefer SSE for instant updates, fall back to polling JSON
  function fallbackPoll() {
    async function tick() {
      try {
        const res = await fetch("/.netlify/functions/latest", { cache: "no-store" });
        if (res.ok) hydrate(await res.json());
      } catch (_) {}
    }
    tick(); setInterval(tick, 60000);
  }

  try {
    const es = new EventSource("/events");
    es.addEventListener("update", (e) => hydrate(JSON.parse(e.data)));
    es.onerror = () => { try { es.close(); } catch (_) {} fallbackPoll(); };
  } catch (_) { fallbackPoll(); }
})();
