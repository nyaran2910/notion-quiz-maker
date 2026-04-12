# 実装チェックリスト

`docs/IMPLEMENTATION_PLAN.md` を、実際に着手しやすい単位へ分解したチェックリストです。

## 進め方

- 上から順に着手する。
- 1 チケット 1 目的を基本にする。
- 先に DB とドメインロジックを固め、後から UI をつなぐ。
- `LOGIC_IDEA.md` とズレる実装は避ける。

## Phase 1. 基盤

### 1.1 サーバー設定の整理

- [ ] サーバー専用の env 読み出し層を作る
- [ ] DB 接続設定を整理する
- [ ] Notion 接続設定を整理する
- [ ] 暗号化キーの扱いを決める

完了条件:

- [ ] サーバーから Postgres 接続できる
- [ ] サーバーから Notion client を生成できる
- [ ] secrets が client bundle に出ない

### 1.2 ディレクトリ構成の整備

- [ ] `lib/db/` を作る
- [ ] `lib/db/repositories/` を作る
- [ ] `lib/notion/` を作る
- [ ] `lib/quiz/` を作る
- [ ] route handler から domain service を呼ぶ方針に揃える

## Phase 2. DB

### 2.1 DB スキーマの初期実装

- [ ] `users` を作る
- [ ] `notion_connections` を作る
- [ ] `notion_data_sources` を作る
- [ ] `question_items` を作る
- [ ] `question_stats` を作る
- [ ] `quiz_sets` を作る
- [ ] `quiz_set_sources` を作る
- [ ] `answer_events` を作る
- [ ] `quiz_sessions` を作る
- [ ] `quiz_session_retries` を作る

完了条件:

- [ ] ローカル DB に migration が通る
- [ ] 制約と index が期待通りに入る
- [ ] `stage` の制約が `NEW`, `LEARNING`, `REVIEW`, `MASTERED`, `LAPSE` になっている

### 2.2 `question_stats` の状態モデル実装

- [ ] `answer_count` を持つ
- [ ] `correct_count` を持つ
- [ ] `wrong_count` を持つ
- [ ] `correct_streak` を持つ
- [ ] `wrong_streak` を持つ
- [ ] `last_result` を持つ
- [ ] `stage` を持つ
- [ ] `suspended` を持つ
- [ ] `stability` を持つ
- [ ] `ease` を持つ
- [ ] `difficulty` を持つ
- [ ] `ema_accuracy` を持つ
- [ ] `last_interval_seconds` を持つ
- [ ] `avg_response_time_ms` を持つ
- [ ] `next_due_at` を持つ

完了条件:

- [ ] `LOGIC_IDEA.md` の score 計算に必要な永続項目が揃っている
- [ ] 分単位の再学習間隔を保存できる

### 2.3 Repository 層の実装

- [ ] `users` repository を作る
- [ ] `notion_connections` repository を作る
- [ ] `notion_data_sources` repository を作る
- [ ] `question_items` repository を作る
- [ ] `question_stats` repository を作る
- [ ] `answer_events` repository を作る
- [ ] `quiz_sessions` repository を作る
- [ ] `quiz_session_retries` repository を作る

完了条件:

- [ ] question の取得・更新が repository 経由で完結する
- [ ] 回答記録と stats 更新を transaction で扱える

## Phase 3. Notion 連携

### 3.1 Notion 接続保存

- [ ] ユーザーごとの Notion connection 作成を実装する
- [ ] access token を暗号化して保存する
- [ ] connection の取得と更新を実装する

完了条件:

- [ ] plaintext token を保存しない
- [ ] 接続確認ができる

### 3.2 Data source 一覧取得

- [ ] 利用可能な data source の一覧取得を実装する
- [ ] data source の選択保存を実装する
- [ ] quiz set と data source の関連付けを実装する

完了条件:

- [ ] 複数 data source を 1 つの quiz set に紐付けられる

### 3.3 問題同期

- [ ] Notion page を `question_items` に同期する
- [ ] `page_id` と `notion_data_source_id` を保存する
- [ ] category と tags の同期方針を実装する
- [ ] content cache は optional のままにする

完了条件:

- [ ] 説明なしの問題でも同期できる
- [ ] 画像なしの問題でも同期できる
- [ ] 問題文と答えだけのケースでも成立する

## Phase 4. クイズドメイン

### 4.1 Score 計算

- [ ] `dueScore` を実装する
- [ ] `weakScore` を実装する
- [ ] `noveltyScore` を実装する
- [ ] `retryScore` を実装する
- [ ] `difficultyScore` を実装する
- [ ] `fatiguePenalty` を実装する
- [ ] 総合 `score` を実装する

完了条件:

- [ ] `LOGIC_IDEA.md` の重みで計算できる
- [ ] score が負値でも最終的に 0 未満にならない

### 4.2 問題選択

- [ ] 候補集合の絞り込みを実装する
- [ ] `suspended` を除外する
- [ ] 直近出題問題の除外を実装する
- [ ] category 連続抑制を実装する
- [ ] 上位 N 件から weighted random を実装する

完了条件:

- [ ] 毎回最大値固定ではなくランダム性を持つ
- [ ] 同一問題の連打が抑制される

### 4.3 回答後更新

- [ ] `answer_count` 更新を実装する
- [ ] `correct_count` / `wrong_count` 更新を実装する
- [ ] `correct_streak` / `wrong_streak` 更新を実装する
- [ ] `ema_accuracy` 更新を実装する
- [ ] `stability` 更新を実装する
- [ ] `ease` 更新を実装する
- [ ] `difficulty` 更新を実装する
- [ ] `next_due_at` 更新を実装する
- [ ] `stage` 遷移を実装する
- [ ] `avg_response_time_ms` 更新を実装する

完了条件:

- [ ] 正解時と誤答時で更新ルールが分かれている
- [ ] `NEW` / `LEARNING` の固定テーブルが実装されている
- [ ] 極端な future schedule を抑制できる

### 4.4 セッション内 retry 制御

- [ ] quiz session 開始を実装する
- [ ] recent question history を保持する
- [ ] 誤答時に retry queue へ積む
- [ ] 3-8 問後に再出題候補化する
- [ ] retry 消費処理を実装する

完了条件:

- [ ] 誤答後すぐ同じ問題が出ない
- [ ] 数問後に再挑戦しやすくなる
- [ ] 長期スケジュールと混線しない

## Phase 5. API

### 5.1 Notion API

- [ ] `POST /api/notion/connect` を実装する
- [ ] `GET /api/notion/data-sources` を実装する
- [ ] `POST /api/notion/sync` を実装する

### 5.2 Quiz set API

- [ ] `GET /api/quiz/sets` を実装する
- [ ] `POST /api/quiz/sets` を実装する
- [ ] `PATCH /api/quiz/sets/:id` を実装する

### 5.3 Quiz session API

- [ ] `POST /api/quiz/sessions` を実装する
- [ ] `GET /api/quiz/sessions/:id/next` を実装する
- [ ] `POST /api/quiz/sessions/:id/answer` を実装する
- [ ] `GET /api/quiz/sessions/:id/result` を実装する

完了条件:

- [ ] session 開始から回答送信まで API で完結する
- [ ] explanation や image が null でも正常レスポンスを返す

## Phase 6. UI

### 6.1 接続と設定 UI

- [ ] ログインまたは開始導線を作る
- [ ] Notion 接続画面を作る
- [ ] data source 選択画面を作る
- [ ] quiz set 管理画面を作る

### 6.2 クイズ実行 UI

- [ ] 問題表示 UI を作る
- [ ] 選択肢 UI を作る
- [ ] 回答送信 UI を作る
- [ ] 不正解時の答え表示を作る
- [ ] 次へ進む導線を作る
- [ ] セッション結果画面を作る

完了条件:

- [ ] 問題文と答えだけで最後まで遊べる
- [ ] explanation なしでも崩れない
- [ ] image なしでも崩れない

## Phase 7. テスト

### 7.1 ドメインロジックテスト

- [ ] score 計算テストを書く
- [ ] stage 遷移テストを書く
- [ ] retry queue テストを書く
- [ ] recent history 除外テストを書く
- [ ] `next_due_at` 更新テストを書く

### 7.2 API テスト

- [ ] session 開始 API テストを書く
- [ ] next question API テストを書く
- [ ] answer API テストを書く
- [ ] sync API テストを書く

### 7.3 最低限の E2E

- [ ] Notion 接続から quiz 開始まで確認する
- [ ] 誤答後の再挑戦導線を確認する
- [ ] explanation なし問題を確認する
- [ ] image なし問題を確認する

## 直近のおすすめ着手順

1. `question_stats` と `quiz_session_retries` を含む migration を作る
2. repository 層を作る
3. `lib/quiz/updater.ts` を作る
4. `lib/quiz/scoring.ts` を作る
5. `lib/quiz/selection.ts` を作る
6. `lib/quiz/session.ts` を作る
7. `app/api/quiz/...` をつなぐ
8. その後で Notion sync と UI を進める

## メモ

- v1 では heavy content cache を前提にしない
- explanation と image は optional
- `LOGIC_IDEA.md` と矛盾する簡略化は入れない
