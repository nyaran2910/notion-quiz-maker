## commands
npm init -y
npm install @notionhq/client dotenv node-fetch
node notion-to-obsidian.js

## database url
`notion-database-urls.txt` に Notion Database URL を1行に1つずつ書きます。
URLごとに `OUTPUT_DIR` 配下へフォルダを分けて出力します。

## env
NOTION_TOKEN=...

## optional timeout env
IMAGE_FETCH_TIMEOUT_MS=30000
IMAGE_UPLOAD_RETRIES=3

## output
ファイル名は `Question`、本文は `Answer`、`Description`、画像の順で出力します。
画像は各データベース出力フォルダ内の `assets` に保存し、本文から `![](assets/...)` で参照します。
