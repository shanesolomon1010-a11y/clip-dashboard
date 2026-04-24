import { supabase } from './supabase';

export interface SocialCopyGeneration {
  id: number;
  clip_code: string;
  episode_context: string | null;
  transcript: string;
  additional_notes: string | null;
  headline_banner: string | null;
  question_banner: string | null;
  youtube_title: string | null;
  youtube_description: string | null;
  instagram_caption: string | null;
  raw_response: string | null;
  model_used: string | null;
  tokens_used: number | null;
  created_at: string;
}

export async function saveSocialCopyGeneration(
  row: Omit<SocialCopyGeneration, 'id' | 'created_at'>,
): Promise<number> {
  const { data, error } = await supabase
    .from('social_copy_generations')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function getRecentSocialCopyGenerations(limit = 20): Promise<SocialCopyGeneration[]> {
  const { data, error } = await supabase
    .from('social_copy_generations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SocialCopyGeneration[];
}

export async function getSocialCopyByClipCode(clipCode: string): Promise<SocialCopyGeneration[]> {
  const { data, error } = await supabase
    .from('social_copy_generations')
    .select('*')
    .eq('clip_code', clipCode)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SocialCopyGeneration[];
}

export async function getSocialCopyById(id: number): Promise<SocialCopyGeneration | null> {
  const { data, error } = await supabase
    .from('social_copy_generations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as SocialCopyGeneration | null;
}
