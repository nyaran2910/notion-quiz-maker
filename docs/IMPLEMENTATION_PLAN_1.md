# Notion Quiz App 実装計画

## 前提整理

- 現状の [`app/page.tsx`](/Users/nyaran/Workspace/myapp/my-notion-app/app/page.tsx) は、`.env` の固定 `NOTION_API_KEY` を直接使って 1 つのデータソースを読むだけの構成になっている。
- 要件は「この Web サイトに来た各ユーザーが自分の Notion API キーを入力し、自分の Notion 上の対象 DB を選び、クイズを実行する」こと。
- この要件だと、固定のサーバー環境変数ではなく、ユーザー単位の資格情報をサーバー側で扱う必要がある。
- Notion API の新仕様では `database` と `data_source` が分離されている。実際に rows を query するのは `dataSources.query()` で、一覧取得は `search()`、スキーマ取得は `databases.retrieve()` と `dataSources.retrieve()` を組み合わせるのが正道。

## 公式仕様からの設計判断

### 1. 認証

- Notion API は Bearer token を `Authorization` ヘッダに載せる。
- JavaScript SDK は `new Client({ auth: token })` を前提にしている。
- したがって、クライアント側から Notion を直接叩かず、Next.js のサーバー側で token を受け取って Notion SDK を呼ぶ。

### 2. 一覧取得

- Notion の `search` は、`query` を省略すると integration に共有された全 `page` / `data_source` を返せる。
- `filter: { property: "object", value: "data_source" }` を使えば、選択対象候補を `data_source` に絞れる。
- 新 API では「DB を選ぶ」という UX の裏側で、実体としては `data_source` を選ばせるのが安全。
- ただしユーザー向け表示では `database title / data source name` のように見せて混乱を減らす。

### 3. スキーマ確認

- `databases.retrieve()` は `data_sources` の一覧を返す。
- `dataSources.retrieve()` はその `properties` スキーマを返す。
- したがって、対象選択後は `dataSources.retrieve()` を使って必須プロパティ候補を検査する。

### 4. プロパティ更新

- データソースの列追加や列名変更は `dataSources.update({ properties: ... })` を使う。
- 行データの更新は `pages.update({ page_id, properties: ... })` を使う。
- 数値, `select`, `title`, `rich_text`, `files` は API で扱える。
- `status` と `formula` など一部は API で更新できないので、今回のクイズ管理用プロパティは `number`, `select`, `title` / `rich_text`, `files` に寄せる。

### 5. 数式表示

- Notion の数式は rich text の `type: "equation"` として返る。
- 問題文や付加情報を表示するコンポーネントでは、`plain_text` ではなく rich text 配列を解釈し、KaTeX で `equation.expression` を描画する。

## まず直すべき設計

現状からの変更点は以下。

- `app/page.tsx` で固定トークンを使う実装をやめる。
- Notion SDK クライアントは「毎リクエストごと」に生成する。
- ユーザー入力 token は HttpOnly cookie か短命セッションに保存する。
- クライアントコンポーネントは Notion SDK を直接 import しない。
- Notion との通信は Route Handler または Server Function に集約する。

## 推奨アーキテクチャ

### 1. 認証層

追加ファイル案:

- `app/actions/notion-session.ts`
- `lib/notion/client.ts`
- `lib/notion/session.ts`

役割:

- `setNotionToken(token)` Server Action で token を受け取り、`cookies().set(...)` で HttpOnly cookie に保存
- `clearNotionToken()` で削除
- `getNotionClient()` で cookie から token を読み、`new Client({ auth: token })` を返す
- token の妥当性確認は `notion.users.me()` で行う

備考:

- v1 は「ユーザーが毎回 token を入力して使う」で十分
- 将来的には public OAuth integration に移行した方が UX も安全性もよい
- ただし今回の要件は「ユーザー自身が API キーを入力」なので、まずは cookie セッションで対応する

### 2. Notion API ラッパー

追加ファイル案:

- `lib/notion/api.ts`
- `lib/notion/schema.ts`
- `lib/notion/properties.ts`

提供関数:

- `listAccessibleDataSources()`
- `getDatabaseMapForDataSources()`
- `getDataSourceSchema(dataSourceId)`
- `ensureQuizProperties(dataSourceId, mapping)`
- `queryQuizCandidates(dataSourceId, mapping)`
- `updateQuizStats(pageId, mapping, result)`

方針:

- まず SDK のメソッドで表現できるものは SDK を使う
- 生 `request()` は SDK にない機能が本当に必要な場合だけ使う
- 返却 shape は app 側で扱いやすい独自 DTO に正規化する

## 画面構成

### 1. 接続画面

画面要素:

- Notion API キー入力欄
- 接続ボタン
- 接続状態表示
- 切断ボタン

処理:

- 入力後、Server Action で token 保存
- `users.me()` で検証
- 成功したらデータソース選択画面へ遷移

### 2. 対象データソース選択画面

画面要素:

- アクセス可能な `data_source` 一覧
- 表示名は `database title / data source name`
- 選択済み対象リスト
- 追加、削除 UI

取得方法:

- `notion.search({ filter: { property: "object", value: "data_source" } })`
- 必要に応じて `start_cursor` で全件取得
- 返ってきた各 data source の parent database を `databases.retrieve()` で補完

保存先:

- 選択済み対象とプロパティマッピングはブラウザ `localStorage`
- 理由: これは秘密情報ではなく UI 設定であり、サーバー永続化なしでも要件を満たせる

### 3. プロパティマッピング画面

ユーザーに選ばせる対象:

- 正答率: `number`
- 出題された回数: `number`
- 問題: `title` または `rich_text`
- 答え: `title` または `rich_text`
- 付加情報: `rich_text`
- 画像: `files`
- 優先順位: `select`

実装方針:

- `dataSources.retrieve(data_source_id)` で schema を取得
- 型ごとに選択候補を絞る
- 必須候補が存在しない場合は警告を出す
- 「作成する」ボタンを押した場合のみ `dataSources.update({ properties })` で追加する

推奨作成名:

- `Quiz Accuracy`
- `Quiz Asked Count`
- `Question`
- `Answer`
- `Explanation`
- `Image`
- `Priority`

注意:

- Notion では 1 レコードにつき title プロパティは常に 1 つ必要
- 既存データソースに title が問題文でない場合があるため、問題と答えは `title` / `rich_text` の両方を候補にする
- 画像は「image 型」ではなく `files` プロパティとして扱う

### 4. クイズ設定画面

画面要素:

- 出題数 selector
- 対象データソース確認
- 使用プロパティ確認
- クイズ開始ボタン

## 出題ロジック

### 必須条件

- 1 問につき選択肢は 4 つ
- 正解は 1 つ
- 残り 3 つは別レコードの答えからランダム抽出
- 重複答えは避ける

### 候補抽出

1. `dataSources.query()` で `result_type: "page"` を指定
2. 問題プロパティと答えプロパティが空でないものだけ対象化
3. 統計プロパティが空なら `accuracy = 0`, `askedCount = 0` とみなす
4. `priority` は select 名をスコアに変換する

### 推奨重み付け

以下の重みで 1 問の出題優先度を計算する。

- `difficultyWeight = 1 - accuracyNormalized`
- `freshnessWeight = 1 / (askedCount + 1)`
- `priorityWeight = priorityScore`

暫定式:

`score = 0.5 * difficultyWeight + 0.3 * freshnessWeight + 0.2 * priorityWeight`

補足:

- `accuracyNormalized` は 0.0 から 1.0 を前提
- もし Notion 上で 0 から 100 のパーセント管理にしたいなら、アプリ内部で 100 で割る
- `priorityScore` は `High=1.0`, `Medium=0.6`, `Low=0.2`, 未設定 `0.4` を推奨

### 選択肢生成

1. 正解レコードを 1 件選ぶ
2. 同じ data source から `answer` が空でない別レコードを集める
3. 正解と同値の答えは除外
4. ランダムに 3 件選ぶ
5. 正解を混ぜてシャッフル

不足時の扱い:

- distractor が 3 件未満ならその data source は出題対象から外す
- あるいは UI に「この DB は選択肢生成に必要な件数が足りない」と表示する

## 解答フロー

### 1. 問題表示

- 上部に問題文
- 必要なら問題画像
- 下部に 4 つの選択肢ボタン

### 2. 回答後

正解時:

- 正解選択肢を緑表示
- 答え、付加情報、画像を表示
- 統計更新後に次の問題へ進む

不正解時:

- 選んだ選択肢を赤表示
- 正解選択肢も緑表示
- 画面遷移はしない
- 答え、付加情報、画像を同じ画面に展開
- `次へ` ボタンで次問題へ進む

注記:

- 要件の「不正解なら画面遷移しない」を満たすため、自動遷移は正解時のみ
- ただし説明表示は不正解時にも同一画面で行う方が学習体験として自然

## 統計更新

### 必要プロパティ

- `正答率`: number
- `出題された回数`: number

### 更新式

前提:

- `askedCount` は総出題回数
- `accuracy` は 0.0 から 1.0 の小数で保存

更新:

- `nextAskedCount = askedCount + 1`
- `nextAccuracy = ((accuracy * askedCount) + (isCorrect ? 1 : 0)) / nextAskedCount`

### API

- `notion.pages.update({ page_id, properties: ... })`

更新タイミング:

- 回答が確定した時点で毎回更新
- 不正解時も `askedCount` は増える
- 正答率は正誤に応じて再計算する

## 画像表示

- Notion の画像プロパティは `files` として返る
- `external` と Notion-hosted `file` の両方を扱う
- Notion-hosted file URL は期限付きなので、毎回 API レスポンスから最新 URL を使う

## 実装フェーズ

### Phase 1: 基盤整理

- 固定 env ベースの Notion 接続を除去
- token 入力と cookie セッション化
- `lib/notion/*` の導入

### Phase 2: データソース選択

- `search()` で一覧表示
- データソース追加 / 削除 UI
- 設定を `localStorage` に保存

### Phase 3: スキーママッピング

- schema 表示
- 必須プロパティ選択
- 欠損時メッセージと任意の自動作成

### Phase 4: クイズ本体

- 出題数設定
- 出題ロジック
- 4択 UI
- 解答演出

### Phase 5: 統計反映

- `pages.update()` で正答率 / 出題回数を更新
- エラーハンドリングと再試行

### Phase 6: 品質改善

- ページネーション対応
- レート制限対応
- 空データ / 重複答え / 画像なし対応

## 想定ファイル構成

```txt
app/
  actions/
    notion-session.ts
  api/
    notion/
      data-sources/route.ts
      data-sources/[id]/schema/route.ts
      quiz/[id]/start/route.ts
      quiz/[id]/answer/route.ts
  quiz/
    page.tsx
  setup/
    page.tsx
components/
  notion-token-form.tsx
  data-source-picker.tsx
  property-mapping-form.tsx
  quiz-runner.tsx
  rich-text-renderer.tsx
lib/
  notion/
    client.ts
    api.ts
    schema.ts
    mapper.ts
    quiz.ts
  storage/
    quiz-config.ts
docs/
  quiz-app-implementation-plan.md
```

## 注意点とリスク

- ユーザー入力の API キーは秘密情報なので、`localStorage` 保存は避ける
- `httpOnly`, `secure`, `sameSite=lax` をつけた cookie を使う
- Notion integration に対象 DB が共有されていないと `object_not_found` / `restricted_resource` になる
- `search()` は integration に共有されたリソースしか返さない
- `files` URL は期限付き
- レート制限 `429` があるので、一覧取得と大量更新は連打しない
- `formula` / `status` は今回の管理列として使わない

## 実装時の決めごと

- API バージョンは旧 `2022-06-28` に固定しない
- `@notionhq/client` の現行メソッドを優先し、`search`, `databases.retrieve`, `dataSources.retrieve`, `dataSources.query`, `pages.update`, `dataSources.update` を中心に使う
- `problem`, `answer`, `explanation` は rich text を第一級で扱う
- 数式を含む rich text は KaTeX で描画する

## 参考ソース

- Notion Authentication: https://developers.notion.com/reference/authentication
- Notion Search: https://developers.notion.com/reference/post-search
- Notion Database object: https://developers.notion.com/reference/database
- Notion Retrieve a data source: https://developers.notion.com/reference/retrieve-a-data-source
- Notion Query a data source: https://developers.notion.com/reference/query-a-data-source
- Notion Update a data source: https://developers.notion.com/reference/update-a-data-source
- Notion Update data source properties: https://developers.notion.com/reference/update-data-source-properties
- Notion Update page: https://developers.notion.com/reference/patch-page
- Notion Property values: https://developers.notion.com/reference/property-value-object
- Notion Rich text: https://developers.notion.com/reference/rich-text
- Notion Status codes: https://developers.notion.com/reference/status-codes
- Next.js 16 `cookies()`: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
- Next.js 16 Route Handlers: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- Next.js 16 Server Functions / mutating data: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
