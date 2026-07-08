import Anthropic from "@anthropic-ai/sdk";

const BLURB_TOOL = {
  name: "submit_blurbs",
  description:
    "Submit a short blurb for each item explaining why it's trending and what hook/format to borrow.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            blurb: { type: "string" },
          },
          required: ["id", "blurb"],
        },
      },
    },
    required: ["items"],
  },
};

function buildPrompt(items) {
  const lines = items
    .map(
      (item) => `id: ${item.id}
platform: ${item.platform}
title/caption: ${item.title}
hashtags: ${item.hashtags.join(", ") || "none"}
views: ${item.stats.views ?? "unknown"}
likes: ${item.stats.likes ?? "unknown"}
sound: ${item.sound_name ?? "unknown"}
surfaced via: ${item.source_query_or_hashtag}`
    )
    .join("\n\n");

  return `You are helping a social media marketer understand why each of the following short-form videos is trending, based only on the metadata below (you have not watched any of the videos). For each item, write 1-2 sentences explaining why it's likely trending and what specific hook, format, or audio the marketer could borrow for their own videos.

${lines}

Call submit_blurbs with one entry per item (matched by id).`;
}

export async function summarizeItems(items, { apiKey }) {
  if (items.length === 0) return new Map();

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    tools: [BLURB_TOOL],
    tool_choice: { type: "tool", name: "submit_blurbs" },
    messages: [{ role: "user", content: buildPrompt(items) }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  const blurbs = new Map();
  for (const entry of toolUse?.input?.items || []) {
    blurbs.set(entry.id, entry.blurb);
  }
  return blurbs;
}
