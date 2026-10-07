alter table quiz_sets add column if not exists is_temporary boolean not null default false;

create index if not exists quiz_sets_user_id_is_temporary_idx on quiz_sets(user_id, is_temporary, updated_at desc);
