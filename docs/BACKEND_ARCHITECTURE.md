# Backend Architecture

## Decision summary

- Keep the current Vercel-hosted Next.js app as the main application server.
- Add Postgres as the primary application database.
- Perform all database access and Notion API access on the server side only.
- Do not introduce a separate backend service yet.
- Implement the quiz engine around the scoring and session rules defined in `docs/LOGIC_IDEA.md`.
- Prepare for future heavy quiz-generation logic by isolating domain logic from route handlers so async workers can be added later.

## Why this direction

- The current app already uses server-side entry points through `app/api/...` and server actions, so a separate API service would add complexity without solving an immediate problem.
- The production deployment is already Vercel-based, and Postgres fits that environment better than SQLite for persistent multi-user data.
- Client-side direct database access would make secret handling and authorization much harder.
- The quiz logic is not only a stateless score calculation. It also needs durable per-question memory state and session-local retry control, which fits a server-owned architecture.
- Future quiz logic may become expensive, but that does not require a separate backend from day one. It requires clear separation between request handling, domain logic, persistence, and session-state handling.

## Recommended stack

### App layer

- Next.js 16 app running on Vercel.
- UI and server endpoints stay in the same repository.

### API layer

- Use Route Handlers under `app/api/...` for HTTP-based server endpoints.
- Keep Server Actions only for UI-specific mutations where HTTP endpoints are unnecessary.
- Treat both as server-only boundaries. The browser should never talk directly to Postgres or Notion.

### Database

- Use Postgres for application data.
- Prefer a Vercel-friendly managed Postgres offering such as Vercel Postgres, Neon, or Supabase.
- Do not use SQLite for production on Vercel because local database files are not a reliable persistence model there.

## High-level responsibilities

### Notion

- Source of truth for problem content authored by the user.
- Stores question content such as prompt, answer, optional explanation, and optional images.

### App database

- Stores application-owned state.
- Stores user accounts, Notion connections, mappings, quiz sessions, answer history, and learning metrics.
- Stores identifiers that link app records back to Notion records.
- Does not need to store full problem text, explanation text, or image assets in v1. Those are optional caches, not required operational data.

### Server-side API

- Validates the current user.
- Loads and stores app data in Postgres.
- Calls the Notion API when syncing or refreshing source content.
- Runs quiz-selection logic and records results.
- Owns the session-local rules from `docs/LOGIC_IDEA.md`, including recent-question exclusion, category fatigue, and retry queues.

## Implementation principles

### 1. Keep route handlers thin

- `app/api/...` should parse input, verify auth, call a domain function, and shape the response.
- Business rules should not live directly in route handlers.

### 2. Move domain logic into server-only modules

- Put quiz generation, sync logic, score calculation, answer-state updates, and session-retry logic into `lib/` modules that are only imported server-side.
- Keep these modules independent from React components.

### 3. Isolate persistence

- Add a small database access layer so business logic does not depend on raw SQL scattered across the app.
- This makes later migration to jobs or a separate service much easier.

### 4. Separate long-term state from session state

- Long-term question state such as `stability`, `difficulty`, `ema_accuracy`, `next_due_at`, and `stage` belongs in Postgres.
- Same-session retry queues and recent-question history must be handled explicitly, either in Postgres or in a dedicated session store.
- Do not collapse session retry behavior into only `next_due_at`, because `docs/LOGIC_IDEA.md` treats them as different control loops.

### 5. Never expose secrets to the client

- Notion API tokens and database credentials must stay server-side.
- If user-provided Notion tokens are persisted, store them encrypted rather than in plaintext.

## Recommended code shape

One reasonable target layout is:

```text
app/
  api/
    notion/
    quiz/
lib/
  db/
    client.ts
    repositories/
  notion/
    client.ts
    sync.ts
  quiz/
    services/
    session.ts
    scoring.ts
    selection.ts
    updater.ts
```

The exact filenames can change, but the separation should stay:

- transport layer: `app/api/...`
- domain logic: `lib/quiz/...`, `lib/notion/...`
- persistence: `lib/db/...`

For the quiz domain, the practical split should be:

- `selection.ts`: computes candidate scores and selects probabilistically across the full candidate pool
- `updater.ts`: updates `question_stats` after each answer
- `session.ts`: manages recent-question exclusion, retry queue, and category suppression

## When a separate backend is not needed

A separate backend service is not necessary if:

- quiz selection and answer updates complete comfortably within normal request time limits
- Notion sync is lightweight or user-triggered
- the app mainly serves interactive CRUD-style requests
- the team wants to keep deployment and debugging simple

This is the recommended starting point for this project.

## When to add background jobs

Add async workers or job infrastructure before adding a separate backend service if any of these happen:

- quiz-generation logic becomes slow enough to hurt request latency
- Notion sync needs to process many pages or multiple sources
- recalculations need to run after a user action but do not need to block the response
- scheduled refreshes or retryable sync tasks become necessary

At that stage, keep the web app in Vercel and move only heavy work to jobs.

Possible tools later:

- Inngest
- Trigger.dev
- QStash
- Upstash Redis-based queueing

## When to consider a separate backend service

Only consider a dedicated backend service after the job-based approach stops being enough, for example:

- long-running CPU-heavy processing becomes central to the product
- the app needs always-on workers or custom runtime behavior that does not fit Vercel functions well
- multiple clients need a shared standalone API beyond the web app itself

That is a later-stage scaling decision, not the default next step.

## Suggested rollout

### Phase 1

- Keep the current Next.js + Vercel deployment.
- Add Postgres.
- Keep all reads and writes server-side.
- Introduce a small DB layer and move new business logic out of route handlers.

### Phase 2

- Add Notion-to-Postgres sync flows where needed.
- Run quiz selection primarily from Postgres-backed data rather than recomputing everything from live Notion reads.
- Persist quiz sessions and answer history in Postgres.
- Implement the `LOGIC_IDEA` scoring model with durable question state plus explicit session-state handling.

### Phase 3

- Move heavy sync or selection work into async jobs.
- Keep the public web API in Next.js unless there is a clear product reason to split services.

## Current project guidance

For this repository, the recommended implementation path is:

1. Keep the application as a single Next.js service on Vercel.
2. Introduce Postgres as the application database.
3. Implement server-side APIs for all DB and Notion operations.
4. Implement quiz selection as a session-aware server-side domain module, not as a thin SQL query.
5. Keep Notion content caching optional. The system should still work when a user only relies on minimal authored fields and does not provide extra explanation or image data.
6. Structure the code so quiz logic and sync logic can later run in background jobs.
7. Avoid building a separate backend service until actual load or runtime constraints justify it.
