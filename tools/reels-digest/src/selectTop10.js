function matchesNicheKeywords(item, keywords) {
  const haystack = `${item.title} ${item.hashtags.join(" ")}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

function dedupeByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function rankAndTruncate(items, limit) {
  const sorted = [...items].sort((a, b) => (b.stats.views || 0) - (a.stats.views || 0));
  return sorted.slice(0, limit).map((item, i) => ({ ...item, rank: i + 1 }));
}

export function selectTop10({ tiktokItems, youtubeNicheItems, youtubeGeneralItems, nicheHashtagKeywords }) {
  const tiktokNicheMatches = tiktokItems.filter((item) =>
    matchesNicheKeywords(item, nicheHashtagKeywords)
  );

  const nichePool = dedupeByUrl([...youtubeNicheItems, ...tiktokNicheMatches]);
  const generalPool = dedupeByUrl([...youtubeGeneralItems, ...tiktokItems]);

  return {
    niche: rankAndTruncate(nichePool, 10),
    general: rankAndTruncate(generalPool, 10),
  };
}
