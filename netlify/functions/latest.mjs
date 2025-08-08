import fetch from 'node-fetch';

export const handler = async () => {
  try {
    // 1. Fetch both sources (100 results each)
    const cfResults = await fetchContractsFinder();
    const ftsResults = await fetchFindATender();

    console.log(`Contracts Finder returned ${cfResults.length} items`);
    console.log(`Find a Tender returned ${ftsResults.length} items`);

    // 2. Apply filters for allowed sectors
    const filteredCF = applyFilters(cfResults);
    const filteredFTS = applyFilters(ftsResults);

    console.log(`After filtering: CF = ${filteredCF.length}, FTS = ${filteredFTS.length}`);

    // 3. Merge results
    const allItems = [...filteredCF, ...filteredFTS];

    // 4. Sort by deadline ascending
    allItems.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    // 5. Return with counts
    return {
      statusCode: 200,
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        cfCount: filteredCF.length,
        ftsCount: filteredFTS.length,
        totalCount: allItems.length,
        items: allItems
      })
    };

  } catch (err) {
    console.error('Error in latest.js', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch opportunities' })
    };
  }
};

// ------------------------------
// Fetch from Contracts Finder
// ------------------------------
async function fetchContractsFinder() {
  const url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?order=desc&size=100&status=Open`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`CF API error: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.records ? data.records.map(formatCF) : [];
}

// ------------------------------
// Fetch from Find a Tender
// ------------------------------
async function fetchFindATender() {
  const url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?order=desc&size=100&status=Open`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FTS API error: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.records ? data.records.map(formatFTS) : [];
}

// ------------------------------
// Format helpers
// ------------------------------
function formatCF(item) {
  return {
    title: item.title || '',
    organisation: item.organisationName || '',
    region: item.region || '',
    deadline: item.deadline || '',
    valueLow: item.valueLow || null,
    valueHigh: item.valueHigh || null,
    source: 'CF',
    url: item.noticeIdentifier
      ? `https://www.contractsfinder.service.gov.uk/Notice/${item.noticeIdentifier}`
      : ''
  };
}

function formatFTS(item) {
  return {
    title: item.title || '',
    organisation: item.buyerName || '',
    region: item.region || '',
    deadline: item.deadline || '',
    valueLow: item.valueLow || null,
    valueHigh: item.valueHigh || null,
    source: 'FTS',
    url: item.noticeIdentifier
      ? `https://www.find-tender.service.gov.uk/Notice/${item.noticeIdentifier}`
      : ''
  };
}

// ------------------------------
// Sector filter with synonyms + buyer names
// ------------------------------
function applyFilters(items) {
  const keywords = [
    // Rail
    'rail', 'railway', 'station', 'network rail',
    // Highways
    'highway', 'road', 'bridge', 'highways england', 'national highways',
    // Aviation
    'aviation', 'airport', 'runway', 'terminal', 'heathrow', 'gatwick', 'manchester airport',
    // Maritime
    'maritime', 'port', 'dock', 'harbour', 'harbor', 'abp', 'associated british ports',
    // Utilities
    'utilities', 'water', 'wastewater', 'gas', 'telecom', 'electricity', 'severn trent', 'thames water'
  ];
  return items.filter(i => {
    const haystack = `${i.title} ${i.organisation}`.toLowerCase();
    return keywords.some(k => haystack.includes(k));
  });
}
