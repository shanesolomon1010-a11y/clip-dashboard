export interface CalibrationEntry {
  category: string;
  title: string;
  duration_sec: number;
  views: number;
  stw_pct: number;
  title_pattern: string;
  notes: string | null;
  display_order: number;
}

export interface DurationBenchmark {
  range_label: string;
  range_min_sec: number | null;
  range_max_sec: number | null;
  avg_views: number;
  avg_stw_pct: number;
  guidance: string;
  is_sweet_spot: boolean;
  display_order: number;
}

export interface TitlePatternStat {
  pattern_label: string;
  clip_count: number;
  avg_views: number;
  avg_stw_pct: number;
  tier_ceiling: string;
  display_order: number;
}

export interface CalibrationData {
  winners: CalibrationEntry[];
  failures: CalibrationEntry[];
  benchmarks: DurationBenchmark[];
  patternStats: TitlePatternStat[];
}
