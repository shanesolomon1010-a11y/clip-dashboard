export type Platform = 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'linkedin' | 'twitter';

export interface PlatformSubScore {
  label: string;
  score: number;
  weight: number;
  note: string;
}

export interface PlatformScore {
  platform: Platform;
  score: number;
  delta: number;
  summary: string;
  breakdown: PlatformSubScore[];
  topStrength: string;
  topWeakness: string;
  recommendation: string;
}

export interface ScriptAnalysis {
  overallScore: number;
  platformScores: PlatformScore[];
  scriptLength: 'too_short' | 'ideal' | 'too_long';
  estimatedDuration: string;
  hookRating: 'weak' | 'moderate' | 'strong' | 'excellent';
  ctaPresent: boolean;
}
