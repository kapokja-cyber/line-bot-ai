const CACHE_DURATION_MS = 60 * 60 * 1000; // 60 นาที

interface FaqCache {
  csv: string;
  fetchedAt: number;
}

let cache: FaqCache | null = null;

export async function getFaqCsv(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_DURATION_MS) {
    return cache.csv;
  }

  const url = process.env.SHEET_CSV_URL;
  if (!url) throw new Error("SHEET_CSV_URL is not set");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

  const csv = await res.text();
  cache = { csv, fetchedAt: now };
  return csv;
}
