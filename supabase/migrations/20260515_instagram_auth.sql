-- 20260515_instagram_auth.sql
-- Single-row source-of-truth for the Instagram Graph API long-lived access token.
-- Mirrors the implicit youtube_auth table shape (created out-of-band, see
-- src/app/api/auth/callback/route.ts:35-61 for the reference pattern).
--
-- Why a table instead of an env var:
--   IG long-lived tokens are valid for 60 days and refreshable in-place
--   (POST /refresh_access_token rotates the token). The refresh writes back to
--   this row; an env var would require a Vercel redeploy on every refresh.
--
-- Why single-row:
--   v1 supports only the matteo.mediabuyer account. Multi-account would be a
--   future migration to a keyed schema (per_account_id, etc.). For now we
--   enforce single-row via application code (no business key), not a
--   constraint, to match the youtube_auth pattern.
--
-- Why no refresh_token column:
--   IG's "refresh" is a token rotation against the existing long-lived token
--   (grant_type=ig_refresh_token), not a separate refresh-token grant like
--   OAuth2. Only one token lives here; refresh replaces it.

CREATE TABLE IF NOT EXISTS instagram_auth (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token  text NOT NULL,
  token_expiry  timestamptz NOT NULL,
  ig_user_id    text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
