// netlify/functions/update-tenders-background.mjs
export async function handler(event, context) {
  console.log("Starting background tender update…");

  try {
    // 1) Load environment variables from Netlify
    const CF_TOKEN = process.env.CF_TOKEN;
    const FTS_TOKEN = process.env.FTS_TOKEN;

    // 2) Example fetch from Contracts Finder
    const cfRes = await fetch(`https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?status=Open&order=desc&pageSize=50&page=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Infrastructure Dashboard)',
        'Authorization': `Bearer ${CF_TOKEN}`
      }
    });
    const cfJson = await cfRes.json();
    console.log(`CF returned ${cfJson?.records?.length || 0} records`);

    // 3) Example fetch from Find a Tender
    const ftsRes = await fetch(`https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=open&limit=50`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Infrastructure Dashboard)',
        'Authorization': `Bearer ${FTS_TOKEN}`
      }
    });
    const ftsJson = await ftsRes.json();
    console.log(`FTS returned ${ftsJson?.records?.length || 0} records`);

    // 4) Merge & filter tenders (example — adjust for your schema)
    const allTenders = [...(cfJson.records || []), ...(ftsJson.records || [])]
      .filter(t => t.deadline && new Date(t.deadline) > new Date()); // remove expired

    console.log(`After filtering, ${allTenders.length} tenders remain`);

    // 5) TODO: Save to Blobs store or database
    // Example:
    // await blobs.set("tenders.json", JSON.stringify(allTenders));

    console.log("Tender update completed successfully");

    return new Response(
      JSON.stringify({ ok: true, total: allTenders.length }),
      { headers: { "content-type": "application/json" } }
    );

  } catch (err) {
    console.error("Error in update-tenders-background:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
