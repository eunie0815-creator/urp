const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const HASHTAG_LIST_URL = "https://ads.tiktok.com/CreativeOne/KnowledgeAPI/GetHashtagList";
const TOP_CONTENTS_OVERVIEW_URL = "https://ads.us.tiktok.com/CreativeOne/Report/GetTopContentsOverview";
const TOP_CONTENTS_LIST_URL = "https://ads.us.tiktok.com/CreativeOne/Report/CreativeCenterGetTopContentsList";

const REFERER_HASHTAG = "https://ads.tiktok.com/creative/creativeCenter/trends/hashtag";
const REFERER_VIDEO = "https://ads.tiktok.com/creative/creativeCenter/trends/video";

function extractHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(matches)];
}

// TikTok's itemID/authorID/creatorID are 19-digit numbers, which exceed
// Number.MAX_SAFE_INTEGER — JSON.parse silently corrupts them. Quote known
// big-int fields as strings before parsing so the exact ID survives.
const BIGINT_FIELDS = ["itemID", "authorID", "creatorID"];

function parseJsonPreservingBigIntFields(text) {
  let safe = text;
  for (const field of BIGINT_FIELDS) {
    safe = safe.replace(new RegExp(`"${field}"\\s*:\\s*(-?\\d+)`, "g"), `"${field}":"$1"`);
  }
  return JSON.parse(safe);
}

async function fetchHashtagList({ countryCode, timeRangeDays, referer }) {
  const res = await fetch(HASHTAG_LIST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      "user-agent": UA,
      referer,
    },
    body: JSON.stringify({ timeRange: timeRangeDays, countryCode, page: 1, limit: 20 }),
  });
  if (!res.ok) throw new Error(`GetHashtagList HTTP ${res.status}`);
  const data = await res.json();
  if (data?.BaseResp?.StatusCode !== 0) {
    throw new Error(`GetHashtagList error: ${data?.BaseResp?.StatusMessage || "unknown"}`);
  }
  return data.items || [];
}

async function fetchTopVideos({ countryCode, referer }) {
  const overviewRes = await fetch(
    `${TOP_CONTENTS_OVERVIEW_URL}?countryCode=${countryCode}`,
    { headers: { accept: "application/json, text/plain, */*", "user-agent": UA, referer } }
  );
  if (!overviewRes.ok) throw new Error(`GetTopContentsOverview HTTP ${overviewRes.status}`);
  const overview = await overviewRes.json();
  if (overview?.BaseResp?.StatusCode !== 0) {
    throw new Error(`GetTopContentsOverview error: ${overview?.BaseResp?.StatusMessage || "unknown"}`);
  }
  const periodEndTimestamp = overview.lastWeeklyEndTimestamp;

  const listUrl =
    `${TOP_CONTENTS_LIST_URL}?contentLabelIDs=&countryCode=${countryCode}&limit=20` +
    `&orderByMetric=1&organicOnly=false&page=1&periodDimension=3&periodEndTimestamp=${periodEndTimestamp}`;
  const listRes = await fetch(listUrl, {
    headers: { accept: "application/json, text/plain, */*", "user-agent": UA, referer },
  });
  if (!listRes.ok) throw new Error(`CreativeCenterGetTopContentsList HTTP ${listRes.status}`);
  const list = parseJsonPreservingBigIntFields(await listRes.text());
  if (list?.BaseResp?.StatusCode !== 0) {
    throw new Error(`CreativeCenterGetTopContentsList error: ${list?.BaseResp?.StatusMessage || "unknown"}`);
  }
  return list.entityInfos || [];
}

function mapVideoEntity(entity, rank) {
  const info = entity.itemInfo;
  const author = entity.itemAuthorInfo;
  const metrics = entity.itemMetrics;
  return {
    id: `tiktok:${info.itemID}`,
    platform: "tiktok",
    rank,
    title: info.title || "",
    thumbnail_url: info.coverURL || null,
    url: `https://www.tiktok.com/@${author?.handlerName || "unknown"}/video/${info.itemID}`,
    stats: {
      views: metrics?.videoViews ?? null,
      likes: null,
      comments: null,
    },
    hashtags: extractHashtags(info.title),
    sound_name: null,
    source_query_or_hashtag: "tiktok:top-contents",
    published_at: info.createTime ? new Date(info.createTime * 1000).toISOString() : null,
  };
}

export async function fetchTikTok({ countryCode, timeRangeDays }) {
  const result = { status: "ok", error: null, items: [], trendingHashtags: [] };

  try {
    const hashtagItems = await fetchHashtagList({
      countryCode,
      timeRangeDays,
      referer: `${REFERER_HASHTAG}?region=${countryCode}&period=${timeRangeDays}`,
    });
    result.trendingHashtags = hashtagItems.map((h) => ({
      name: h.hashtagName,
      publishCount: h.publishCnt,
      rank: h.rankIndex,
    }));
  } catch (err) {
    console.warn(`[fetchTikTok] hashtag list failed: ${err.message}`);
  }

  try {
    const videoEntities = await fetchTopVideos({
      countryCode,
      referer: `${REFERER_VIDEO}?region=${countryCode}&period=${timeRangeDays}`,
    });
    result.items = videoEntities.map((entity, i) => mapVideoEntity(entity, i + 1));
  } catch (err) {
    console.warn(`[fetchTikTok] top videos failed: ${err.message}`);
    result.status = "partial";
    result.error = err.message;
  }

  if (result.items.length === 0 && result.trendingHashtags.length === 0) {
    result.status = "failed";
  } else if (result.items.length === 0) {
    result.status = "partial";
  }

  return result;
}
