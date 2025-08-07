(function () {
  const target = document.querySelector("#live-opportunities"); // table body or container
  const stamp = document.querySelector("#lastUpdated");         // last updated span
  const emptyMsg = document.querySelector("#emptyMessage");     // empty message div

  function render(items) {
    if (!target) return;

    // If no results, show the empty message and clear the table
    if (!items || items.length === 0) {
      if (emptyMsg) emptyMsg.style.display = "block";
      target.innerHTML = "";
      return;
    }

    // Hide the empty message if there are results
    if (emptyMsg) emptyMsg.style.display = "none";

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

  // Fallback polling if SSE fails
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

  // Try SSE first
  try {
    const es = new EventSource("/events");
    es.addEventListener("update", (e) => hydrate(JSON.parse(e.data)));
    es.onerror = () => { try { es.close(); } catch (_) {} fallbackPoll(); };
  } catch (_) { fallbackPoll(); }
})();
