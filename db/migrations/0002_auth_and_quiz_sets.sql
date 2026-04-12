alter table users add column if not exists password_hash text;

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_id_idx on auth_sessions(user_id);
create index if not exists auth_sessions_expires_at_idx on auth_sessions(expires_at);

alter table quiz_set_sources add column if not exists mappings jsonb not null default '{}'::jsonb;
