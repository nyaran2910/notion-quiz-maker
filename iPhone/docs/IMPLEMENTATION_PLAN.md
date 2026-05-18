# iPhone ネイティブアプリ実装計画

作成日: 2026-05-11

## 1. 目的

`web/` の Notion Quiz を、`iPhone/` 配下で iPhone のネイティブアプリとして実装する。iPhone 版は SwiftUI のネイティブ UI として作り、既存 Web アプリが持つ Notion 連携、Postgres 永続化、出題選択、学習状態更新をバックエンドとして利用する。

この計画の判断材料:

- `web/README.md`
- `web/AGENTS.md`
- `web/docs/IMPLEMENTATION_PLAN.md`
- `web/docs/BACKEND_ARCHITECTURE.md`
- `web/docs/DB_DESIGN.md`
- `web/docs/design/DESIGN.md`
- `web/app/api/...`
- `web/lib/quiz/...`
- `web/lib/notion/quiz-types.ts`
- `web/lib/notion/quiz-schema.ts`

## 2. 基本方針

### 2.1 iPhone 版の役割

iPhone 版は「学習体験に最適化したネイティブクライアント」とする。

- ログイン、新規登録、Notion 接続、データソース選択、プロパティマッピング、同期、クイズ集管理、暗記カード実行を提供する。
- クイズの出題順、復習スケジュール、誤答後の retry queue、回答履歴保存はサーバー側に委譲する。
- Notion API や Postgres へ iPhone から直接アクセスしない。

### 2.2 サーバー側の役割

既存 `web/` を API サーバーとして維持する。

- Notion トークン、DB 接続情報、学習状態はサーバー側だけで扱う。
- `web/lib/quiz/scoring.ts`、`selection.ts`、`session.ts`、`updater.ts` のロジックを source of truth とする。
- iPhone 版は `QuizQuestion`、`QuizSourceConfig`、`QuizRequirementKey` などの JSON 契約を Swift model として写す。

### 2.3 v1 でやらないこと

- WebView で Web アプリを包むだけの実装。
- iPhone 内での独自出題エンジン実装。
- iPhone からの直接 Notion API 呼び出し。
- iPhone からの直接 Postgres 接続。
- オフライン完結のクイズ実行。
- バックグラウンド同期、Push 通知、Widget、Watch 対応。
- 高度な分析ダッシュボード。

## 3. 現状の Web アプリ要約

### 3.1 機能

現在の Web アプリは次の機能を持つ。

- メールアドレスとパスワードによるユーザー登録、ログイン、ログアウト。
- ユーザー入力の Notion API キーを検証し、暗号化して保存。
- Notion data source 一覧取得。
- data source ごとの quiz property schema 取得。
- 問題、答え、付加情報、画像のプロパティマッピング。
- 不足プロパティの作成。
- Notion から問題候補を同期。
- 複数 data source をまとめた quiz set の CRUD。
- 暗記カード形式のクイズ実行。
- 回答結果を `answer_events` と `question_stats` に保存。
- 誤答問題を数問後に再出題候補へ入れる session retry。

### 3.2 既存 API

iPhone 版で再利用できる主な API:

- `GET /api/quiz-sets`
- `POST /api/quiz-sets`
- `PATCH /api/quiz-sets/[id]`
- `DELETE /api/quiz-sets/[id]`
- `GET /api/notion/data-sources`
- `GET /api/notion/data-sources/[id]/schema`
- `POST /api/notion/data-sources/[id]/properties`
- `DELETE /api/notion/data-sources/[id]/metadata`
- `POST /api/notion/sync`
- `POST /api/notion/quiz/start`
- `POST /api/notion/quiz/next`
- `POST /api/notion/quiz/answer`
- `POST /api/notion/quiz/end`

ただし、ログイン、新規登録、Notion 接続は現在 Server Actions で実装されているため、ネイティブアプリから直接扱いやすい REST API を追加する必要がある。詳細は `iPhone/docs/API_CONTRACT.md` にまとめる。

### 3.3 認証の現状

Web は `app_session` という httpOnly cookie を使う。Notion token は `notion_token` cookie と DB 内の暗号化済み token で扱われる。

iPhone 版は `URLSession` の cookie storage で `Set-Cookie` を受け取り、以後の API に同じ cookie を送る。秘密値を `UserDefaults` に保存しない。

## 4. 推奨技術構成

### 4.1 アプリ

- SwiftUI
- Swift Concurrency (`async` / `await`)
- `URLSession` ベースの API client
- `Observable` または `ObservableObject` ベースの画面 state
- Keychain は必要な非 cookie 秘密情報だけに限定して使う
- UserDefaults は base URL、最後に選んだ quiz set、ローカル UI 設定など非秘密情報だけに使う

Deployment target はプロジェクト作成時に確定する。明確な制約がなければ、保守性を優先して iOS 17 以上を初期候補にする。

### 4.2 バックエンド

`web/` の Next.js アプリをそのまま使う。iPhone 版のために追加する Web 側作業は、原則として `/api/mobile/...` の薄い route handler 追加に限定する。

### 4.3 ローカル開発

- iOS Simulator からは `http://localhost:3000` を base URL にできる。
- 実機からローカル Web に接続する場合は Mac の LAN IP または tunnel URL を使う。
- 本番確認は Vercel など既存 Web デプロイ先の HTTPS URL を使う。

## 5. 目標ディレクトリ構成

`iPhone/` は `xcodegen` で生成する Xcode プロジェクトとして実装する。現在の構成は次を基準にする。

```text
iPhone/
  AGENTS.md
  docs/
    IMPLEMENTATION_PLAN.md
    API_CONTRACT.md
  NotionQuiz/
    NotionQuizApp.swift
    App/
      AppState.swift
      AppEnvironment.swift
      RootView.swift
    Core/
      Networking/
        APIClient.swift
        Endpoint.swift
        APIError.swift
        CookieSessionStore.swift
      Models/
        AuthModels.swift
        NotionModels.swift
        QuizModels.swift
      Storage/
        SecureStorage.swift
        AppPreferences.swift
    Features/
      Auth/
      NotionSetup/
      QuizSets/
      QuizRun/
      Account/
    SharedUI/
      RichTextView.swift
      LoadingStateView.swift
      ErrorStateView.swift
  NotionQuizTests/
  NotionQuizUITests/
```

## 6. 画面構成

### 6.1 App root

アプリ起動時に `GET /api/mobile/me` を呼び、次の状態へ振り分ける。

- 未ログイン: Auth flow
- ログイン済み、Notion 未接続: Notion connection flow
- ログイン済み、Notion 接続済み: Main tab

### 6.2 Auth flow

Web の `AuthPanel` と同等の内容を SwiftUI で実装する。

- ログイン
- 新規登録
- バリデーションエラー表示
- cookie session 確立

### 6.3 Notion setup flow

Web の `SetupWorkspace` と同等の内容を iPhone 向けに分割する。

1. Notion API キー入力。
2. data source 一覧。
3. data source 複数選択。
4. data source ごとの schema 表示。
5. 問題、答え、付加情報、画像の property mapping。
6. 不足 property の作成。
7. 同期。
8. quiz set 作成または更新。

iPhone の小さい画面では、Web の一画面構成を step-based navigation に分ける。

### 6.4 Quiz sets

- 保存済み quiz set 一覧。
- quiz set 詳細。
- 名前、説明、対象 data source の編集。
- 削除確認。
- 最後に使った quiz set を非秘密の local preference に保存。

### 6.5 Quiz runner

Web の `QuizRunner` をネイティブ化する。

- 出題数選択: 5、10、20、50、100、自由入力。
- `POST /api/notion/quiz/start`
- 問題表示。
- 「答えを見る」。
- 答え、付加情報、画像表示。
- 「覚えていない」「覚えていた」。
- `POST /api/notion/quiz/answer`
- 次問の事前取得: `POST /api/notion/quiz/next`
- 終了時: `POST /api/notion/quiz/end`
- 正解数、正答率、対象数の結果表示。

回答登録は v1 ではサーバー成功を待ってから次へ進める。学習状態の破損を避けることを優先する。必要になれば、Web と同様の optimistic UI は後で入れる。

### 6.6 Account

v1.1 以降で扱う。

- ログアウト。
- Notion 接続解除。
- プロフィール更新。
- パスワード変更。
- アカウント削除。

最初の v1 ではログアウトと Notion 接続解除だけを必須にする。

## 7. データモデル移植

Swift model は `web/lib/notion/quiz-types.ts` と `web/lib/notion/quiz-schema.ts` を基準にする。

### 7.1 必須 model

- `QuizRequirementKey`
- `QuizRequirementDefinition`
- `QuizRichTextItem`
- `QuizQuestion`
- `QuizSourceConfig`
- `QuizSetSummary`
- `AccessibleDataSource`
- `DataSourceSchema`
- `AuthUser`

### 7.2 Rich text 表示

Notion rich text は v1 では次の順で表示する。

1. `plain_text`
2. `text.content`
3. `equation.expression`

`equation.expression` は v1 では等幅テキストで表示する。数式の美しいレンダリングは別タスクに分ける。

### 7.3 画像表示

`QuizQuestion.imageUrls` は optional 配列として扱う。

- 空配列なら画像セクションを出さない。
- URL の期限切れや取得失敗は問題表示全体を失敗させない。
- 画像キャッシュは v1 ではシステム標準に任せる。

## 8. 実装フェーズ

### Phase 0. Backend mobile API の追加

目的:
iPhone からログイン、新規登録、Notion 接続、セッション確認をできるようにする。

作業:

- `POST /api/mobile/auth/sign-in`
- `POST /api/mobile/auth/sign-up`
- `POST /api/mobile/auth/sign-out`
- `GET /api/mobile/me`
- `POST /api/mobile/notion/connection`
- `DELETE /api/mobile/notion/connection`
- 必要なら account update 用 API

状態:

- 2026-05-11 時点で必須 API は `web/app/api/mobile/...` に実装済み。

完了条件:

- iPhone または curl から login API を呼ぶと `app_session` cookie が返る。
- cookie 付きで `GET /api/quiz-sets` が通る。
- Notion token を API 経由で接続、解除できる。

### Phase 1. Xcode project 基盤

目的:
ビルド可能な SwiftUI アプリの土台を作る。

作業:

- `iPhone/NotionQuiz` app project を作成。
- app environment と base URL 設定を追加。
- `APIClient`、`Endpoint`、`APIError`、cookie session 管理を実装。
- Swift model と JSON decode の単体テストを追加。

完了条件:

- simulator で空の root view が起動する。
- `GET /api/mobile/me` の mock test が通る。
- cookie を保持した API 呼び出しができる。

状態:

- 2026-05-11 時点で `iPhone/project.yml` と `NotionQuiz.xcodeproj` を作成済み。
- API client、cookie handling、model decode tests を実装済み。

### Phase 2. Auth と session 復元

目的:
アプリ起動からログイン状態を復元できるようにする。

作業:

- Login view。
- Sign up view。
- Root state machine。
- Logout。
- session expired 時の 401 handling。

完了条件:

- 新規登録後に main flow へ進む。
- ログイン後に cookie が保存され、アプリ再起動後も session が復元される。
- 401 で auth flow に戻る。

### Phase 3. Notion setup

目的:
Web の setup 体験を iPhone の step flow に移植する。

作業:

- Notion token 入力。
- data source 一覧。
- schema 読み込み。
- property mapping。
- missing property 作成。
- sync 実行。
- quiz set 作成、編集。

完了条件:

- 最小構成の Notion data source を選び、問題と答えを mapping して sync できる。
- explanation と image がなくても保存できる。
- quiz set が `GET /api/quiz-sets` に出る。

### Phase 4. Quiz runner

目的:
暗記カード学習を iPhone で完走できるようにする。

作業:

- quiz set 選択。
- 出題数選択。
- session start。
- question view。
- answer reveal。
- correct / wrong submit。
- next question prefetch。
- session end。
- result summary。

完了条件:

- 5 問のクイズを開始から終了まで進行できる。
- 誤答時にサーバー側の retry queue が使われる。
- optional な付加情報や画像がなくても画面が崩れない。

### Phase 5. UI polish とアクセシビリティ

目的:
ネイティブアプリとして日常利用できる品質にする。

作業:

- Dynamic Type 対応。
- VoiceOver label。
- 44pt 以上のタッチターゲット。
- loading、empty、error state の統一。
- 片手操作しやすい quiz action 配置。
- ダーク、ライト両対応。

完了条件:

- 小さい iPhone 画面で主要テキストが欠けない。
- 通信エラーや空データ時に復帰導線がある。
- VoiceOver で quiz runner の主要操作ができる。

### Phase 6. Test と release 準備

目的:
移植後の回帰と API 契約破壊を検出する。

作業:

- APIClient の URLProtocol mock tests。
- model decode tests。
- Auth view model tests。
- Quiz runner state tests。
- 代表的な UI tests。
- TestFlight 用の bundle id、icon、launch screen、privacy manifest 確認。

完了条件:

- 主要 unit tests が通る。
- simulator でログインから quiz 完了まで手動確認できる。
- 本番 base URL で実機 smoke test が通る。

## 9. リスクと対策

### 9.1 Server Actions が iPhone から使いづらい

対策:
認証と Notion 接続は `/api/mobile/...` に REST API を追加する。既存 Web UI は壊さない。

### 9.2 Cookie session の扱い

対策:
`URLSession` の cookie storage を明示的に使う。ログアウト時は server API 呼び出し後に local cookie も削除する。session id を `UserDefaults` に保存しない。

### 9.3 API 契約の型ずれ

対策:
`iPhone/docs/API_CONTRACT.md` を更新してから Swift model を変える。Swift decoder は未知 field を無視し、必須 field 欠落は test で検出する。

### 9.4 Notion rich text と数式

対策:
v1 は plain text fallback を優先する。数式や装飾の高品質表示は独立した renderer 改善タスクとして扱う。

### 9.5 Web と iPhone のロジック分岐

対策:
出題、retry、stage 更新、`next_due_at` 更新を iPhone に複製しない。必ず API を通してサーバーに保存する。

## 10. 最短の着手順

1. `web/` に `/api/mobile/me`、`/api/mobile/auth/*`、`/api/mobile/notion/connection` を追加する。
2. iPhone Xcode project を作成する。
3. `APIClient` と cookie session を実装する。
4. Auth flow を実装する。
5. `GET /api/quiz-sets` で main 画面までつなぐ。
6. Notion setup flow を実装する。
7. Quiz runner を実装する。
8. decode tests と quiz runner state tests を追加する。
