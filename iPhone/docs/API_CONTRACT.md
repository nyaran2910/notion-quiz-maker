# iPhone API 契約

作成日: 2026-05-11

## 1. 方針

iPhone 版は `web/` の Next.js アプリを API サーバーとして使う。クイズ選択、学習状態更新、Notion 連携、Postgres 永続化はサーバー側が所有する。

レスポンス body は JSON。エラー時は原則として次の形に揃える。

```json
{ "error": "message" }
```

日付は ISO 8601 string として扱う。Swift 側では未知の field を無視し、必要 field がない場合だけ decode error にする。

## 2. 認証と cookie

既存 Web は `app_session` httpOnly cookie を使う。iPhone 版も同じ cookie session を使う。

- login / sign up 成功時、サーバーは `Set-Cookie: app_session=...` を返す。
- `URLSession` は cookie storage を有効にする。
- session id や Notion token を `UserDefaults` に保存しない。
- logout 成功時は server cookie と local cookie storage の両方を消す。
- 401 を受けたら app state を未ログインへ戻す。

既存の `verifySameOrigin` は `Origin` header がない native request を許可する実装になっている。iPhone から POST する場合は通常 `Origin` が付かないため、既存 quiz API は再利用できる。

## 3. Mobile API

認証と Notion 接続は Web の Server Actions に加えて、ネイティブアプリから使うための REST API を `web/app/api/mobile/...` に実装する。

状態:

- 2026-05-11 時点で、この章の API は実装済み。

### `GET /api/mobile/me`

現在の session 状態を返す。

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "User"
  },
  "notionConnection": {
    "workspaceId": "workspace-id",
    "workspaceName": "Workspace",
    "connected": true
  }
}
```

未ログインの場合:

```json
{
  "user": null,
  "notionConnection": null
}
```

### `POST /api/mobile/auth/sign-in`

Request:

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "User"
  }
}
```

Side effect:

- `Set-Cookie: app_session=...`
- 保存済み Notion connection があれば、既存 Web と同様に Notion session cookie も復元する。

### `POST /api/mobile/auth/sign-up`

Request:

```json
{
  "email": "user@example.com",
  "password": "password",
  "passwordConfirmation": "password",
  "displayName": "User"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "User"
  }
}
```

Validation は `web/app/actions/auth-session.ts` と同じ条件に揃える。

### `POST /api/mobile/auth/sign-out`

Request:

```json
{}
```

Response:

```json
{ "ok": true }
```

Side effect:

- server-side `auth_sessions` を削除する。
- `app_session` と `notion_token` cookie を削除する。

### `POST /api/mobile/notion/connection`

Notion API key を検証して保存する。

Request:

```json
{
  "token": "secret_notion_token"
}
```

Response:

```json
{
  "notionConnection": {
    "workspaceId": "workspace-id",
    "workspaceName": "Workspace",
    "connected": true
  }
}
```

Rules:

- login 必須。
- token は server で検証し、DB には暗号化して保存する。
- token をログに出さない。

### `DELETE /api/mobile/notion/connection`

Notion connection を解除する。

Response:

```json
{ "ok": true }
```

Side effect:

- DB の connection を削除する。
- `notion_token` cookie を削除する。

## 4. 既存 API の再利用

### Quiz set 一覧

`GET /api/quiz-sets`

Response:

```json
{
  "quizSets": [
    {
      "id": "uuid",
      "name": "Math",
      "description": null,
      "updatedAt": "2026-05-11T00:00:00.000Z",
      "sources": [
        {
          "dataSourceId": "notion-data-source-id",
          "dataSourceName": "Math",
          "dataSourceUrl": "https://www.notion.so/...",
          "mappings": {
            "question": "property-id",
            "answer": "property-id",
            "explanation": "property-id",
            "image": "property-id"
          }
        }
      ]
    }
  ]
}
```

### Quiz set 作成

`POST /api/quiz-sets`

Request:

```json
{
  "name": "Math",
  "description": "数学だけ",
  "sources": [
    {
      "dataSourceId": "notion-data-source-id",
      "dataSourceName": "Math",
      "dataSourceUrl": "https://www.notion.so/...",
      "mappings": {
        "question": "property-id",
        "answer": "property-id"
      }
    }
  ]
}

Response:

```json
{ "quizSet": { "id": "uuid", "name": "Math" } }
```

### Quiz set 更新

`PATCH /api/quiz-sets/[id]`

Request は作成と同じ。

Response:

```json
{ "quizSet": { "id": "uuid", "name": "Math" } }
```

### Quiz set 削除

`DELETE /api/quiz-sets/[id]`

Response:

```json
{ "ok": true }
```

### Data source 一覧

`GET /api/notion/data-sources`

Response:

```json
{
  "dataSources": [
    {
      "id": "notion-data-source-id",
      "name": "Math",
      "databaseId": "notion-database-id",
      "parentTitle": "Study",
      "url": "https://www.notion.so/..."
    }
  ]
}
```

`AccessibleDataSource` の正確な field は `web/lib/notion/api.ts` を source of truth にする。

### Data source schema

`GET /api/notion/data-sources/[id]/schema`

Response:

```json
{
  "schema": {
    "id": "notion-data-source-id",
    "title": "Math",
    "properties": [
      {
        "id": "property-id",
        "name": "Question",
        "type": "title"
      }
    ]
  }
}
```

### Quiz property 作成

`POST /api/notion/data-sources/[id]/properties`

Request:

```json
{
  "requirementKey": "question"
}
```

`requirementKey` は `"question" | "answer" | "explanation" | "image"`。

Response:

```json
{ "schema": {} }
```

### Metadata reset

`DELETE /api/notion/data-sources/[id]/metadata`

Response:

```json
{ "ok": true, "deletedQuestionCount": 10 }
```

## 5. Sync API

`POST /api/notion/sync`

Request:

```json
{
  "sources": [
    {
      "dataSourceId": "notion-data-source-id",
      "dataSourceName": "Math",
      "dataSourceUrl": "https://www.notion.so/...",
      "mappings": {
        "question": "property-id",
        "answer": "property-id",
        "explanation": "property-id",
        "image": "property-id"
      }
    }
  ]
}
```

Response:

```json
{
  "sourceCount": 1,
  "questionCount": 42
}
```

## 6. Quiz session API

### Start

`POST /api/notion/quiz/start`

Request:

```json
{
  "questionCount": 5,
  "sources": [
    {
      "dataSourceId": "notion-data-source-id",
      "dataSourceName": "Math",
      "mappings": {
        "question": "property-id",
        "answer": "property-id"
      }
    }
  ]
}
```

Response:

```json
{
  "sessionId": "uuid",
  "quizSetId": "uuid",
  "plannedQuestionCount": 5,
  "totalCandidates": 42,
  "sourceCount": 1,
  "questions": [
    {
      "id": "uuid",
      "questionItemId": "uuid",
      "pageId": "notion-page-id",
      "dataSourceId": "notion-data-source-id",
      "dataSourceName": "Math",
      "prompt": [],
      "correctAnswer": [],
      "explanation": [],
      "imageUrls": []
    }
  ]
}
```

Current behavior:

- DB 有効時、最初の response には最初の 1 問だけ入る。
- 2 問目以降は `next` で取得する。

### Next

`POST /api/notion/quiz/next`

Request:

```json
{
  "sessionId": "uuid"
}
```

Response:

```json
{
  "question": {
    "id": "uuid",
    "questionItemId": "uuid",
    "pageId": "notion-page-id",
    "dataSourceId": "notion-data-source-id",
    "dataSourceName": "Math",
    "prompt": [],
    "correctAnswer": [],
    "explanation": [],
    "imageUrls": []
  }
}
```

候補がなければ:

```json
{ "question": null }
```

### Answer

`POST /api/notion/quiz/answer`

Request:

```json
{
  "pageId": "notion-page-id",
  "questionItemId": "uuid",
  "sessionId": "uuid",
  "isCorrect": true,
  "questionPosition": 1,
  "responseTimeMs": 12345,
  "mappings": {
    "question": "property-id",
    "answer": "property-id"
  }
}
```

Response:

```json
{
  "stats": {
    "askedCount": 3,
    "accuracy": 0.67,
    "stage": "LEARNING",
    "nextDueAt": "2026-05-11T00:10:00.000Z"
  }
}
```

`stage` は `"NEW" | "LEARNING" | "REVIEW" | "MASTERED" | "LAPSE"`。

### End

`POST /api/notion/quiz/end`

Request:

```json
{
  "sessionId": "uuid"
}
```

Response:

```json
{
  "session": {
    "id": "uuid",
    "endedAt": "2026-05-11T00:00:00.000Z"
  }
}
```

## 7. Shared model definitions

Swift model はこの TypeScript 定義に合わせる。

```ts
type QuizRequirementKey =
  | "question"
  | "answer"
  | "explanation"
  | "image"

type QuizMappings = Partial<Record<QuizRequirementKey, string>>

type QuizRichTextItem = {
  plain_text?: string
  type?: string
  text?: {
    content?: string
  }
  equation?: {
    expression?: string
  }
}

type QuizQuestion = {
  id: string
  questionItemId: string
  pageId: string
  dataSourceId: string
  dataSourceName: string
  prompt: QuizRichTextItem[]
  correctAnswer: QuizRichTextItem[]
  explanation: QuizRichTextItem[]
  imageUrls: string[]
}

type QuizSourceConfig = {
  dataSourceId: string
  dataSourceName: string
  dataSourceUrl?: string
  mappings: QuizMappings
}
```

## 8. Status code handling

- `200`: 成功。
- `400`: request payload 不正。
- `401`: session なし、期限切れ、Notion 未接続。
- `403`: origin 不正など。
- `500`: server error。

iPhone 側の表示方針:

- `400`: 入力欄の近くに修正可能なエラーとして出す。
- `401`: session 再確認後、必要ならログインまたは Notion 接続画面へ戻す。
- `403`: 再試行より設定確認を促す。
- `500`: 一時的な障害として retry 導線を出す。

## 9. 契約変更時のルール

- Web 側の response shape を変える前にこの文書を更新する。
- Swift model の必須 field を増やす場合は decode tests を追加する。
- iPhone 専用 field が必要な場合でも、既存 Web UI を壊さないよう additive change にする。
- `web/lib/notion/quiz-types.ts` とこの文書が食い違ったら、コードを確認してから片方へ寄せる。
