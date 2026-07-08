import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { fetchTikTok } from "./fetchTikTok.js";
import { fetchYouTube } from "./fetchYouTube.js";
import { selectTop10 } from "./selectTop10.js";
import { summarizeItems } from "./summarize.js";
import { buildSnapshot, kstDateString } from "./buildSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

async function loadJson(relPath) {
  const raw = await readFile(path.join(ROOT, relPath), "utf8");
  return JSON.parse(raw);
}

async function main() {
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!youtubeApiKey) throw new Error("YOUTUBE_API_KEY is required");
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is required");

  const nicheConfig = await loadJson("config/niche-queries.json");
  const generalConfig = await loadJson("config/general-queries.json");

  console.log("Fetching TikTok...");
  const tiktok = await fetchTikTok({
    countryCode: generalConfig.tiktok.countryCode,
    timeRangeDays: generalConfig.tiktok.timeRangeDays,
  });
  console.log(`TikTok status: ${tiktok.status}, items: ${tiktok.items.length}`);

  console.log("Fetching YouTube...");
  const youtube = await fetchYouTube({
    apiKey: youtubeApiKey,
    nicheQueries: nicheConfig.youtubeQueries,
    generalQueries: generalConfig.youtubeQueries,
  });
  console.log(
    `YouTube status: ${youtube.status}, niche: ${youtube.nicheItems.length}, general: ${youtube.generalItems.length}, quota: ${youtube.quotaUnitsUsed}`
  );

  const { niche, general } = selectTop10({
    tiktokItems: tiktok.items,
    youtubeNicheItems: youtube.nicheItems,
    youtubeGeneralItems: youtube.generalItems,
    nicheHashtagKeywords: nicheConfig.tiktokHashtagKeywords,
  });

  console.log(`Selected niche: ${niche.length}, general: ${general.length}`);
  console.log("Summarizing with Claude...");

  const allItems = [...niche, ...general];
  const blurbs = await summarizeItems(allItems, { apiKey: anthropicApiKey });

  const withBlurbs = (list) =>
    list.map((item) => {
      const { _durationSeconds, ...rest } = item;
      return { ...rest, ai_blurb: blurbs.get(item.id) || null };
    });

  const now = new Date();
  const date = kstDateString(now);

  const { snapshotPath } = await buildSnapshot({
    siteDataDir: path.join(ROOT, "site", "data"),
    date,
    generatedAt: now.toISOString(),
    sources: {
      tiktok: { status: tiktok.status, error: tiktok.error },
      youtube: { status: youtube.status, error: youtube.error, quota_units_used: youtube.quotaUnitsUsed },
    },
    niche: withBlurbs(niche),
    general: withBlurbs(general),
  });

  console.log(`Wrote snapshot: ${snapshotPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
