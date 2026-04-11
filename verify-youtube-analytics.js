#!/usr/bin/env node
/**
 * Verify YouTube Analytics API OAuth connection
 * Usage: node verify-youtube-analytics.js
 *
 * Required env vars (or edit the constants below):
 *   YOUTUBE_CLIENT_ID
 *   YOUTUBE_CLIENT_SECRET
 *   YOUTUBE_REFRESH_TOKEN
 */

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN || "YOUR_REFRESH_TOKEN";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    console.error("❌ Failed to get access token:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("✅ Access token obtained successfully");
  return data.access_token;
}

async function verifyAnalyticsAccess(accessToken) {
  // Fetch the last 7 days of basic channel stats
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const startDate = weekAgo.toISOString().split("T")[0];
  const endDate = today.toISOString().split("T")[0];

  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("metrics", "views,estimatedMinutesWatched,subscribersGained");
  url.searchParams.set("dimensions", "day");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("❌ YouTube Analytics API call failed:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("✅ YouTube Analytics API is connected and returning data\n");
  console.log(`Date range: ${startDate} → ${endDate}`);
  console.log(`Rows returned: ${data.rowCount ?? 0}\n`);

  if (data.rows && data.rows.length > 0) {
    console.log("Sample data (date | views | minutes watched | subs gained):");
    data.rows.slice(0, 5).forEach((row) => {
      console.log(`  ${row[0]}  |  ${row[1]} views  |  ${row[2]} min  |  +${row[3]} subs`);
    });
  } else {
    console.log("No rows returned — channel may have no activity in this window.");
  }
}

(async () => {
  console.log("🔍 Verifying YouTube Analytics API connection...\n");

  if (
    CLIENT_ID === "YOUR_CLIENT_ID" ||
    CLIENT_SECRET === "YOUR_CLIENT_SECRET" ||
    REFRESH_TOKEN === "YOUR_REFRESH_TOKEN"
  ) {
    console.error(
      "⚠️  Missing credentials. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN as env vars, or edit the constants at the top of this file."
    );
    process.exit(1);
  }

  const accessToken = await getAccessToken();
  await verifyAnalyticsAccess(accessToken);
})();
