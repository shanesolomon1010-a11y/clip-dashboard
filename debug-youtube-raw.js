#!/usr/bin/env node
/**
 * Debug: print raw YouTube Analytics API response for video 6dMQ7EyATRU
 * Usage: YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... YOUTUBE_REFRESH_TOKEN=... node debug-youtube-raw.js
 */

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing env vars: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN');
  process.exit(1);
}

const VIDEO_ID = '6dMQ7EyATRU';
const endDate   = new Date().toISOString().split('T')[0];
const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

async function run() {
  // 1. Get access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    console.error('Failed to get access token:', JSON.stringify(tokenData, null, 2));
    process.exit(1);
  }
  console.log('✅ Access token obtained\n');

  // 2. Hit Analytics API
  const metrics = [
    'views',
    'likes',
    'dislikes',
    'comments',
    'shares',
    'estimatedMinutesWatched',
    'averageViewDuration',
    'averageViewPercentage',
    'subscribersGained',
    'subscribersLost',
  ].join(',');

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids',        'channel==MINE');
  url.searchParams.set('startDate',  startDate);
  url.searchParams.set('endDate',    endDate);
  url.searchParams.set('metrics',    metrics);
  url.searchParams.set('dimensions', 'day');
  url.searchParams.set('filters',    `video==${VIDEO_ID}`);

  console.log('Request URL:', url.toString(), '\n');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const data = await res.json();

  console.log('HTTP status:', res.status);
  console.log('\nRaw response:');
  console.log(JSON.stringify(data, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
