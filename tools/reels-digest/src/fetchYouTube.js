const API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_SHORTS_SECONDS = 60;

function parseIso8601DurationSeconds(duration) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration || "");
  if (!match) return null;
  const [, h, m, s] = match;
  return (Number(h || 0) * 3600) + (Number(m || 0) * 60) + Number(s || 0);
}

function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function searchCandidateIds({ apiKey, query, publishedAfter, maxResults }) {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "viewCount");
  url.searchParams.set("videoDuration", "short");
  url.searchParams.set("publishedAfter", publishedAfter);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`search.list HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.items || []).map((item) => ({
    videoId: item.id.videoId,
    query,
  }));
}

async function fetchVideoDetails({ apiKey, videoIds }) {
  const details = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = new URL(`${API_BASE}/videos`);
    url.searchParams.set("part", "contentDetails,statistics,snippet");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", apiKey);

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`videos.list HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    for (const item of data.items || []) {
      details.set(item.id, item);
    }
  }
  return details;
}

function mapToItem(video, sourceQuery, rank) {
  const durationSeconds = parseIso8601DurationSeconds(video.contentDetails.duration);
  const snippet = video.snippet;
  return {
    id: `youtube:${video.id}`,
    platform: "youtube",
    rank,
    title: snippet.title,
    thumbnail_url:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      null,
    url: `https://www.youtube.com/shorts/${video.id}`,
    stats: {
      views: video.statistics?.viewCount ? Number(video.statistics.viewCount) : null,
      likes: video.statistics?.likeCount ? Number(video.statistics.likeCount) : null,
      comments: video.statistics?.commentCount ? Number(video.statistics.commentCount) : null,
    },
    hashtags: (snippet.title.match(/#[\p{L}\p{N}_]+/gu) || []).concat(
      (snippet.description?.match(/#[\p{L}\p{N}_]+/gu) || [])
    ),
    sound_name: null,
    source_query_or_hashtag: `search:${sourceQuery}`,
    published_at: snippet.publishedAt,
    _durationSeconds: durationSeconds,
  };
}

async function fetchForQueries({ apiKey, queries, publishedAfterHours, maxResultsPerQuery }) {
  let quotaUnits = 0;
  const publishedAfter = hoursAgoIso(publishedAfterHours);

  const candidateLists = await Promise.all(
    queries.map((q) =>
      searchCandidateIds({ apiKey, query: q, publishedAfter, maxResults: maxResultsPerQuery })
    )
  );
  quotaUnits += queries.length * 100;

  const queryByVideoId = new Map();
  for (const list of candidateLists) {
    for (const { videoId, query } of list) {
      if (!queryByVideoId.has(videoId)) queryByVideoId.set(videoId, query);
    }
  }

  const videoIds = [...queryByVideoId.keys()];
  if (videoIds.length === 0) return { items: [], quotaUnits };

  const details = await fetchVideoDetails({ apiKey, videoIds });
  quotaUnits += Math.ceil(videoIds.length / 50);

  const items = [];
  let rank = 1;
  const sorted = [...details.values()].sort(
    (a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0)
  );
  for (const video of sorted) {
    const durationSeconds = parseIso8601DurationSeconds(video.contentDetails.duration);
    if (durationSeconds == null || durationSeconds > MAX_SHORTS_SECONDS) continue;
    items.push(mapToItem(video, queryByVideoId.get(video.id), rank));
    rank += 1;
  }

  return { items, quotaUnits };
}

export async function fetchYouTube({ apiKey, nicheQueries, generalQueries }) {
  const result = {
    status: "ok",
    error: null,
    quotaUnitsUsed: 0,
    nicheItems: [],
    generalItems: [],
  };

  try {
    const [niche, general] = await Promise.all([
      fetchForQueries({ apiKey, queries: nicheQueries, publishedAfterHours: 48, maxResultsPerQuery: 25 }),
      fetchForQueries({ apiKey, queries: generalQueries, publishedAfterHours: 48, maxResultsPerQuery: 25 }),
    ]);
    result.nicheItems = niche.items;
    result.generalItems = general.items;
    result.quotaUnitsUsed = niche.quotaUnits + general.quotaUnits;
  } catch (err) {
    console.warn(`[fetchYouTube] failed: ${err.message}`);
    result.status = "failed";
    result.error = err.message;
  }

  return result;
}
