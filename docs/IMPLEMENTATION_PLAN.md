# 実装計画

## 1. 目的

この計画は、以下の設計文書を実装へ落とすための順序と成果物をまとめたものです。

- `docs/LOGIC_IDEA.md`
- `docs/DB_DESIGN.md`
- `docs/BACKEND_ARCHITECTURE.md`

優先順位は `LOGIC_IDEA.md` を最上位とします。つまり、DB・API・UI はすべて出題ロジックを成立させるために設計します。

## 2. v1 の前提

### 2.1 実装方針

- アプリは単一の Next.js サービスとして維持する。
- 永続データは Postgres に保存する。
- Notion は問題コンテンツの source of truth とする。
- 出題ロジックと学習状態はアプリ側で管理する。
- ルートハンドラは薄く保ち、ロジックは `lib/` に寄せる。

### 2.2 v1 で必須にするもの

- ユーザー管理
- Notion 接続情報の保存
- Notion data source の選択と同期
- `question_items` / `question_stats` / `answer_events` の永続化
- `LOGIC_IDEA.md` に基づく出題選択
- セッション内の再出題制御
- クイズ結果の保存

### 2.3 v1 で必須にしないもの

- 問題文や答えの全文キャッシュ
- 解説文のキャッシュ
- 画像 URL のキャッシュ
- 画像つき問題の対応を前提にした UI
- バックグラウンドジョブ基盤
- 重い分析ダッシュボード

### 2.4 コンテンツ前提

- 問題は「問題文と答え」だけでも成立するものとする。
- 解説、画像、補足情報は optional とする。
- ユーザーによっては説明や画像をまったく使わないことを前提にする。

## 3. 実装の全体像

実装は次の 7 フェーズで進めます。

1. 基盤整備
2. DB スキーマ実装
3. Notion 連携実装
4. クイズドメイン実装
5. API 実装
6. UI 実装
7. テストと運用確認

## 4. フェーズ別計画

### Phase 1. 基盤整備

目的:
Next.js 側で安全に Postgres と Notion を扱える土台を作る。

作業項目:

- DB クライアントを導入する。
- サーバー専用の設定読み込み層を作る。
- 認証方式を確定する。
- Notion トークン暗号化方式を決める。
- `lib/db/`, `lib/notion/`, `lib/quiz/` のディレクトリを作る。

成果物:

- DB 接続設定
- 暗号化ユーティリティ
- リポジトリ層のベース構造
- Notion API クライアント生成関数

完了条件:

- サーバー側から Postgres に接続できる。
- サーバー側から Notion API クライアントを生成できる。
- 秘密情報がクライアントへ漏れない構造になっている。

### Phase 2. DB スキーマ実装

目的:
`DB_DESIGN.md` の最小構成を migration と repository に落とす。

対象テーブル:

- `users`
- `notion_connections`
- `notion_data_sources`
- `question_items`
- `question_stats`
- `quiz_sets`
- `quiz_set_sources`
- `answer_events`
- `quiz_sessions`
- `quiz_session_retries`

実装ポイント:

- `question_stats` に `LOGIC_IDEA.md` の主要状態を持たせる。
- `last_interval_seconds` で短周期の再学習を表現できるようにする。
- `stage` は `NEW`, `LEARNING`, `REVIEW`, `MASTERED`, `LAPSE` に制限する。
- `answer_events` は immutable log とする。
- `quiz_session_retries` は v1 では Postgres か session store のどちらかに固定する。

推奨:

- v1 は実装単純性を優先し、`quiz_session_retries` も Postgres に持つ。

成果物:

- migration ファイル
- DB schema 定義
- repository interface
- repository 実装

完了条件:

- 全テーブルがローカル環境で作成できる。
- `question_stats` を 1 レコード単位で読み書きできる。
- セッション開始、回答保存、再出題キュー登録が DB 上で表現できる。

### Phase 3. Notion 連携実装

目的:
Notion から問題候補を取り込み、アプリ DB と対応づける。

作業項目:

- ユーザーごとの Notion connection 登録
- data source 一覧取得
- 対象 data source 選択
- Notion page と `question_items` の対応づけ
- 定期または手動同期処理

実装ポイント:

- Notion からはページ ID と source 情報を取得する。
- v1 では問題本文・答え・画像を必ず DB にコピーしない。
- 必要なら表示時または同期時に最小限の整形だけ行う。
- 解説や画像がなくても同期失敗にしない。

成果物:

- `lib/notion/client.ts`
- `lib/notion/sync.ts`
- data source 取得用 service
- page 同期用 service

完了条件:

- ユーザーが選んだ data source のページを同期できる。
- `question_items` が `page_id` と `notion_data_source_id` を持って登録される。
- 説明なし、画像なしの問題でも同期が通る。

### Phase 4. クイズドメイン実装

目的:
`LOGIC_IDEA.md` の出題・更新ロジックをアプリの中核ロジックとして実装する。

作業項目:

- `dueScore`, `weakScore`, `noveltyScore`, `retryScore`, `difficultyScore`, `fatiguePenalty` の実装
- 総合 `score` の実装
- 上位 N 件からの重み付きランダム選択
- 回答後の `question_stats` 更新
- `stage` 遷移の実装
- 同一セッション内の retry queue 実装
- recent question exclusion 実装
- category 連続抑制の実装

推奨モジュール:

- `lib/quiz/scoring.ts`
- `lib/quiz/selection.ts`
- `lib/quiz/updater.ts`
- `lib/quiz/session.ts`

実装ポイント:

- 長期スケジュールとセッション内再出題を混ぜない。
- `next_due_at` は長期復習用に使う。
- セッション内 retry は別キューで管理する。
- `fatiguePenalty` により直近出題問題の連打を防ぐ。
- `answer_count == 0` の新規問題も一定割合で混ぜる。

成果物:

- 出題候補取得 service
- 出題選択 service
- 回答確定 service
- セッション状態管理 service

完了条件:

- 同じ問題が連続しにくい。
- 間違えた問題が数問後に再挑戦候補へ入る。
- 回答後に `question_stats` が一貫した形で更新される。

### Phase 5. API 実装

目的:
UI から必要な操作を安全に実行できるサーバー API を用意する。

候補 API:

- `POST /api/notion/connect`
- `GET /api/notion/data-sources`
- `POST /api/notion/sync`
- `GET /api/quiz/sets`
- `POST /api/quiz/sets`
- `POST /api/quiz/sessions`
- `GET /api/quiz/sessions/:id/next`
- `POST /api/quiz/sessions/:id/answer`

役割分担:

- Route Handler は入力検証、認証、レスポンス整形だけを担当する。
- 実処理は `lib/` の domain service に委譲する。

実装ポイント:

- 回答 API は `answer_events` への書き込みと `question_stats` 更新を同一トランザクションで扱う。
- next question API は retry queue と通常候補の両方を見る。
- API 返却では explanation や image がなくても正常レスポンスにする。

成果物:

- 入力スキーマ
- Route Handler 群
- ドメイン service 呼び出し

完了条件:

- UI からセッション開始、次問取得、回答送信が一通りできる。
- 主要 API が認証とバリデーションを通る。

### Phase 6. UI 実装

目的:
v1 として必要十分な操作ができる画面を実装する。

対象画面:

- ログインまたはユーザー開始画面
- Notion 接続画面
- data source 選択画面
- quiz set 管理画面
- クイズ実行画面
- セッション結果画面

UI 方針:

- explanation や image がない問題でも表示崩れしない。
- 「問題文 + 選択肢」だけでクイズが成立する。
- 不正解時は即遷移せず、答えを確認してから次へ進める。
- `LOGIC_IDEA.md` の session-aware な出題結果を UI で壊さない。

成果物:

- 画面コンポーネント
- フォーム
- API 接続処理

完了条件:

- 最小構成の問題でクイズを最後まで進行できる。
- 解説なし、画像なしでも UX が破綻しない。

### Phase 7. テストと運用確認

目的:
ロジック破綻とデータ破損を先に潰す。

テスト対象:

- score 計算ユニットテスト
- `stage` 遷移テスト
- 回答後更新テスト
- retry queue テスト
- recent question exclusion テスト
- API 統合テスト
- 同期処理テスト

最低限の確認項目:

- 初回出題が成立する。
- 誤答後に短い再挑戦導線が作られる。
- 連続同問が起きにくい。
- `next_due_at` が極端に飛びすぎない。
- optional な explanation / image が null でも処理が落ちない。

成果物:

- test code
- seed data
- 検証用の sample session

完了条件:

- 主要ドメインロジックに自動テストがある。
- 最低限の手動 E2E が通る。

## 5. 実装順の推奨

最短で価値を出すため、次の順で進める。

1. DB migration と repository を先に作る。
2. `question_stats` 更新ロジックを先に実装する。
3. 次に `selection.ts` と `session.ts` を実装する。
4. その後で Notion sync をつなぐ。
5. 最後に UI をつないで E2E を確認する。

理由:

- 出題ロジックの中心は DB 状態と更新式であり、UI より先に安定させるべきだから。
- Notion 側のコンテンツ差異より、アプリ側の学習状態モデルの方が壊れやすいから。

## 6. v1 の実装スコープ

### In scope

- 1 ユーザーが複数 data source を選んで quiz set を作れること
- 問題ごとに学習状態を持てること
- セッション内 retry が動くこと
- explanation と image がなくてもクイズできること

### Out of scope

- 画像最適化の作り込み
- explanation 自動生成
- バックグラウンドジョブによる大規模同期
- 高度な分析画面
- AI による出題生成

## 7. リスクと対策

### 7.1 Notion 側データのばらつき

リスク:

- 問題文はあるが explanation がない
- 画像がない
- ユーザーごとにプロパティ構成が違う

対策:

- 同期時に必須項目を最小化する。
- optional 項目欠落で失敗させない。
- 表示層で null-safe に扱う。

### 7.2 出題ロジックの偏り

リスク:

- 同じ問題が連続する
- 新規問題が出ない
- 苦手問題が出すぎる

対策:

- weighted random を使う。
- fatigue penalty を強めに入れる。
- recent history と retry queue を分離する。

### 7.3 更新不整合

リスク:

- `answer_events` と `question_stats` がずれる

対策:

- 回答確定処理は transaction にまとめる。
- 再計算可能な形で event log を残す。

## 8. 直近の着手順

今すぐ着手するなら次の順がよいです。

1. `question_stats` を含む DB migration を作る。
2. `lib/db/repositories` を作る。
3. `lib/quiz/updater.ts` を先に実装する。
4. `lib/quiz/scoring.ts` と `lib/quiz/selection.ts` を実装する。
5. `lib/quiz/session.ts` で retry queue と recent history を実装する。
6. `app/api/quiz/...` をつなぐ。
7. 最後に Notion sync と UI を接続する。

## 9. 備考

- `docs/IMPLEMENTATION_PLAN_1.md` は Notion 直結寄りの初期案として残し、この文書を現行方針の実装計画とする。
- 実装時に判断が必要な点は、`DB_DESIGN.md` の Open Decisions を都度確定する。
