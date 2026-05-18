# iPhone Agent Guide

このディレクトリは `web/` の Notion Quiz を iPhone ネイティブアプリへ移植するための作業場所です。

## Source of Truth

- 実装計画は `docs/IMPLEMENTATION_PLAN.md` を読む。
- API 契約は `docs/API_CONTRACT.md` を読む。
- Web 側の設計は `../web/docs/IMPLEMENTATION_PLAN.md`、`../web/docs/BACKEND_ARCHITECTURE.md`、`../web/docs/DB_DESIGN.md` を参照する。
- Web 側を変更する場合は、必ず `../web/AGENTS.md` も読む。`web/` は `pnpm` 専用。

## Architecture Rules

- iPhone 版は SwiftUI のネイティブアプリとして実装する。Web アプリ全体を WebView で包まない。
- Notion API と Postgres へ iPhone から直接アクセスしない。
- 出題選択、retry queue、stage 更新、`next_due_at` 更新を iPhone に複製しない。必ず Web API を通す。
- `../web/lib/quiz/scoring.ts`、`selection.ts`、`session.ts`、`updater.ts` をクイズロジックの source of truth とする。
- 認証、Notion 接続、quiz set、quiz session は `docs/API_CONTRACT.md` の契約に合わせる。

## Security Rules

- `app_session` は httpOnly cookie として扱い、`URLSession` の cookie storage に任せる。
- session id、Notion token、password を `UserDefaults` に保存しない。
- Notion token や password をログに出さない。
- 非秘密の設定だけを `UserDefaults` に保存してよい。例: base URL、最後に選んだ quiz set、UI 設定。
- logout 時は server API を呼んだあと local cookie storage も削除する。

## Swift Implementation Rules

- SwiftUI、Swift Concurrency、`URLSession` を基本にする。
- API client、model、feature view model を分ける。
- UI state の変更は main actor 上で行う。
- JSON model は unknown field を許容し、必須 field 欠落は test で検出する。
- Notion rich text は v1 では `plain_text`、`text.content`、`equation.expression` の順で fallback 表示する。
- 画像取得失敗で問題画面全体を失敗させない。

## UX Rules

- 画面文言は日本語を基本にする。
- Web の Notion 風デザイン方針を尊重しつつ、iPhone では標準の navigation、sheet、form、list、toolbar を優先する。
- 主要操作のタッチターゲットは 44pt 以上にする。
- Dynamic Type と VoiceOver を考慮する。
- loading、empty、error、retry state を各主要画面に用意する。

## Testing Rules

- API model の decode tests を追加する。
- API client は `URLProtocol` mock でテストする。
- quiz runner は開始、答え表示、回答送信、次問、終了の state transition をテストする。
- Web API 契約を変えた場合は、iPhone 側の model tests も更新する。

## Current Status

`iPhone/` には SwiftUI app project がある。Xcode project は `project.yml` から `xcodegen generate` で再生成する。

実装済み:

- `../web/app/api/mobile/...` の auth/session/Notion connection API。
- SwiftUI app shell。
- `APIClient` と cookie session handling。
- Auth flow。
- Notion connection/setup flow。
- Quiz set list。
- Quiz runner。
- Account settings。
- model decode と API client tests。

検証済み:

- `pnpm typecheck`
- `pnpm build`
- `xcodebuild ... build`
- `xcodebuild ... build-for-testing`
- `xcodebuild ... test` on iPhone 17 Simulator
