create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  external_auth_id text unique,
  email text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notion_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  workspace_id text not null,
  workspace_name text,
  workspace_icon_url text,
  encrypted_access_token bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists notion_data_sources (
  id uuid primary key default gen_random_uuid(),
  notion_connection_id uuid not null references notion_connections(id) on delete cascade,
  data_source_id text not null,
  name text not null,
  url text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notion_connection_id, data_source_id)
);

create table if not exists question_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  notion_data_source_id uuid not null references notion_data_sources(id) on delete cascade,
  page_id text not null,
  external_id text,
  category text,
  tags jsonb,
  content_cache jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (notion_data_source_id, page_id)
);

create table if not exists question_stats (
  question_item_id uuid primary key references question_items(id) on delete cascade,
  answer_count integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  correct_streak integer not null default 0,
  wrong_streak integer not null default 0,
  last_answered_at timestamptz,
  last_correct_at timestamptz,
  last_result text,
  stage text not null default 'NEW',
  suspended boolean not null default false,
  stability numeric(8,4) not null default 0.3,
  ease numeric(8,4) not null default 1.3,
  difficulty numeric(8,4) not null default 1.0,
  last_interval_seconds integer,
  ema_accuracy numeric(8,4) not null default 0.5,
  avg_response_time_ms integer,
  next_due_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint question_stats_stage_check check (stage in ('NEW', 'LEARNING', 'REVIEW', 'MASTERED', 'LAPSE')),
  constraint question_stats_last_result_check check (last_result in ('correct', 'wrong') or last_result is null)
);

create table if not exists quiz_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quiz_set_sources (
  id uuid primary key default gen_random_uuid(),
  quiz_set_id uuid not null references quiz_sets(id) on delete cascade,
  notion_data_source_id uuid not null references notion_data_sources(id) on delete cascade,
  weight integer not null default 1,
  created_at timestamptz not null default now(),
  unique (quiz_set_id, notion_data_source_id)
);

create table if not exists quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  quiz_set_id uuid not null references quiz_sets(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  question_count integer not null default 0,
  correct_count integer not null default 0,
  mode text,
  recent_question_ids jsonb not null default '[]'::jsonb,
  last_category text
);

create table if not exists answer_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  question_item_id uuid not null references question_items(id) on delete cascade,
  quiz_session_id uuid references quiz_sessions(id) on delete set null,
  quiz_set_id uuid references quiz_sets(id) on delete set null,
  answered_at timestamptz not null default now(),
  is_correct boolean not null,
  response_ms integer,
  scheduled_after_questions integer,
  retry_enqueued boolean not null default false,
  stage_before text,
  stage_after text,
  answer_payload jsonb
);

create table if not exists quiz_session_retries (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references quiz_sessions(id) on delete cascade,
  question_item_id uuid not null references question_items(id) on delete cascade,
  available_after_position integer not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (quiz_session_id, question_item_id, available_after_position)
);

create index if not exists question_items_user_id_idx on question_items(user_id);
create index if not exists question_items_notion_data_source_id_idx on question_items(notion_data_source_id);
create index if not exists question_stats_next_due_at_idx on question_stats(next_due_at);
create index if not exists question_stats_stage_idx on question_stats(stage);
create index if not exists answer_events_question_item_id_idx on answer_events(question_item_id, answered_at desc);
create index if not exists answer_events_quiz_session_id_idx on answer_events(quiz_session_id);
create index if not exists quiz_session_retries_session_position_idx on quiz_session_retries(quiz_session_id, available_after_position) where consumed_at is null;
