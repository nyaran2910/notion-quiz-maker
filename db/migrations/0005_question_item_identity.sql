create temp table question_item_canonical_map on commit drop as
with ranked as (
  select distinct
    qi.id as question_item_id,
    first_value(qi.id) over (
      partition by qi.user_id, qi.page_id
      order by coalesce(qs.answer_count, 0) desc,
        qs.updated_at desc nulls last,
        qi.updated_at desc,
        qi.created_at asc,
        qi.id asc
    ) as canonical_id
  from question_items qi
  left join question_stats qs
    on qs.question_item_id = qi.id
)
select question_item_id, canonical_id
from ranked
where question_item_id <> canonical_id;

create temp table question_item_merged_stats on commit drop as
with canonical_ids as (
  select distinct canonical_id
  from question_item_canonical_map
),
group_members as (
  select canonical_id, canonical_id as question_item_id
  from canonical_ids
  union all
  select canonical_id, question_item_id
  from question_item_canonical_map
),
stats_aggregates as (
  select
    gm.canonical_id,
    sum(qs.answer_count)::integer as answer_count,
    sum(qs.correct_count)::integer as correct_count,
    sum(qs.wrong_count)::integer as wrong_count,
    max(qs.last_answered_at) as last_answered_at,
    max(qs.last_correct_at) as last_correct_at
  from group_members gm
  join question_stats qs
    on qs.question_item_id = gm.question_item_id
  group by gm.canonical_id
),
latest_stats as (
  select distinct on (gm.canonical_id)
    gm.canonical_id,
    qs.correct_streak,
    qs.wrong_streak,
    qs.last_result,
    qs.stage,
    qs.suspended,
    qs.stability,
    qs.ease,
    qs.difficulty,
    qs.last_interval_seconds,
    qs.ema_accuracy,
    qs.avg_response_time_ms,
    qs.next_due_at,
    qs.updated_at
  from group_members gm
  join question_stats qs
    on qs.question_item_id = gm.question_item_id
  order by gm.canonical_id,
    qs.updated_at desc nulls last,
    qs.last_answered_at desc nulls last,
    qs.question_item_id asc
)
select
  sa.canonical_id as question_item_id,
  sa.answer_count,
  sa.correct_count,
  sa.wrong_count,
  ls.correct_streak,
  ls.wrong_streak,
  sa.last_answered_at,
  sa.last_correct_at,
  ls.last_result,
  ls.stage,
  ls.suspended,
  ls.stability,
  ls.ease,
  ls.difficulty,
  ls.last_interval_seconds,
  ls.ema_accuracy,
  ls.avg_response_time_ms,
  ls.next_due_at,
  ls.updated_at
from stats_aggregates sa
join latest_stats ls
  on ls.canonical_id = sa.canonical_id;

insert into question_stats (
  question_item_id,
  answer_count,
  correct_count,
  wrong_count,
  correct_streak,
  wrong_streak,
  last_answered_at,
  last_correct_at,
  last_result,
  stage,
  suspended,
  stability,
  ease,
  difficulty,
  last_interval_seconds,
  ema_accuracy,
  avg_response_time_ms,
  next_due_at,
  updated_at
)
select
  question_item_id,
  answer_count,
  correct_count,
  wrong_count,
  correct_streak,
  wrong_streak,
  last_answered_at,
  last_correct_at,
  last_result,
  stage,
  suspended,
  stability,
  ease,
  difficulty,
  last_interval_seconds,
  ema_accuracy,
  avg_response_time_ms,
  next_due_at,
  updated_at
from question_item_merged_stats
on conflict (question_item_id) do update
  set answer_count = excluded.answer_count,
      correct_count = excluded.correct_count,
      wrong_count = excluded.wrong_count,
      correct_streak = excluded.correct_streak,
      wrong_streak = excluded.wrong_streak,
      last_answered_at = excluded.last_answered_at,
      last_correct_at = excluded.last_correct_at,
      last_result = excluded.last_result,
      stage = excluded.stage,
      suspended = excluded.suspended,
      stability = excluded.stability,
      ease = excluded.ease,
      difficulty = excluded.difficulty,
      last_interval_seconds = excluded.last_interval_seconds,
      ema_accuracy = excluded.ema_accuracy,
      avg_response_time_ms = excluded.avg_response_time_ms,
      next_due_at = excluded.next_due_at,
      updated_at = excluded.updated_at;

update answer_events event
set question_item_id = map.canonical_id
from question_item_canonical_map map
where event.question_item_id = map.question_item_id;

create temp table question_item_merged_retries on commit drop as
with affected_ids as (
  select question_item_id as id
  from question_item_canonical_map
  union
  select canonical_id as id
  from question_item_canonical_map
)
select
  retry.quiz_session_id,
  coalesce(map.canonical_id, retry.question_item_id) as question_item_id,
  retry.available_after_position,
  case
    when bool_or(retry.consumed_at is null) then null
    else min(retry.consumed_at)
  end as consumed_at,
  min(retry.created_at) as created_at
from quiz_session_retries retry
left join question_item_canonical_map map
  on map.question_item_id = retry.question_item_id
where retry.question_item_id in (select id from affected_ids)
group by 1, 2, 3;

delete from quiz_session_retries
where question_item_id in (
  select question_item_id
  from question_item_canonical_map
  union
  select canonical_id
  from question_item_canonical_map
);

insert into quiz_session_retries (
  quiz_session_id,
  question_item_id,
  available_after_position,
  consumed_at,
  created_at
)
select
  quiz_session_id,
  question_item_id,
  available_after_position,
  consumed_at,
  created_at
from question_item_merged_retries;

with remapped_sessions as (
  select
    session.id,
    coalesce(
      (
        select jsonb_agg(coalesce(map.canonical_id::text, recent.value) order by recent.ordinality)
        from jsonb_array_elements_text(session.recent_question_ids) with ordinality as recent(value, ordinality)
        left join question_item_canonical_map map
          on map.question_item_id::text = recent.value
      ),
      '[]'::jsonb
    ) as recent_question_ids
  from quiz_sessions session
)
update quiz_sessions session
set recent_question_ids = remapped.recent_question_ids
from remapped_sessions remapped
where session.id = remapped.id
  and session.recent_question_ids is distinct from remapped.recent_question_ids;

delete from question_items item
using question_item_canonical_map map
where item.id = map.question_item_id;

alter table question_items
  drop constraint if exists question_items_notion_data_source_id_page_id_key;

create unique index if not exists question_items_user_id_page_id_idx
  on question_items(user_id, page_id);
