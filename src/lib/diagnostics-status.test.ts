import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  freshnessStatus,
  driftStatus,
  statFreshnessStatus,
  nullCountStatus,
  scraperRunStatus,
  aggregateStatus,
} from './diagnostics-status.js';

// ---------------------------------------------------------------------------
// freshnessStatus — yellow=12h, red=24h
// ---------------------------------------------------------------------------

test('freshnessStatus: 0 hours → green', () => {
  assert.equal(freshnessStatus(0, 12, 24), 'green');
});

test('freshnessStatus: just under yellow threshold → green', () => {
  assert.equal(freshnessStatus(11.9, 12, 24), 'green');
});

test('freshnessStatus: exactly at yellow threshold → yellow', () => {
  assert.equal(freshnessStatus(12, 12, 24), 'yellow');
});

test('freshnessStatus: between yellow and red → yellow', () => {
  assert.equal(freshnessStatus(18, 12, 24), 'yellow');
});

test('freshnessStatus: exactly at red threshold → red', () => {
  assert.equal(freshnessStatus(24, 12, 24), 'red');
});

test('freshnessStatus: above red threshold → red', () => {
  assert.equal(freshnessStatus(48, 12, 24), 'red');
});

test('freshnessStatus: NaN → red', () => {
  assert.equal(freshnessStatus(NaN, 12, 24), 'red');
});

test('freshnessStatus: negative → red (sentinel for "no data ever")', () => {
  assert.equal(freshnessStatus(-1, 12, 24), 'red');
});

test('freshnessStatus: Infinity → red', () => {
  assert.equal(freshnessStatus(Infinity, 12, 24), 'red');
});

// Threshold collision: yellow == red. Anything >= the shared threshold is red.
test('freshnessStatus: yellow==red, value above → red (red wins)', () => {
  assert.equal(freshnessStatus(20, 10, 10), 'red');
});

test('freshnessStatus: yellow==red, value below → green', () => {
  assert.equal(freshnessStatus(5, 10, 10), 'green');
});

// ---------------------------------------------------------------------------
// driftStatus — yellow=5%, red=10%
// ---------------------------------------------------------------------------

test('driftStatus: 0% drift → green', () => {
  assert.equal(driftStatus(0, 5, 10), 'green');
});

test('driftStatus: just under yellow → green', () => {
  assert.equal(driftStatus(4.99, 5, 10), 'green');
});

test('driftStatus: at yellow → yellow', () => {
  assert.equal(driftStatus(5, 5, 10), 'yellow');
});

test('driftStatus: between yellow and red → yellow', () => {
  assert.equal(driftStatus(7.5, 5, 10), 'yellow');
});

test('driftStatus: at red → red', () => {
  assert.equal(driftStatus(10, 5, 10), 'red');
});

test('driftStatus: way above red → red', () => {
  assert.equal(driftStatus(50, 5, 10), 'red');
});

test('driftStatus: NaN → red', () => {
  assert.equal(driftStatus(NaN, 5, 10), 'red');
});

test('driftStatus: negative → red (drift % is always non-negative; negative means upstream bug)', () => {
  assert.equal(driftStatus(-3, 5, 10), 'red');
});

// ---------------------------------------------------------------------------
// statFreshnessStatus — fixed thresholds (2d=green, 3-4d=yellow, 5d+=red)
// ---------------------------------------------------------------------------

test('statFreshnessStatus: 0 days → green', () => {
  assert.equal(statFreshnessStatus(0), 'green');
});

test('statFreshnessStatus: 2 days → green (YouTube API natural lag)', () => {
  assert.equal(statFreshnessStatus(2), 'green');
});

test('statFreshnessStatus: 3 days → yellow', () => {
  assert.equal(statFreshnessStatus(3), 'yellow');
});

test('statFreshnessStatus: 4 days → yellow', () => {
  assert.equal(statFreshnessStatus(4), 'yellow');
});

test('statFreshnessStatus: 5 days → red', () => {
  assert.equal(statFreshnessStatus(5), 'red');
});

test('statFreshnessStatus: NaN → red', () => {
  assert.equal(statFreshnessStatus(NaN), 'red');
});

test('statFreshnessStatus: negative → red', () => {
  assert.equal(statFreshnessStatus(-2), 'red');
});

// ---------------------------------------------------------------------------
// nullCountStatus — 0=green, 1-5=yellow, 6+=red
// ---------------------------------------------------------------------------

test('nullCountStatus: 0 → green', () => {
  assert.equal(nullCountStatus(0), 'green');
});

test('nullCountStatus: 1 → yellow', () => {
  assert.equal(nullCountStatus(1), 'yellow');
});

test('nullCountStatus: 5 → yellow', () => {
  assert.equal(nullCountStatus(5), 'yellow');
});

test('nullCountStatus: 6 → red', () => {
  assert.equal(nullCountStatus(6), 'red');
});

test('nullCountStatus: NaN → red', () => {
  assert.equal(nullCountStatus(NaN), 'red');
});

test('nullCountStatus: negative → red', () => {
  assert.equal(nullCountStatus(-1), 'red');
});

// ---------------------------------------------------------------------------
// scraperRunStatus — runs in last 7 days (≥5=green, 3-4=yellow, 0-2=red)
// ---------------------------------------------------------------------------

test('scraperRunStatus: 7 → green', () => {
  assert.equal(scraperRunStatus(7), 'green');
});

test('scraperRunStatus: 5 → green', () => {
  assert.equal(scraperRunStatus(5), 'green');
});

test('scraperRunStatus: 4 → yellow', () => {
  assert.equal(scraperRunStatus(4), 'yellow');
});

test('scraperRunStatus: 3 → yellow', () => {
  assert.equal(scraperRunStatus(3), 'yellow');
});

test('scraperRunStatus: 2 → red', () => {
  assert.equal(scraperRunStatus(2), 'red');
});

test('scraperRunStatus: 0 → red', () => {
  assert.equal(scraperRunStatus(0), 'red');
});

test('scraperRunStatus: NaN → red', () => {
  assert.equal(scraperRunStatus(NaN), 'red');
});

test('scraperRunStatus: negative → red', () => {
  assert.equal(scraperRunStatus(-1), 'red');
});

// ---------------------------------------------------------------------------
// aggregateStatus — worst-of combiner
// ---------------------------------------------------------------------------

test('aggregateStatus: all green → green', () => {
  assert.equal(aggregateStatus('green', 'green', 'green'), 'green');
});

test('aggregateStatus: any yellow → yellow', () => {
  assert.equal(aggregateStatus('green', 'yellow', 'green'), 'yellow');
});

test('aggregateStatus: any red beats any yellow', () => {
  assert.equal(aggregateStatus('yellow', 'red', 'green'), 'red');
});

test('aggregateStatus: empty input → green', () => {
  assert.equal(aggregateStatus(), 'green');
});
