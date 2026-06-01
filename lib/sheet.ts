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
  const lines = csv.split("\n").slice(1); // skip header
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const cols = parseCSVLine(line);
      // รองรับทั้ง 2 คอลัมน์ (question,answer) และ 3+ คอลัมน์ (question,answer,keywords,...)
      const question = cols[0] || "";
      const answer = cols[1] || "";
      if (!question || !answer) return null;
      return `Q: ${question}\nA: ${answer}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}
