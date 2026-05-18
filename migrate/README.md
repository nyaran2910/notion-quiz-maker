## commands
npm init -y
npm install @notionhq/client cloudinary dotenv node-fetch
node notion-to-obsidian.js

## database url
`notion-database-urls.txt` に Notion Database URL を1行に1つずつ書きます。
URLごとに `OUTPUT_DIR` 配下へフォルダを分けて出力します。

## env
NOTION_TOKEN=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

## optional timeout env
IMAGE_FETCH_TIMEOUT_MS=30000
CLOUDINARY_UPLOAD_TIMEOUT_MS=45000
IMAGE_UPLOAD_RETRIES=3

## output
ファイル名は `Question`、本文は `Answer`、`Description`、画像URLの順で出力します。
