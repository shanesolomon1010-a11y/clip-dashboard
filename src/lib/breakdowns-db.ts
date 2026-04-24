import { supabase } from './supabase';

export interface BreakdownAggregate {
  dimension_value: string;
  total_views: number;
  total_watch_time_minutes: number;
}

export async function getBreakdownTotals(
  dimensionType: string,
  platform: string = 'youtube',
  startDate?: string,
  endDate?: string,
  latestOnly?: boolean,
): Promise<BreakdownAggregate[]> {
  let statDate: string | undefined;

  if (latestOnly) {
    const { data: peak } = await supabase
      .from('post_breakdowns')
      .select('stat_date')
      .eq('platform', platform)
      .eq('dimension_type', dimensionType)
      .order('stat_date', { ascending: false })
      .limit(1);
    statDate = (peak?.[0]?.stat_date as string | undefined);
    if (!statDate) return [];
  }

  let query = supabase
    .from('post_breakdowns')
    .select('dimension_value, views, watch_time_minutes')
    .eq('platform', platform)
    .eq('dimension_type', dimensionType);

  if (statDate) {
    query = query.eq('stat_date', statDate);
  } else {
    if (startDate) query = query.gte('stat_date', startDate);
    if (endDate)   query = query.lte('stat_date', endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Client-side aggregation: sum views and watch_time_minutes by dimension_value
  const map = new Map<string, { views: number; watchTime: number }>();
  for (const row of data ?? []) {
    const key = row.dimension_value as string;
    const prev = map.get(key);
    if (prev) {
      prev.views     += Number(row.views ?? 0);
      prev.watchTime += Number(row.watch_time_minutes ?? 0);
    } else {
      map.set(key, { views: Number(row.views ?? 0), watchTime: Number(row.watch_time_minutes ?? 0) });
    }
  }

  return Array.from(map.entries())
    .map(([dimension_value, agg]) => ({
      dimension_value,
      total_views: agg.views,
      total_watch_time_minutes: agg.watchTime,
    }))
    .sort((a, b) => b.total_views - a.total_views);
}
