function kstDateString(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatCount(n) {
  if (n == null) return "?";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function renderCard(item) {
  const el = document.createElement("div");
  el.className = "card";

  const img = document.createElement("img");
  img.src = item.thumbnail_url || "";
  img.alt = item.title || "";
  img.loading = "lazy";
  el.appendChild(img);

  const body = document.createElement("div");
  body.className = "card-body";

  const badge = document.createElement("span");
  badge.className = `badge ${item.platform}`;
  badge.textContent = item.platform;
  body.appendChild(badge);

  const title = document.createElement("p");
  title.className = "card-title";
  title.textContent = item.title || "(untitled)";
  body.appendChild(title);

  const stats = document.createElement("p");
  stats.className = "stat-line";
  stats.textContent = `${formatCount(item.stats.views)} views · ${formatCount(item.stats.likes)} likes`;
  body.appendChild(stats);

  if (item.ai_blurb) {
    const blurb = document.createElement("p");
    blurb.className = "blurb";
    blurb.textContent = item.ai_blurb;
    body.appendChild(blurb);
  }

  const link = document.createElement("a");
  link.className = "card-link";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View original ->";
  body.appendChild(link);

  el.appendChild(body);
  return el;
}

function renderList(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  if (!items || items.length === 0) {
    const msg = document.createElement("p");
    msg.className = "empty-msg";
    msg.textContent = "No items available for this list today.";
    container.appendChild(msg);
    return;
  }
  for (const item of items) {
    container.appendChild(renderCard(item));
  }
}

async function main() {
  const dateBanner = document.getElementById("date-banner");
  const errorBanner = document.getElementById("error-banner");

  try {
    const manifestRes = await fetch("data/manifest.json", { cache: "no-store" });
    if (!manifestRes.ok) throw new Error(`manifest.json HTTP ${manifestRes.status}`);
    const manifest = await manifestRes.json();
    const dates = manifest.dates || [];

    if (dates.length === 0) {
      dateBanner.textContent = "No digest has been generated yet.";
      return;
    }

    const today = kstDateString(new Date());
    const dateToLoad = dates.includes(today) ? today : dates[0];

    const snapshotRes = await fetch(`data/${dateToLoad}.json`, { cache: "no-store" });
    if (!snapshotRes.ok) throw new Error(`${dateToLoad}.json HTTP ${snapshotRes.status}`);
    const snapshot = await snapshotRes.json();

    if (dateToLoad === today) {
      dateBanner.textContent = `Showing ${dateToLoad}`;
    } else {
      dateBanner.textContent = `Today's digest isn't ready yet — showing most recent available: ${dateToLoad}`;
      dateBanner.classList.add("fallback");
    }

    renderList("niche-list", snapshot.niche);
    renderList("general-list", snapshot.general);
  } catch (err) {
    errorBanner.hidden = false;
    errorBanner.textContent = `Couldn't load the digest: ${err.message}`;
    console.error(err);
  }
}

main();
