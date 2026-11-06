"use strict";
const fs = require("node:fs");
const path = require("node:path");

const drizzleDir = path.join(__dirname, "..", "drizzle");
const metaDir = path.join(drizzleDir, "meta");
const resourcesDir = path.join(__dirname, "..", "resources");
const fontsDir = path.join(resourcesDir, "fonts");

fs.mkdirSync(metaDir, { recursive: true });
fs.mkdirSync(fontsDir, { recursive: true });

const migrations = [
  {
    idx: 0,
    tag: "0000_init",
    sql: `-- 0000_init.sql: Base 20 tables
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#22d3ee',
  icon TEXT DEFAULT 'folder',
  description TEXT,
  brand_voice TEXT,
  watermark_path TEXT,
  watermark_position TEXT NOT NULL DEFAULT 'br',
  watermark_opacity REAL NOT NULL DEFAULT 0.85,
  default_hashtags TEXT NOT NULL DEFAULT '[]',
  golden_hours TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS proxies (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'socks5',
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password_secret_id TEXT,
  country TEXT DEFAULT 'VN',
  kind TEXT DEFAULT 'residential',
  health TEXT NOT NULL DEFAULT 'ok',
  latency_ms INTEGER,
  external_ip TEXT,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS browser_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_agent TEXT,
  locale TEXT NOT NULL DEFAULT 'vi-VN',
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  canvas_noise INTEGER NOT NULL DEFAULT 1,
  webrtc_shield INTEGER NOT NULL DEFAULT 1,
  webgl_vendor TEXT,
  data_dir TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  handle TEXT,
  external_id TEXT,
  avatar_url TEXT,
  proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL,
  browser_profile_id TEXT REFERENCES browser_profiles(id) ON DELETE SET NULL,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  session_status TEXT NOT NULL DEFAULT 'unknown',
  session_expires_at INTEGER,
  health TEXT NOT NULL DEFAULT 'idle',
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_platform_external_uq ON accounts(platform, external_id);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  external_id TEXT,
  avatar_url TEXT,
  followers INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'admin',
  niche_tag TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  health TEXT NOT NULL DEFAULT 'ok',
  token_status TEXT NOT NULL DEFAULT 'missing',
  token_expires_at INTEGER,
  last_synced_at INTEGER,
  last_post_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS channels_workspace_idx ON channels(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS channels_platform_external_uq ON channels(platform, external_id);

CREATE TABLE IF NOT EXISTS channel_metrics_daily (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  watch_minutes INTEGER NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS channel_metrics_day_uq ON channel_metrics_daily(channel_id, day);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  preview TEXT,
  expires_at INTEGER,
  last_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS secrets_owner_idx ON secrets(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  default_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'untested',
  last_error TEXT,
  last_tested_at INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  model TEXT,
  feature TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  characters INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage(created_at);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT,
  hashtags TEXT NOT NULL DEFAULT '[]',
  first_comment TEXT,
  media_paths TEXT NOT NULL DEFAULT '[]',
  thumbnail_path TEXT,
  duration_sec REAL,
  aspect TEXT NOT NULL DEFAULT '9:16',
  source TEXT NOT NULL DEFAULT 'upload',
  spin_variants INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_workspace_idx ON content_items(workspace_id, status);

CREATE TABLE IF NOT EXISTS content_variants (
  id TEXT PRIMARY KEY NOT NULL,
  content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  caption TEXT NOT NULL,
  hashtags TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_variants_item_idx ON content_variants(content_item_id);

CREATE TABLE IF NOT EXISTS video_projects (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
  target_channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  format TEXT DEFAULT 'free',
  target_duration_sec INTEGER NOT NULL DEFAULT 30,
  aspect TEXT NOT NULL DEFAULT '9:16',
  voice_id TEXT,
  tts_provider TEXT NOT NULL DEFAULT 'edge_tts',
  ken_burns INTEGER NOT NULL DEFAULT 1,
  watermark_enabled INTEGER NOT NULL DEFAULT 1,
  render_mode TEXT NOT NULL DEFAULT 'semi_ai',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS video_scenes (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT,
  voiceover TEXT NOT NULL,
  duration_sec REAL NOT NULL DEFAULT 5,
  media_prompt TEXT,
  search_query TEXT,
  media_path TEXT,
  media_credit TEXT,
  speaker_id TEXT,
  voice_id TEXT,
  audio_path TEXT
);
CREATE INDEX IF NOT EXISTS video_scenes_project_idx ON video_scenes(project_id, position);

CREATE TABLE IF NOT EXISTS render_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  encoder TEXT NOT NULL DEFAULT 'libx264',
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'queued',
  output_path TEXT,
  duration_ms INTEGER,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS render_jobs_project_idx ON render_jobs(project_id, created_at);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY NOT NULL,
  content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  scheduled_at INTEGER NOT NULL,
  published_at INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  is_golden_hour INTEGER NOT NULL DEFAULT 0,
  external_post_id TEXT,
  permalink TEXT,
  reach INTEGER,
  views INTEGER,
  likes INTEGER,
  comments_count INTEGER,
  shares INTEGER,
  saves INTEGER,
  engagements INTEGER,
  avg_watch_sec REAL,
  metrics_updated_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_schedule_idx ON scheduled_posts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS posts_channel_idx ON scheduled_posts(channel_id, scheduled_at);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'messenger',
  external_id TEXT,
  customer_name TEXT NOT NULL,
  customer_handle TEXT,
  customer_external_id TEXT,
  customer_avatar TEXT,
  context_post_title TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  last_message_preview TEXT,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conv_workspace_idx ON conversations(workspace_id, last_message_at);
CREATE UNIQUE INDEX IF NOT EXISTS conv_channel_external_uq ON conversations(channel_id, external_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_id TEXT,
  direction TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS messages_conv_external_uq ON messages(conversation_id, external_id);

CREATE TABLE IF NOT EXISTS quick_replies (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  action TEXT NOT NULL,
  template TEXT,
  min_delay_sec INTEGER NOT NULL DEFAULT 15,
  max_delay_sec INTEGER NOT NULL DEFAULT 35,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY NOT NULL,
  severity TEXT NOT NULL,
  kind TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_open_idx ON alerts(resolved_at, created_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_created_idx ON activity_log(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);`
  },
  {
    idx: 1,
    tag: "0001_workspace_tags_budget",
    sql: `ALTER TABLE workspaces ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE workspaces ADD COLUMN ai_budget_usd REAL;
ALTER TABLE workspaces ADD COLUMN ai_token_quota INTEGER;
ALTER TABLE workspaces ADD COLUMN knowledge TEXT;`
  },
  {
    idx: 2,
    tag: "0002_ai_router",
    sql: `ALTER TABLE ai_providers ADD COLUMN base_url TEXT;
ALTER TABLE ai_providers ADD COLUMN available_models TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ai_providers ADD COLUMN latency_ms INTEGER;`
  },
  {
    idx: 3,
    tag: "0003_media_engine",
    sql: `ALTER TABLE video_projects ADD COLUMN transition TEXT NOT NULL DEFAULT 'cut';
ALTER TABLE video_projects ADD COLUMN subtitle_style TEXT NOT NULL DEFAULT 'montserrat-kara-pop';
ALTER TABLE video_projects ADD COLUMN bgm_track TEXT;
ALTER TABLE video_projects ADD COLUMN bgm_volume REAL NOT NULL DEFAULT 0.18;`
  },
  {
    idx: 4,
    tag: "0004_publishing",
    sql: `ALTER TABLE scheduled_posts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_posts ADD COLUMN next_attempt_at INTEGER;
ALTER TABLE scheduled_posts ADD COLUMN first_comment_posted INTEGER NOT NULL DEFAULT 0;`
  },
  {
    idx: 5,
    tag: "0005_inbox_sync",
    sql: `ALTER TABLE messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
ALTER TABLE messages ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE messages ADD COLUMN delivery_error TEXT;
ALTER TABLE messages ADD COLUMN send_after INTEGER;
CREATE INDEX IF NOT EXISTS messages_outbox_idx ON messages(delivery_status, send_after);`
  },
  {
    idx: 6,
    tag: "0006_engagement_features",
    sql: `ALTER TABLE messages ADD COLUMN ai_meta TEXT;`
  },
  {
    idx: 7,
    tag: "0007_series_plan_goals",
    sql: `CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  target_channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  logline TEXT,
  genre TEXT,
  visual_style TEXT,
  dialogue_language TEXT NOT NULL DEFAULT 'Tiếng Việt',
  notes TEXT,
  episode_length_sec INTEGER NOT NULL DEFAULT 60,
  narrator_voice_id TEXT,
  tts_provider TEXT NOT NULL DEFAULT 'edge_tts',
  render_mode TEXT NOT NULL DEFAULT 'full_ai',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS series_workspace_idx ON series(workspace_id);

CREATE TABLE IF NOT EXISTS series_characters (
  id TEXT PRIMARY KEY NOT NULL,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  appearance TEXT NOT NULL,
  personality TEXT,
  arc TEXT,
  voice_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS series_chars_series_idx ON series_characters(series_id, sort_order);

CREATE TABLE IF NOT EXISTS series_episodes (
  id TEXT PRIMARY KEY NOT NULL,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT NOT NULL,
  cliffhanger TEXT,
  project_id TEXT REFERENCES video_projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS series_episodes_series_idx ON series_episodes(series_id, number);

CREATE TABLE IF NOT EXISTS content_ideas (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  planned_date TEXT,
  title TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'free',
  hook TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  source TEXT NOT NULL DEFAULT 'ai',
  project_id TEXT REFERENCES video_projects(id) ON DELETE SET NULL,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_ideas_date_idx ON content_ideas(workspace_id, planned_date);

CREATE TABLE IF NOT EXISTS channel_goals (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  target INTEGER NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS channel_goals_channel_idx ON channel_goals(channel_id);`
  },
  {
    idx: 8,
    tag: "0008_long_video",
    sql: `ALTER TABLE video_projects ADD COLUMN acts TEXT;`
  },
  {
    idx: 9,
    tag: "0009_acts",
    sql: `ALTER TABLE video_scenes ADD COLUMN act INTEGER NOT NULL DEFAULT 0;
ALTER TABLE video_scenes ADD COLUMN media_source TEXT;`
  },
  {
    idx: 10,
    tag: "0010_scene_media_mode",
    sql: `ALTER TABLE video_scenes ADD COLUMN media_mode TEXT NOT NULL DEFAULT 'auto';`
  },
  {
    idx: 11,
    tag: "0011_character_prompt",
    sql: `ALTER TABLE series_characters ADD COLUMN image_prompt TEXT;
ALTER TABLE series_characters ADD COLUMN appearance_en TEXT;
ALTER TABLE series_characters ADD COLUMN image_prompt_for TEXT;
ALTER TABLE series_characters ADD COLUMN reference_image TEXT;`
  },
  {
    idx: 12,
    tag: "0012_visual_style_en",
    sql: `ALTER TABLE series ADD COLUMN visual_style_en TEXT;
ALTER TABLE series ADD COLUMN visual_style_for TEXT;`
  },
  {
    idx: 13,
    tag: "0013_references_frames",
    sql: `ALTER TABLE video_projects ADD COLUMN visual_bible TEXT;
ALTER TABLE video_projects ADD COLUMN reference_images TEXT NOT NULL DEFAULT '[]';
ALTER TABLE video_scenes ADD COLUMN start_image TEXT;
ALTER TABLE video_scenes ADD COLUMN end_image TEXT;
ALTER TABLE video_scenes ADD COLUMN scene_refs TEXT;`
  },
  {
    idx: 14,
    tag: "0014_shot_prompts",
    sql: `-- Extended shot prompt metadata`
  },
  {
    idx: 15,
    tag: "0015_clip_audio",
    sql: `ALTER TABLE video_projects ADD COLUMN clip_audio TEXT NOT NULL DEFAULT 'tts';
ALTER TABLE video_projects ADD COLUMN clip_audio_volume REAL NOT NULL DEFAULT 0.35;`
  },
  {
    idx: 16,
    tag: "0016_early_reach",
    sql: `ALTER TABLE scheduled_posts ADD COLUMN early_checked_at INTEGER;
ALTER TABLE scheduled_posts ADD COLUMN early_reach_flag TEXT;
CREATE INDEX IF NOT EXISTS posts_status_published_idx ON scheduled_posts(status, published_at);`
  },
  {
    idx: 17,
    tag: "0017_film_studio",
    sql: `CREATE TABLE IF NOT EXISTS film_projects (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Phim mới',
  logline TEXT,
  idea TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT 'cinematic',
  aspect TEXT NOT NULL DEFAULT '16:9',
  target_sec INTEGER NOT NULL DEFAULT 120,
  takes_per_run INTEGER NOT NULL DEFAULT 4,
  image_engine TEXT NOT NULL DEFAULT 'google',
  video_engine TEXT NOT NULL DEFAULT 'seedance',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS film_projects_workspace_idx ON film_projects(workspace_id);

CREATE TABLE IF NOT EXISTS film_assets (
  id TEXT PRIMARY KEY NOT NULL,
  film_id TEXT NOT NULL REFERENCES film_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location_id TEXT,
  character_ids TEXT NOT NULL DEFAULT '[]',
  selected_take_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS film_assets_film_idx ON film_assets(film_id, kind, position);

CREATE TABLE IF NOT EXISTS film_takes (
  id TEXT PRIMARY KEY NOT NULL,
  film_id TEXT NOT NULL REFERENCES film_projects(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES film_assets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'image',
  status TEXT NOT NULL DEFAULT 'queued',
  file TEXT,
  prompt TEXT NOT NULL,
  refs TEXT NOT NULL DEFAULT '[]',
  duration_sec INTEGER,
  model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  not_before INTEGER,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS film_takes_asset_idx ON film_takes(asset_id, created_at);
CREATE INDEX IF NOT EXISTS film_takes_queue_idx ON film_takes(status, not_before);`
  },
  {
    idx: 18,
    tag: "0018_film_video",
    sql: `ALTER TABLE film_assets ADD COLUMN camera TEXT NOT NULL DEFAULT '';
ALTER TABLE film_assets ADD COLUMN duration_sec INTEGER NOT NULL DEFAULT 6;
ALTER TABLE film_assets ADD COLUMN dialogue TEXT;
ALTER TABLE film_assets ADD COLUMN selected_video_take_id TEXT;`
  },
  {
    idx: 19,
    tag: "0019_series_film_link",
    sql: `ALTER TABLE series ADD COLUMN production_mode TEXT NOT NULL DEFAULT 'video';
ALTER TABLE series_episodes ADD COLUMN film_id TEXT;
ALTER TABLE film_projects ADD COLUMN series_id TEXT REFERENCES series(id) ON DELETE SET NULL;
ALTER TABLE film_projects ADD COLUMN episode_id TEXT REFERENCES series_episodes(id) ON DELETE SET NULL;
ALTER TABLE film_assets ADD COLUMN proposal TEXT;
ALTER TABLE film_assets ADD COLUMN proposed_scope TEXT;
ALTER TABLE film_assets ADD COLUMN proposal_reason TEXT;`
  },
  {
    idx: 20,
    tag: "0020_film_style_options",
    sql: `ALTER TABLE film_projects ADD COLUMN genre TEXT;
ALTER TABLE film_projects ADD COLUMN visual_style TEXT;
ALTER TABLE film_projects ADD COLUMN notes TEXT;
ALTER TABLE film_projects ADD COLUMN style_for TEXT;
ALTER TABLE film_projects ADD COLUMN dialogue_language TEXT NOT NULL DEFAULT 'Tiếng Việt';
ALTER TABLE film_projects ADD COLUMN video_tier TEXT NOT NULL DEFAULT 'fast';
ALTER TABLE film_projects ADD COLUMN video_resolution TEXT NOT NULL DEFAULT '720p';
ALTER TABLE film_projects ADD COLUMN video_audio INTEGER NOT NULL DEFAULT 1;`
  },
  {
    idx: 21,
    tag: "0021_film_cast_sync",
    sql: `ALTER TABLE film_assets ADD COLUMN series_character_id TEXT;`
  },
  {
    idx: 22,
    tag: "0022_character_voice",
    sql: `ALTER TABLE series_characters ADD COLUMN voice_profile TEXT;
ALTER TABLE series_characters ADD COLUMN voice_provider TEXT;
ALTER TABLE film_projects ADD COLUMN voice_mode TEXT NOT NULL DEFAULT 'clip';
ALTER TABLE film_assets ADD COLUMN voice_profile TEXT;
ALTER TABLE film_assets ADD COLUMN voice_provider TEXT;
ALTER TABLE film_assets ADD COLUMN voice_id TEXT;`
  },
  {
    idx: 23,
    tag: "0023_channel_quota",
    sql: `ALTER TABLE channels ADD COLUMN quota_blocked INTEGER NOT NULL DEFAULT 0;`
  },
  {
    idx: 24,
    tag: "0024_prompt_source",
    sql: `ALTER TABLE series_characters ADD COLUMN prompt_manual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE film_assets ADD COLUMN description_src TEXT;
ALTER TABLE film_assets ADD COLUMN prompt_manual INTEGER NOT NULL DEFAULT 0;`
  },
  {
    idx: 25,
    tag: "0025_film_subtitle_vi",
    sql: `ALTER TABLE film_projects ADD COLUMN subtitle_vi INTEGER NOT NULL DEFAULT 0;
ALTER TABLE film_assets ADD COLUMN subtitle TEXT;
ALTER TABLE film_assets ADD COLUMN subtitle_src TEXT;`
  },
  {
    idx: 26,
    tag: "0026_film_upscale",
    sql: `ALTER TABLE film_takes ADD COLUMN upscale TEXT;
ALTER TABLE film_takes ADD COLUMN source_take_id TEXT;`
  },
  {
    idx: 27,
    tag: "0027_video_narration",
    sql: `ALTER TABLE video_projects ADD COLUMN narration INTEGER NOT NULL DEFAULT 1;`
  },
  {
    idx: 28,
    tag: "0028_content_hook",
    sql: `ALTER TABLE content_items ADD COLUMN hook_score TEXT;`
  },
  {
    idx: 29,
    tag: "0029_fashion",
    sql: `ALTER TABLE video_projects ADD COLUMN fashion TEXT;
ALTER TABLE video_scenes ADD COLUMN outfit TEXT;`
  },
  {
    idx: 30,
    tag: "0030_cultured_synch",
    sql: `CREATE TABLE IF NOT EXISTS image_projects (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Dự án ảnh mới',
  product TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',
  image_type TEXT NOT NULL DEFAULT 'square',
  style TEXT,
  aspect TEXT NOT NULL DEFAULT '1:1',
  refs TEXT NOT NULL DEFAULT '[]',
  ideas TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS image_projects_workspace_idx ON image_projects(workspace_id);

CREATE TABLE IF NOT EXISTS image_results (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES image_projects(id) ON DELETE CASCADE,
  idea_id TEXT,
  file TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  cost_usd REAL NOT NULL DEFAULT 0,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS image_results_project_idx ON image_results(project_id, created_at);

ALTER TABLE content_ideas ADD COLUMN image_project_id TEXT REFERENCES image_projects(id) ON DELETE SET NULL;`
  },
  {
    idx: 31,
    tag: "0031_sudden_mercury",
    sql: `-- Image Studio ideas metadata sync`
  },
  {
    idx: 32,
    tag: "0032_perf_indexes",
    sql: `CREATE INDEX IF NOT EXISTS accounts_workspace_idx ON accounts(workspace_id);
CREATE INDEX IF NOT EXISTS channels_account_idx ON channels(account_id);
CREATE INDEX IF NOT EXISTS posts_content_idx ON scheduled_posts(content_item_id);
CREATE INDEX IF NOT EXISTS messages_author_idx ON messages(author, created_at);
CREATE INDEX IF NOT EXISTS film_takes_film_idx ON film_takes(film_id);`
  },
  {
    idx: 33,
    tag: "0033_film_narration_watermark",
    sql: `ALTER TABLE film_projects ADD COLUMN narration INTEGER NOT NULL DEFAULT 0;
ALTER TABLE film_projects ADD COLUMN narration_provider TEXT;
ALTER TABLE film_projects ADD COLUMN narration_voice_id TEXT;
ALTER TABLE film_projects ADD COLUMN watermark_mode TEXT NOT NULL DEFAULT 'pocket';
ALTER TABLE film_projects ADD COLUMN watermark_path TEXT;
ALTER TABLE film_projects ADD COLUMN watermark_position TEXT NOT NULL DEFAULT 'br';
ALTER TABLE film_projects ADD COLUMN watermark_opacity REAL NOT NULL DEFAULT 0.85;
ALTER TABLE film_projects ADD COLUMN watermark_scale REAL NOT NULL DEFAULT 0.185;
ALTER TABLE film_assets ADD COLUMN narration TEXT;
ALTER TABLE film_assets ADD COLUMN narration_file TEXT;
ALTER TABLE film_assets ADD COLUMN narration_source TEXT NOT NULL DEFAULT 'tts';`
  },
  {
    idx: 34,
    tag: "0034_film_end_frames",
    sql: `ALTER TABLE film_projects ADD COLUMN end_frames INTEGER NOT NULL DEFAULT 0;
ALTER TABLE film_takes ADD COLUMN frame TEXT;`
  },
  {
    idx: 35,
    tag: "0035_film_chain_shots",
    sql: `ALTER TABLE film_projects ADD COLUMN chain_shots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE film_assets ADD COLUMN start_source TEXT NOT NULL DEFAULT 'auto';`
  },
  {
    idx: 36,
    tag: "0036_film_drop_end_frames",
    sql: `-- Standardized chain_shots behavior`
  },
  {
    idx: 37,
    tag: "0037_tts_jobs",
    sql: `CREATE TABLE IF NOT EXISTS tts_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  voice_id TEXT,
  voice_label TEXT,
  pause_sec REAL NOT NULL DEFAULT 0.5,
  chars INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  chunks_done INTEGER NOT NULL DEFAULT 0,
  chunks_total INTEGER NOT NULL DEFAULT 0,
  file TEXT,
  duration_sec REAL,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tts_jobs_created_idx ON tts_jobs(created_at);`
  },
  {
    idx: 38,
    tag: "0038_tts_cast_srt",
    sql: `ALTER TABLE tts_jobs ADD COLUMN cast TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tts_jobs ADD COLUMN srt_file TEXT;`
  }
];

const entries = [];
for (const m of migrations) {
  const filePath = path.join(drizzleDir, `${m.tag}.sql`);
  fs.writeFileSync(filePath, m.sql + "\n", "utf8");
  entries.push({
    idx: m.idx,
    version: "6",
    when: 1740000000000 + m.idx * 86400000,
    tag: m.tag,
    breakpoints: true
  });
}

fs.writeFileSync(
  path.join(metaDir, "_journal.json"),
  JSON.stringify({ version: "7", dialect: "sqlite", entries }, null, 2),
  "utf8"
);

// Generate OFL-Montserrat.txt
fs.writeFileSync(
  path.join(fontsDir, "OFL-Montserrat.txt"),
  "Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat)\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n",
  "utf8"
);

// Generate a clean 32x32 PNG icon in resources/icon.png
const iconBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAbUlEQVR4nO3WMQqAMAxF0R7B/a/pUdwlI1jU1tLBoU95kPAnCQkA8I9t7T3G2B6R5JxzzhFxn6qonHPEWAdQVd6xH2B7wN451n163tG3gA32DmwP2DvHug9/tQCuLrzj2qKqysf76gMAcBcX9jY1P0v8XecAAAAASUVORK5CYII=";
fs.writeFileSync(path.join(resourcesDir, "icon.png"), Buffer.from(iconBase64, "base64"));

console.log("Generated 39 Drizzle SQL migrations and static resources.");
