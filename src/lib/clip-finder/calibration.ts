import { supabase } from '@/lib/supabase';
import type {
  CalibrationData,
  CalibrationEntry,
  DurationBenchmark,
  TitlePatternStat,
} from './types';

export async function getClipFinderCalibration(): Promise<CalibrationData> {
  const [calibrationRes, benchmarksRes, patternStatsRes] = await Promise.all([
    supabase
      .from('clip_finder_calibration')
      .select('category, title, duration_sec, views, stw_pct, title_pattern, notes, display_order')
      .order('display_order', { ascending: true }),
    supabase
      .from('clip_finder_duration_benchmarks')
      .select('range_label, range_min_sec, range_max_sec, avg_views, avg_stw_pct, guidance, is_sweet_spot, display_order')
      .order('display_order', { ascending: true }),
    supabase
      .from('clip_finder_title_pattern_stats')
      .select('pattern_label, clip_count, avg_views, avg_stw_pct, tier_ceiling, display_order')
      .order('display_order', { ascending: true }),
  ]);

  if (calibrationRes.error) throw calibrationRes.error;
  if (benchmarksRes.error) throw benchmarksRes.error;
  if (patternStatsRes.error) throw patternStatsRes.error;

  const calibrationRows = (calibrationRes.data ?? []) as CalibrationEntry[];
  const winners = calibrationRows.filter((r) => r.category === 'proven_winner');
  const failures = calibrationRows.filter((r) => r.category === 'proven_failure');

  return {
    winners,
    failures,
    benchmarks: (benchmarksRes.data ?? []) as DurationBenchmark[],
    patternStats: (patternStatsRes.data ?? []) as TitlePatternStat[],
  };
}
