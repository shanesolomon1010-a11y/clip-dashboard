export type StatusLevel = 'green' | 'yellow' | 'red';

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

// Higher number = worse. Used for hours-since-update, days-since-stat, drift %, null counts.
function thresholdedStatus(
  value: number,
  yellowThreshold: number,
  redThreshold: number,
): StatusLevel {
  if (!isFiniteNumber(value) || value < 0) return 'red';
  if (value >= redThreshold) return 'red';
  if (value >= yellowThreshold) return 'yellow';
  return 'green';
}

export function freshnessStatus(
  hoursAgo: number,
  yellowThreshold: number,
  redThreshold: number,
): StatusLevel {
  return thresholdedStatus(hoursAgo, yellowThreshold, redThreshold);
}

export function driftStatus(
  pctDelta: number,
  yellowThreshold: number,
  redThreshold: number,
): StatusLevel {
  return thresholdedStatus(pctDelta, yellowThreshold, redThreshold);
}

export function statFreshnessStatus(daysAgo: number): StatusLevel {
  if (!isFiniteNumber(daysAgo) || daysAgo < 0) return 'red';
  if (daysAgo >= 5) return 'red';
  if (daysAgo >= 3) return 'yellow';
  return 'green';
}

export function nullCountStatus(count: number): StatusLevel {
  if (!isFiniteNumber(count) || count < 0) return 'red';
  if (count === 0) return 'green';
  if (count <= 5) return 'yellow';
  return 'red';
}

export function scraperRunStatus(runsLast7Days: number): StatusLevel {
  if (!isFiniteNumber(runsLast7Days) || runsLast7Days < 0) return 'red';
  if (runsLast7Days >= 5) return 'green';
  if (runsLast7Days >= 3) return 'yellow';
  return 'red';
}

// Worst-of comparison: aggregate multiple sub-statuses into a single card status.
export function aggregateStatus(...levels: StatusLevel[]): StatusLevel {
  if (levels.includes('red')) return 'red';
  if (levels.includes('yellow')) return 'yellow';
  return 'green';
}
