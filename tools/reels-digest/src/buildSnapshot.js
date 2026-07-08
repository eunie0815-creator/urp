import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

const HISTORY_DAYS = 30;

export function kstDateString(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function buildSnapshot({ siteDataDir, date, generatedAt, sources, niche, general }) {
  await mkdir(siteDataDir, { recursive: true });

  const snapshot = { date, generated_at: generatedAt, sources, niche, general };
  const snapshotPath = path.join(siteDataDir, `${date}.json`);
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

  const manifestPath = path.join(siteDataDir, "manifest.json");
  const manifest = await readJsonIfExists(manifestPath, { dates: [] });
  const dates = new Set(manifest.dates);
  dates.add(date);

  const cutoff = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const keptDates = [];
  for (const d of dates) {
    if (new Date(`${d}T00:00:00Z`) >= cutoff) {
      keptDates.push(d);
    } else {
      const staleFile = path.join(siteDataDir, `${d}.json`);
      await unlink(staleFile).catch(() => {});
    }
  }
  keptDates.sort().reverse();

  await writeFile(manifestPath, JSON.stringify({ dates: keptDates }, null, 2));

  return { snapshotPath, manifestPath };
}
