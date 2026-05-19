import { supabaseAdmin } from '@/lib/instagram';

export type CronName = 'youtube-sync' | 'youtube-sync-longform' | 'instagram-sync' | 'diagnostics-alert';

export type CronStatus = 'success' | 'partial' | 'failed';

export interface CronRunMetadata {
  rows_processed?: number;
  errors?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

// Sentinel returned when the cron_runs table doesn't exist yet (i.e. the
// migration hasn't been applied). All four cron routes call startCronRun on
// entry — without this fallback a deploy that races the migration would 500
// before any work runs. finishCronRun no-ops when given the sentinel.
const NO_TABLE_SENTINEL = 0;

function isMissingRelation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return e.code === '42P01' || /relation .* does not exist/i.test(e.message ?? '');
}

export async function startCronRun(cronName: CronName): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cron_runs')
      .insert({ cron_name: cronName, status: 'running' })
      .select('id')
      .single();
    if (error) {
      if (isMissingRelation(error)) {
        console.warn('[cron-runs] table missing — apply 20260519_cron_runs.sql; tracking disabled until then');
        return NO_TABLE_SENTINEL;
      }
      console.error('[cron-runs] startCronRun error:', error);
      return NO_TABLE_SENTINEL;
    }
    return (data as { id: number }).id;
  } catch (err) {
    if (isMissingRelation(err)) {
      console.warn('[cron-runs] table missing — apply 20260519_cron_runs.sql; tracking disabled until then');
      return NO_TABLE_SENTINEL;
    }
    console.error('[cron-runs] startCronRun threw:', err);
    return NO_TABLE_SENTINEL;
  }
}

export async function finishCronRun(
  id: number,
  status: CronStatus,
  meta: CronRunMetadata = {},
): Promise<void> {
  if (id === NO_TABLE_SENTINEL) return;
  try {
    const { error } = await supabaseAdmin
      .from('cron_runs')
      .update({
        finished_at: new Date().toISOString(),
        status,
        rows_processed: meta.rows_processed ?? null,
        errors: meta.errors ?? 0,
        error_message: meta.error_message?.slice(0, 1000) ?? null,
        metadata: meta.metadata ?? null,
      })
      .eq('id', id);
    if (error) {
      console.error('[cron-runs] finishCronRun error:', error);
    }
  } catch (err) {
    console.error('[cron-runs] finishCronRun threw:', err);
  }
}
