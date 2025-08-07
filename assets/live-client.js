(function(){
  const API_URL = '/.netlify/functions/latest';
  const REFRESH_MS = 60 * 1000; // 1 min refresh

  function fetchData() {
    fetch(API_URL)
      .then(res => res.json())
      .then(data => {
        if (data && data.items) {
          hydrateLiveData({
            updatedAt: data.updatedAt,
            items: data.items.map(formatItem)
          });
        }
      })
      .catch(err => {
        console.error('Fetch error', err);
        showError('Unable to load opportunities at this time.');
      });
  }

  function formatItem(i) {
    const deadline = i.deadline ? new Date(i.deadline) : null;
    const today = new Date();
    let daysRemaining = '';
    if (deadline) {
      const diff = Math.ceil((deadline - today) / (1000*60*60*24));
      daysRemaining = diff >= 0 ? diff : 0;
    }

    const valueDisplay = formatValue(i.valueLow, i.valueHigh);
    const sectorName = detectSector(i.title, i.organisation);
    const sectorClass = sectorName.toLowerCase();

    return {
      title: i.title || '',
      organisation: i.organisation || '',
      region: i.region || '',
      deadline: i.deadline || '',
      daysRemaining,
      valueDisplay,
      sectorName,
      sectorClass,
      source: i.source || '',
      url: i.url || ''
    };
  }

  function formatValue(low, high) {
    if (low && high && high !== low) {
      return `£${numFmt(low)} – £${numFmt(high)}`;
    } else if (low) {
      return `£${numFmt(low)}`;
    } else if (high) {
      return `£${numFmt(high)}`;
    }
    return '';
  }

  function numFmt(n) {
    return Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  }

  function detectSector(text, buyer) {
    const hay = `${text} ${buyer}`.toLowerCase();
    if (/rail|railway|station/.test(hay)) return 'Rail';
    if (/highway|road|bridge/.test(hay)) return 'Highways';
    if (/aviation|airport|runway|terminal/.test(hay)) return 'Aviation';
    if (/maritime|port|dock|harbour|harbor/.test(hay)) return 'Maritime';
    if (/utilities|water|wastewater|gas|telecom/.test(hay)) return 'Utilities';
    return 'Other';
  }

  function showError(msg) {
    let el = document.getElementById('liveErrors');
    if (!el) {
      el = document.createElement('div');
      el.id = 'liveErrors';
      document.querySelector('.wrap').appendChild(el);
    }
    el.textContent = msg;
  }

  // Initial call + interval
  fetchData();
  setInterval(fetchData, REFRESH_MS);

  // Default hydrate (replaced by live.html override)
  window.hydrateLiveData = function(payload) {
    const { updatedAt, items } = payload;
    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (lastUpdatedEl && updatedAt) {
      lastUpdatedEl.textContent = new Date(updatedAt).toLocaleString();
    }
    const tbody = document.getElementById('live-opportunities');
    if (!tbody) return;

    if (!items.length) {
      document.getElementById('emptyMessage').style.display = 'block';
      tbody.innerHTML = '';
      return;
    }
    document.getElementById('emptyMessage').style.display = 'none';
    tbody.innerHTML = items.map(i => `
      <tr>
        <td><a href="${i.url}" target="_blank">${i.title}</a></td>
        <td>${i.organisation}</td>
        <td>${i.region || ''}</td>
        <td>${i.deadline ? new Date(i.deadline).toLocaleDateString() : ''}</td>
        <td>${i.daysRemaining}</td>
        <td>${i.valueDisplay || ''}</td>
        <td><span class="sector-badge sector-${i.sectorClass}">${i.sectorName}</span></td>
        <td>${i.source}</td>
      </tr>
    `).join('');
  };
})();
