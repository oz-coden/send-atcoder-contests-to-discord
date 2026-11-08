/**
 * Sends upcoming AtCoder contest announcements to a Discord webhook.
 * Set WEBHOOK_URL before enabling an hourly Apps Script trigger.
 */
const CONFIG = Object.freeze({
  WEBHOOK_URL: "YOUR_DISCORD_WEBHOOK_URL",
  ATCODER_URL: "https://atcoder.jp/contests/?lang=en",
  TIMEZONE: "Asia/Tokyo",
  REMINDER_MINUTES: 120,
  // Empty array includes all contests listed in the upcoming section.
  // Examples: ["abc", "arc", "agc", "ahc"] or ["abc", "ahc"].
  CONTEST_PREFIXES: [],
});

const STATE_KEY = "ATCODER_NOTIFICATION_STATE_V1";

/**
 * Assign this function to an hourly time-driven trigger.
 * On its first execution it records existing upcoming contests without notifying.
 */
function checkAtCoderContests() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.log("Skipped: another watcher execution is running.");
    return;
  }
  try {
    const html = UrlFetchApp.fetch(CONFIG.ATCODER_URL, {
      muteHttpExceptions: true,
      headers: { "User-Agent": "AtCoderContestDiscordNotifier/1.0" },
    });
    if (html.getResponseCode() !== 200) {
      throw new Error("AtCoder returned HTTP " + html.getResponseCode());
    }

    const contests = parseUpcomingContests_(html.getContentText("UTF-8"));
    const properties = PropertiesService.getScriptProperties();
    const serialized = properties.getProperty(STATE_KEY);
    const state = serialized ? JSON.parse(serialized) : {
      announced: {},
      dayNotified: {},
      reminded: {},
    };

    if (!serialized) {
      contests.forEach(function (contest) {
        state.announced[contest.id] = true;
      });
      properties.setProperty(STATE_KEY, JSON.stringify(state));
      console.log("Initialized state with " + contests.length + " upcoming contests; no messages sent.");
      return;
    }

    const now = Date.now();
    contests.sort(function (a, b) { return a.startMs - b.startMs; });
    const today = Utilities.formatDate(new Date(now), CONFIG.TIMEZONE, "yyyy-MM-dd");
    const url = CONFIG.WEBHOOK_URL;
    const messages = [];

    contests.forEach(function (contest) {
      if (contest.startMs <= now) return;
      const startDate = new Date(contest.startMs);
      const date = Utilities.formatDate(startDate, CONFIG.TIMEZONE, "yyyy-MM-dd");
      const displayDate = Utilities.formatDate(startDate, CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm");
      const basic = "**" + contest.name + "**\n" + displayDate + " JST\n" + contest.url;

      if (!state.announced[contest.id]) {
        messages.push({ type: "announced", id: contest.id, text: "📢 **New AtCoder contest**\n" + basic });
      }
      if (date === today && !state.dayNotified[contest.id]) {
        messages.push({ type: "dayNotified", id: contest.id, text: "📅 **AtCoder contest today**\n" + basic });
      }
      const remaining = (contest.startMs - now) / 60000;
      if (remaining > 0 && remaining <= CONFIG.REMINDER_MINUTES && !state.reminded[contest.id]) {
        messages.push({
          type: "reminded", id: contest.id,
          text: "⏰ **AtCoder contest starts in about " + Math.ceil(remaining) + " minutes**\n" + basic,
        });
      }
    });

    messages.forEach(function (message) {
      if (!url || url === "YOUR_DISCORD_WEBHOOK_URL") {
        throw new Error("Set CONFIG.WEBHOOK_URL before sending notifications.");
      }
      sendDiscord_(url, message.text);
      state[message.type][message.id] = true;
      // Persist after each successful send; a later failure cannot discard progress.
      properties.setProperty(STATE_KEY, JSON.stringify(state));
    });

    console.log("Checked " + contests.length + " upcoming contests; sent " + messages.length + " notifications.");
  } finally {
    lock.releaseLock();
  }
}

function parseUpcomingContests_(html) {
  const section = html.match(/id=["']contest-table-upcoming["'][\s\S]*?<\/table>/i);
  if (!section) throw new Error("Upcoming contest table not found. AtCoder HTML may have changed.");

  const rows = section[0].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const contests = [];
  rows.forEach(function (row) {
    const contestMatch = row.match(/<a\b[^>]*href=["']\/contests\/([a-z0-9_-]+)(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/i);
    const timeMatch = row.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i);
    if (!contestMatch || !timeMatch) return;
    const id = contestMatch[1].toLowerCase();
    if (CONFIG.CONTEST_PREFIXES.length && !CONFIG.CONTEST_PREFIXES.some(function (prefix) {
      return id.indexOf(prefix.toLowerCase()) === 0;
    })) return;

    let timestamp = timeMatch[1].trim().replace(" ", "T");
    // Normalize offsets such as +0900 to +09:00.
    timestamp = timestamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    const startMs = Date.parse(timestamp);
    if (!Number.isFinite(startMs)) throw new Error("Invalid contest time for " + id);

    const name = decodeHtml_(contestMatch[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    contests.push({ id: id, name: name, startMs: startMs, url: "https://atcoder.jp/contests/" + id });
  });
  if (rows.length && !contests.length && !CONFIG.CONTEST_PREFIXES.length) {
    throw new Error("No contests could be parsed from upcoming rows; check HTML structure.");
  }
  return contests;
}

function decodeHtml_(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, function (entity) {
    return { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " }[entity];
  });
}

function sendDiscord_(webhookUrl, text) {
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Discord returned HTTP " + response.getResponseCode());
  }
}

/** Clears notification history; the next run will initialize without sending. */
function resetNotificationState() {
  PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
}
