# Notion Quiz App DB Design

## Goal

- Keep Notion as the source of truth for authored problem content.
- Store application-owned state in Postgres.
- Support per-user quiz sets that combine multiple Notion data sources.
- Persist answer history and learning metrics so quiz selection logic can evolve later.

## Design Summary

- Use `page_id` as the Notion-side identifier for each problem page.
- Also store `data_source_id` for each problem so the app can filter by Notion DB without re-querying Notion.
- Separate raw answer history from aggregate stats.
- Model quiz sets as user-owned records that reference one or more Notion data sources.
- Never store passwords or Notion tokens in plaintext.

## Why `page_id` Alone Is Not Enough

`page_id` is enough to uniquely identify a single Notion page. However, the app also needs to answer questions such as:

- Which problems belong to the math data source?
- Which data sources are included in quiz set A?
- How do we build a quiz from only math and physics?

For those operations, the app should store both:

- `page_id`: unique problem page identifier in Notion
- `data_source_id`: the Notion data source that owns the page

This avoids depending on live Notion lookups for every filter or query.

## Core Data Domains

The data model has four major domains.

### 1. Authentication and Notion connection

- App user account
- Per-user Notion connection
- Encrypted Notion access token

### 2. Notion source mapping

- Which Notion data sources are available for a user
- Which Notion page corresponds to which app-side problem record

### 3. Learning history and statistics

- Per-answer event history
- Aggregate counters such as asked count and correct count
- Future scheduling fields such as `next_due_at`

### 4. Quiz set configuration

- User-defined quiz sets
- Mapping from each quiz set to one or more Notion data sources

## Recommended Tables

### `users`

App user accounts.

Suggested columns:

- `id` UUID primary key
- `email` text unique not null
- `password_hash` text not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Notes:

- Store a password hash, never the raw password.
- Keep auth data separate from Notion credentials.

### `notion_connections`

Per-user Notion workspace connection.

Suggested columns:

- `id` UUID primary key
- `user_id` UUID not null references `users(id)`
- `workspace_id` text not null
- `workspace_name` text
- `access_token_encrypted` text not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Notes:

- Encrypt the token before storing it.
- Keeping this separate from `users` makes later OAuth migration easier.

### `notion_data_sources`

Tracks user-selected Notion data sources such as math, English, or physics.

Suggested columns:

- `id` UUID primary key
- `user_id` UUID not null references `users(id)`
- `notion_connection_id` UUID not null references `notion_connections(id)`
- `data_source_id` text not null
- `database_id` text
- `name` text not null
- `last_synced_at` timestamptz
- `archived_at` timestamptz
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Suggested constraints:

- unique(`notion_connection_id`, `data_source_id`)

Notes:

- This table represents a Notion DB/data source available to the user.
- `database_id` is optional because the main operational identifier is `data_source_id`.

### `question_items`

App-side records for Notion problem pages.

Suggested columns:

- `id` UUID primary key
- `user_id` UUID not null references `users(id)`
- `notion_data_source_id` UUID not null references `notion_data_sources(id)`
- `page_id` text not null
- `status` text
- `last_seen_at` timestamptz
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Suggested constraints:

- unique(`user_id`, `page_id`)

Notes:

- This is the main mapping table between the app and individual Notion problem pages.
- The first version does not need to duplicate question text, answer text, or image URLs in Postgres.
- If later needed for performance, cached text columns can be added here or in a separate cache table.

### `question_stats`

Aggregate metrics for each problem.

Suggested columns:

- `question_item_id` UUID primary key references `question_items(id)`
- `asked_count` integer not null default 0
- `correct_count` integer not null default 0
- `last_asked_at` timestamptz
- `last_answered_at` timestamptz
- `last_correct_at` timestamptz
- `streak_current` integer not null default 0
- `streak_best` integer not null default 0
- `ease_score` numeric
- `interval_days` integer
- `next_due_at` timestamptz
- `avg_response_ms` integer
- `updated_at` timestamptz not null

Notes:

- Prefer storing `asked_count` and `correct_count` rather than a persisted `accuracy` field.
- Accuracy can be computed as `correct_count / asked_count`.
- This reduces the risk of stale aggregate values.

### `answer_events`

Immutable answer history log.

Suggested columns:

- `id` UUID primary key
- `user_id` UUID not null references `users(id)`
- `question_item_id` UUID not null references `question_items(id)`
- `quiz_session_id` UUID
- `quiz_set_id` UUID
- `answered_at` timestamptz not null
- `is_correct` boolean not null
- `response_ms` integer
- `answer_payload` jsonb

Notes:

- This table is the source for future analytics and recalculation.
- Keeping raw events makes it safe to change quiz-scoring logic later.
- Avoid storing only aggregates with no event history.

### `quiz_sets`

User-defined saved quiz collections.

Suggested columns:

- `id` UUID primary key
- `user_id` UUID not null references `users(id)`
- `name` text not null
- `description` text
- `is_default` boolean not null default false
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Examples:

- Math only
- Math + Physics
- English + Math
- Weak questions

### `quiz_set_sources`

Join table between quiz sets and Notion data sources.

Suggested columns:

- `id` UUID primary key
- `quiz_set_id` UUID not null references `quiz_sets(id)`
- `notion_data_source_id` UUID not null references `notion_data_sources(id)`
- `weight` integer not null default 1
- `created_at` timestamptz not null

Suggested constraints:

- unique(`quiz_set_id`, `notion_data_source_id`)

Notes:

- This table enables one quiz set to contain multiple Notion data sources.
- It directly solves the requirement to save combinations such as math plus physics.

### `quiz_sessions`

Optional but recommended table for each quiz run.

Suggested columns:

- `id` UUID primary key
- `user_id` UUID not null references `users(id)`
- `quiz_set_id` UUID not null references `quiz_sets(id)`
- `started_at` timestamptz not null
- `ended_at` timestamptz
- `question_count` integer not null default 0
- `correct_count` integer not null default 0
- `mode` text

Notes:

- This is useful for session-level reporting.
- It can be added after the first release if needed.

## Relationship Overview

```text
users
  ├─ notion_connections
  │    └─ notion_data_sources
  │         └─ question_items
  │              ├─ question_stats
  │              └─ answer_events
  ├─ quiz_sets
  │    └─ quiz_set_sources ── notion_data_sources
  └─ quiz_sessions ── quiz_sets
```

## Minimal First Version

The first production-ready version can start with these tables:

- `users`
- `notion_connections`
- `notion_data_sources`
- `question_items`
- `question_stats`
- `quiz_sets`
- `quiz_set_sources`
- `answer_events`

`quiz_sessions` can be added later if session reporting becomes important.

## Operational Guidance

### Source of truth

- Notion remains the source of truth for question content, answer content, explanation content, and images.
- Postgres stores app-owned state and references back to Notion.

### IDs

- Use internal UUID primary keys for app tables.
- Store Notion identifiers such as `page_id`, `data_source_id`, and `workspace_id` in separate columns.

This keeps the app schema stable even if integration details evolve.

### Stats strategy

- Write each answer into `answer_events`.
- Update `question_stats` from the latest answer.
- Derive accuracy from counts instead of storing a standalone percentage field.

### Security

- Never store passwords in plaintext.
- Never store Notion tokens in plaintext.
- Keep all database and Notion access server-side.

## Open Decisions For Implementation

These choices should be finalized when the schema is implemented.

1. Whether the first version supports one Notion connection per user or multiple connections.
2. Whether problem content should be cached in Postgres for faster quiz generation.
3. Whether `quiz_sessions` is needed in v1 or can wait.
4. Whether spaced-repetition fields such as `ease_score`, `interval_days`, and `next_due_at` should ship in v1 or be added after answer history is stable.

## Recommended Next Step

Translate this design into one of the following:

- a Prisma schema
- SQL migration files
- repository-layer interfaces under `lib/db/`
