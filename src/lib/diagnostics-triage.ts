import { supabaseAdmin } from '@/lib/instagram';
import type { DiagnosticsResponse } from '@/lib/diagnostics';
import { TRIAGE_SYSTEM_PROMPT, DIAGNOSTICS_PLAYBOOK } from '@/lib/diagnostics-playbook';

// Same model the Founder Report / Weekly Report use. Server-side call mirrors
// the raw-fetch shape of src/app/api/ai-proxy/route.ts and reuses the existing
// ANTHROPIC_API_KEY — no new secret.
const TRIAGE_MODEL = 'claude-sonnet-4-20250514';
const TRIAGE_MAX_TOKENS = 1024;
// Abort the Anthropic call well inside the route's maxDuration=60. A hung fetch
// is not a throw, so without this it could burn the whole budget and get the
// function killed before the raw RED alert posts — defeating the alert.
const TRIAGE_FETCH_TIMEOUT_MS = 15000;

// Top-level diagnostics groups always included for context even when green, so
// the model can distinguish e.g. a dropped YT tick from a real failure (a RED
// freshness needs cron_completion + cron_runs history to tell them apart).
const ALWAYS_INCLUDE: readonly string[] = [
  'cron_health',
  'data_freshness',
  'cron_completion',
  'schema_integrity',
];

const CRON_NAMES: readonly string[] = [
  'youtube-sync',
  'youtube-sync-longform',
  'instagram-sync',
  'diagnostics-alert',
];

interface CronRunRow {
  cron_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_processed: number | null;
  errors: number | null;
  error_message: string | null;
}

// Last ~10 cron_runs per cron (read-only). Bounded per cron to cap tokens.
async function recentCronRuns(): Promise<Record<string, CronRunRow[]>> {
  const out: Record<string, CronRunRow[]> = {};
  await Promise.all(
    CRON_NAMES.map(async (name) => {
      const { data } = await supabaseAdmin
        .from('cron_runs')
        .select('cron_name, started_at, finished_at, status, rows_processed, errors, error_message')
        .eq('cron_name', name)
        .order('started_at', { ascending: false })
        .limit(10);
      out[name] = (data ?? []) as CronRunRow[];
    }),
  );
  return out;
}

// Selects only the RED groups plus the always-include context groups from the
// full diagnostics payload, so the model isn't sent the entire response.
function selectContext(
  diagnostics: DiagnosticsResponse,
  redPaths: string[],
): Record<string, unknown> {
  const groups = new Set<string>(ALWAYS_INCLUDE);
  for (const p of redPaths) groups.add(p.split('.')[0]);

  const full = diagnostics as unknown as Record<string, unknown>;
  const ctx: Record<string, unknown> = {};
  groups.forEach((g) => {
    if (g in full) ctx[g] = full[g];
  });

  // drift_check.by_clip can be long; cap it so the context stays bounded.
  const drift = ctx['drift_check'] as { by_clip?: unknown[] } | undefined;
  if (drift && Array.isArray(drift.by_clip) && drift.by_clip.length > 10) {
    ctx['drift_check'] = { ...drift, by_clip: drift.by_clip.slice(0, 10) };
  }
  return ctx;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicTextBlock[];
}

// Produces a plain-English root-cause triage for the current RED diagnostics.
// Returns the triage text, or null on ANY failure — the triage is an
// enhancement, never a critical path, so the caller falls back to the raw RED
// post when this returns null. ADVISORY ONLY: reads diagnostics + cron_runs,
// writes nothing.
export async function runDiagnosticsTriage(
  diagnostics: DiagnosticsResponse,
  redPaths: string[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const cronRuns = await recentCronRuns();
    const context = {
      red_paths: redPaths,
      diagnostics: selectContext(diagnostics, redPaths),
      recent_cron_runs: cronRuns,
    };

    const userMessage =
      `${DIAGNOSTICS_PLAYBOOK}\n\n` +
      `Here is the current RED diagnostics context as JSON. Triage it per your instructions.\n\n` +
      `\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;

    // Hard timeout: abort the fetch after TRIAGE_FETCH_TIMEOUT_MS so a hang can
    // never suppress the alert. An abort throws AbortError into the outer catch,
    // which returns null (the existing fallback). clearTimeout runs in finally.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRIAGE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: TRIAGE_MODEL,
          max_tokens: TRIAGE_MAX_TOKENS,
          system: TRIAGE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) return null;
      const data = (await res.json()) as AnthropicResponse;
      const text = (data.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('\n')
        .trim();
      return text.length > 0 ? text : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}
