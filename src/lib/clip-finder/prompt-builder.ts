import { getClipFinderCalibration } from './calibration';
import { CLIP_FINDER_SKELETON } from './skeleton-prompt';
import type {
  CalibrationEntry,
  DurationBenchmark,
  TitlePatternStat,
} from './types';

const DURATION_NOTE =
  'The Under 20s bucket has risen sharply (from 193 to 290 avg views) due to the identity-threat clips performing well at short durations. This does NOT mean all short clips work — it means short clips with identity-threat titles work. Short clips with process or educational titles still underperform.';

function formatViews(n: number): string {
  return n.toLocaleString('en-US');
}

function formatStw(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatDuration(seconds: number): string {
  return `${seconds}s`;
}

function todayLong(): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function patternColumn(entry: CalibrationEntry): string {
  return entry.notes ? `${entry.title_pattern}. ${entry.notes}` : entry.title_pattern;
}

function buildCalibrationTable(rows: CalibrationEntry[], patternHeader: string): string {
  const header = `| Title | Duration | Views | StW% | ${patternHeader} |`;
  const sep = '|---|---|---|---|---|';
  const body = rows
    .map(
      (r) =>
        `| ${r.title} | ${formatDuration(r.duration_sec)} | ${formatViews(r.views)} | ${formatStw(r.stw_pct)} | ${patternColumn(r)} |`,
    )
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

function buildDurationBenchmarksSection(benchmarks: DurationBenchmark[], totalClips: number): string {
  const header = `### Duration benchmarks (from ${totalClips} videos, updated ${todayLong()})`;
  const tableHeader = '| Duration range | Avg views | Avg StW% | Guidance |';
  const sep = '|---|---|---|---|';
  const body = benchmarks
    .map((b) => {
      const range = b.is_sweet_spot ? `**${b.range_label}**` : b.range_label;
      const views = b.is_sweet_spot ? `**${formatViews(b.avg_views)}**` : formatViews(b.avg_views);
      const stw = b.is_sweet_spot ? `**${formatStw(b.avg_stw_pct)}**` : formatStw(b.avg_stw_pct);
      return `| ${range} | ${views} | ${stw} | ${b.guidance} |`;
    })
    .join('\n');
  return `${header}\n\n${tableHeader}\n${sep}\n${body}\n\n**NOTE:** ${DURATION_NOTE}`;
}

function tierCeilingCell(stat: TitlePatternStat): string {
  if (stat.pattern_label === 'Identity threat / call-out') {
    return '**Tier A — strongest repeatable pattern on the channel**';
  }
  if (stat.tier_ceiling === 'B') return '**Tier B max**';
  return `Tier ${stat.tier_ceiling}`;
}

function buildTitlePatternRankingsSection(stats: TitlePatternStat[], totalClips: number): string {
  const header = `### Title pattern performance rankings (from ${totalClips} videos, updated ${todayLong()})`;
  const tableHeader = '| Title pattern | # of clips | Avg views | Avg StW% | Tier ceiling |';
  const sep = '|---|---|---|---|---|';
  const body = stats
    .map(
      (s) =>
        `| ${s.pattern_label} | ${s.clip_count} | ${formatViews(s.avg_views)} | ${formatStw(s.avg_stw_pct)} | ${tierCeilingCell(s)} |`,
    )
    .join('\n');
  return `${header}\n\n${tableHeader}\n${sep}\n${body}`;
}

export async function buildClipFinderPrompt(): Promise<string> {
  const cal = await getClipFinderCalibration();
  const totalClips = cal.winners.length + cal.failures.length;

  const winnersTable = buildCalibrationTable(cal.winners, 'Pattern');
  const failuresTable = buildCalibrationTable(cal.failures, 'Pattern (DO NOT REPLICATE)');
  const durationSection = buildDurationBenchmarksSection(cal.benchmarks, totalClips);
  const patternSection = buildTitlePatternRankingsSection(cal.patternStats, totalClips);

  return CLIP_FINDER_SKELETON
    .replace('{{PROVEN_WINNERS_TABLE}}', winnersTable)
    .replace('{{PROVEN_FAILURES_TABLE}}', failuresTable)
    .replace('{{DURATION_BENCHMARKS_SECTION}}', durationSection)
    .replace('{{TITLE_PATTERN_RANKINGS_SECTION}}', patternSection);
}
