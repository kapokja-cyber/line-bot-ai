let cache: { text: string; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 นาที

export async function fetchFAQ(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.text;

  try {
    const url = process.env.SHEET_CSV_URL;
    if (!url) throw new Error("SHEET_CSV_URL not set");

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`sheet fetch ${res.status}`);

    const csv = await res.text();
    const text = csvToFaqText(csv);

    cache = { text, expiresAt: now + CACHE_TTL_MS };
    return text;
  } catch (err) {
    if (cache) {
      console.warn("[sheet] fetch failed · serving stale cache", err);
      return cache.text;
    }
    throw err;
  }
}

function csvToFaqText(csv: string): string {
  const rows = parseCSV(csv).slice(1); // skip header row
  return rows
    .map((cols) => {
      // Sheet format: A=หมวด, B=คำถาม, C=คำตอบ, D=keyword, E=Tag
      const question = cols[1]?.trim() || "";
      const answer = cols[2]?.trim() || "";
      if (!question || !answer) return null;
      return `Q: ${question}\nA: ${answer}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Full CSV parser — รองรับ multiline cells (quoted fields with embedded \n)
 */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // escaped quote ""
        field += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\r" && next === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i += 2;
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // last field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
