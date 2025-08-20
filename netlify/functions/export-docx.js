const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
const H1 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1 });
const H2 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
const P = (t, opts={}) => new Paragraph({ children: [ new TextRun({ text: t, ...opts }) ]});
const bullets = items => (items||[]).map(t => new Paragraph({ children: [ new TextRun({ text: "• " + t }) ] }));
const numbers = items => (items||[]).map((t,i) => new Paragraph({ children: [ new TextRun({ text: `${i+1}. ${t}` }) ] }));

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { framework = {}, result = {} } = JSON.parse(event.body || "{}");
    const title = framework.name || "Bid Assessment";
    const meta = [framework.sector && `Sector: ${framework.sector}`, framework.client && `Client: ${framework.client}`, framework.expected_award_date && `Expected award: ${framework.expected_award_date}`].filter(Boolean).join(" · ");

    const doc = new Document({
      sections: [{ children: [
        H1(title), P(meta, { color:"666666" }),
        H2("Readiness Summary"),
        P(`Readiness Score: ${result.readinessScore ?? "—"}%`, { bold:true }),
        P(result.summary || ""),
        H2("Gap Analysis"), ...bullets(result.gaps),
        H2("Suggested Recruitment"), ...bullets((result.recruitment||[]).map(r => `${r.title} — ${(r.skills||[]).join(", ")}`)),
        H2("Win Strategy (Gleeds strengths)"), ...bullets(result.winStrategy),
        H2("Comprehensive Checklist"), ...numbers(result.checklist)
      ]}]
    });

    const base64 = await Packer.toBase64String(doc);
    const filename = `${String(title).replace(/[^\w]+/g, "_")}_Bid_Assessment.docx`;
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`
      },
      isBase64Encoded: true,
      body: base64
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
