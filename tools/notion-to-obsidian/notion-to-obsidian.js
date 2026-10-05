import fs from "fs/promises";
import path from "path";
import { Client, LogLevel } from "@notionhq/client";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const {
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  NOTION_DATA_SOURCE_ID,
  DATABASE_URLS_FILE = "./notion-database-urls.txt",
  IMAGE_FETCH_TIMEOUT_MS = "30000",
  IMAGE_UPLOAD_RETRIES = "3",
  OUTPUT_DIR = "./obsidian-export",
} = process.env;

if (!NOTION_TOKEN) {
  throw new Error("NOTION_TOKEN が必要です");
}

const notion = new Client({
  auth: NOTION_TOKEN,
  logLevel: LogLevel.ERROR,
  timeoutMs: 30000,
});

const PROPERTY_ORDER = [
  "Question",
  "Answer",
  "Description",
  "Image",
];

const imageFetchTimeoutMs = Number(IMAGE_FETCH_TIMEOUT_MS);
const imageUploadRetries = Math.trunc(Number(IMAGE_UPLOAD_RETRIES));

validatePositiveNumber("IMAGE_FETCH_TIMEOUT_MS", imageFetchTimeoutMs);
validatePositiveNumber("IMAGE_UPLOAD_RETRIES", imageUploadRetries);

let resolvedDatabaseReference = "";

function sanitizeFileName(name) {
  return String(name || "Untitled")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled";
}

function markdownToFileNameText(markdown) {
  return String(markdown ?? "")
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeAssetFileBaseName(value) {
  return String(value || "image")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "image";
}

function validatePositiveNumber(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} は正の数値で指定してください`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function getImageExtension(imageUrl, contentType) {
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  const byContentType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };

  if (byContentType[type]) return byContentType[type];

  try {
    const url = new URL(imageUrl);
    const ext = path.extname(url.pathname).replace(".", "").toLowerCase();

    if (ext) return ext;
  } catch {
    const ext = path.extname(imageUrl).replace(".", "").toLowerCase();

    if (ext) return ext;
  }

  return "jpg";
}

async function withRetries(action, retries, label) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw new Error(`${label}: ${getErrorMessage(lastError)}`);
}

async function withTimeout(promiseFactory, timeoutMs, label, onTimeout) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${label} が ${timeoutMs}ms でタイムアウトしました`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ensureUniquePath(dir, baseName) {
  let filePath = path.join(dir, `${baseName}.md`);
  let count = 2;

  while (true) {
    try {
      await fs.access(filePath);
      filePath = path.join(dir, `${baseName}-${count}.md`);
      count += 1;
    } catch {
      return filePath;
    }
  }
}

async function getAllDatabasePages(dataSourceId) {
  const pages = [];
  let cursor = undefined;

  while (true) {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
      result_type: "page",
    });

    pages.push(
      ...response.results.filter((result) => result.object === "page")
    );

    if (!response.has_more) break;
    cursor = response.next_cursor;
  }

  return pages;
}

async function getAllDataSourceTargets() {
  const databaseUrls = await readDatabaseUrls();

  if (databaseUrls.length > 0) {
    return Promise.all(
      databaseUrls.map((databaseUrl) => resolveDataSource({ databaseUrl }))
    );
  }

  return [await resolveDataSource()];
}

async function resolveDataSource({ databaseUrl } = {}) {
  if (NOTION_DATA_SOURCE_ID && !databaseUrl) {
    return {
      dataSourceId: NOTION_DATA_SOURCE_ID,
      outputDirName: sanitizeFileName(NOTION_DATA_SOURCE_ID),
    };
  }

  const databaseId = getDatabaseId(databaseUrl);

  try {
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });

    if (!("data_sources" in database) || database.data_sources.length === 0) {
      throw new Error("指定された Notion Database に Data Source が見つかりませんでした");
    }

    if (database.data_sources.length > 1) {
      const candidates = database.data_sources
        .map((source) => `- ${source.name}: ${source.id}`)
        .join("\n");

      throw new Error(
        "指定された Notion Database に複数の Data Source があります。" +
          `NOTION_DATA_SOURCE_ID を .env に設定してください。\n${candidates}`
      );
    }

    const dataSource = database.data_sources[0];

    return {
      dataSourceId: dataSource.id,
      outputDirName: sanitizeFileName(
        dataSource.name || getNotionTitle(database)
      ),
    };
  } catch (error) {
    if (error?.code === "object_not_found") {
      return {
        dataSourceId: databaseId,
        outputDirName: sanitizeFileName(databaseId),
      };
    }

    throw error;
  }
}

function getDatabaseId(databaseUrl) {
  if (databaseUrl) {
    resolvedDatabaseReference = `${DATABASE_URLS_FILE}: ${databaseUrl}`;
    return extractNotionId(databaseUrl);
  }

  if (NOTION_DATABASE_ID) {
    resolvedDatabaseReference = `NOTION_DATABASE_ID=${NOTION_DATABASE_ID}`;
    return extractNotionId(NOTION_DATABASE_ID);
  }

  throw new Error(
    `${DATABASE_URLS_FILE} に Notion Database URL を書くか、NOTION_DATABASE_ID を設定してください`
  );
}

async function readDatabaseUrls() {
  try {
    const text = await fs.readFile(DATABASE_URLS_FILE, "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function extractNotionId(value) {
  const text = String(value ?? "").trim();
  const searchTargets = [];

  try {
    const url = new URL(text);
    searchTargets.push(url.pathname);
  } catch {
    // URLでない場合は文字列全体から抽出する。
  }

  searchTargets.push(text);

  for (const target of searchTargets) {
    const uuidMatch = target.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (uuidMatch) return uuidMatch[0];

    const compactMatch = target.match(/[0-9a-f]{32}/i);
    if (compactMatch) return compactMatch[0];
  }

  throw new Error(`Notion ID を抽出できませんでした: ${value}`);
}

function getNotionTitle(object) {
  return (
    object.title?.map((item) => item.plain_text ?? "").join("") || object.id
  );
}

function isNotionObjectNotFoundError(error) {
  return error?.code === "object_not_found";
}

function formatNotionObjectNotFoundError(error) {
  const currentReference = NOTION_DATA_SOURCE_ID
    ? `NOTION_DATA_SOURCE_ID=${NOTION_DATA_SOURCE_ID}`
    : resolvedDatabaseReference || `NOTION_DATABASE_ID=${NOTION_DATABASE_ID}`;
  const integrationName =
    error.message?.match(/integration "([^"]+)"/)?.[1] ?? "対象の integration";

  return [
    "Notion の Database / Data Source にアクセスできません。",
    "",
    `現在使っている参照: ${currentReference}`,
    `Notion API の応答: ${error.message}`,
    "",
    "対応:",
    `1. Notion で対象の Database を開く`,
    `2. 右上の「...」または「共有」から Connections / コネクトを開く`,
    `3. Integration「${integrationName}」を追加する`,
    "4. 親ページだけでなく、実際の Database に接続されているか確認する",
    "5. 別ワークスペースや別 integration の token を使っていないか確認する",
  ].join("\n");
}

/**
 * Notionのプロパティは長い rich_text / title / relation / people などが
 * ページングされることがあるため、property item APIで最後まで取得する。
 */
async function getFullPropertyItems(pageId, propertyId) {
  const items = [];
  let cursor = undefined;

  while (true) {
    const response = await notion.pages.properties.retrieve({
      page_id: pageId,
      property_id: propertyId,
      start_cursor: cursor,
      page_size: 100,
    });

    if (response.object === "list") {
      items.push(...response.results);

      if (!response.has_more) break;
      cursor = response.next_cursor;
    } else {
      items.push(response);
      break;
    }
  }

  return items;
}

function richTextItemToMarkdown(item) {
  if (!item) return "";

  if (item.type === "equation") {
    return equationToMarkdown(item.equation?.expression);
  }

  return item.plain_text ?? "";
}

function equationToMarkdown(expression) {
  const text = String(expression ?? "");

  if (!text) return "";

  return text.includes("\n")
    ? `$$\n${text}\n$$`
    : `$${text}$`;
}

function propertyItemToText(item) {
  switch (item.type) {
    case "title":
      return richTextItemToMarkdown(item.title);

    case "rich_text":
      return richTextItemToMarkdown(item.rich_text);

    case "number":
      return item.number == null ? "" : String(item.number);

    case "select":
      return item.select?.name ?? "";

    case "multi_select":
      return item.multi_select?.map((x) => x.name).join(", ") ?? "";

    case "status":
      return item.status?.name ?? "";

    case "date":
      if (!item.date) return "";
      return item.date.end
        ? `${item.date.start} - ${item.date.end}`
        : item.date.start;

    case "checkbox":
      return item.checkbox ? "true" : "false";

    case "url":
      return item.url ?? "";

    case "email":
      return item.email ?? "";

    case "phone_number":
      return item.phone_number ?? "";

    case "formula":
      return formulaToText(item.formula);

    case "created_time":
      return item.created_time ?? "";

    case "last_edited_time":
      return item.last_edited_time ?? "";

    case "created_by":
      return item.created_by?.name ?? item.created_by?.id ?? "";

    case "last_edited_by":
      return item.last_edited_by?.name ?? item.last_edited_by?.id ?? "";

    case "people":
      return item.people?.name ?? item.people?.id ?? "";

    case "relation":
      return item.relation?.id ?? "";

    case "rollup":
      return rollupToText(item.rollup);

    case "files":
      return propertyItemToFileUrls(item).join(", ");

    default:
      return "";
  }
}

function formulaToText(formula) {
  if (!formula) return "";

  switch (formula.type) {
    case "string":
      return formula.string ?? "";
    case "number":
      return formula.number == null ? "" : String(formula.number);
    case "boolean":
      return formula.boolean ? "true" : "false";
    case "date":
      if (!formula.date) return "";
      return formula.date.end
        ? `${formula.date.start} - ${formula.date.end}`
        : formula.date.start;
    default:
      return "";
  }
}

function rollupToText(rollup) {
  if (!rollup) return "";

  switch (rollup.type) {
    case "number":
      return rollup.number == null ? "" : String(rollup.number);
    case "date":
      if (!rollup.date) return "";
      return rollup.date.end
        ? `${rollup.date.start} - ${rollup.date.end}`
        : rollup.date.start;
    case "array":
      return rollup.array
        .map((item) => propertyItemToText(item))
        .filter(Boolean)
        .join(", ");
    default:
      return "";
  }
}

function propertyItemToFileUrls(item) {
  if (!item || item.type !== "files") return [];

  return item.files
    .map(fileToUrl)
    .filter(Boolean);
}

function fileToUrl(fileObject) {
  if (!fileObject) return "";

  if (fileObject.type === "external") {
    return fileObject.external?.url ?? "";
  }

  if (fileObject.type === "file") {
    return fileObject.file?.url ?? "";
  }

  return "";
}

async function getPropertyValue(page, propertyName) {
  const prop = page.properties[propertyName];
  if (!prop) return "";

  const items = await getFullPropertyItems(page.id, prop.id);

  if (prop.type === "title" || prop.type === "rich_text") {
    return items.map(propertyItemToText).join("");
  }

  if (prop.type === "files") {
    return items
      .flatMap(propertyItemToFileUrls)
      .filter(Boolean);
  }

  return items
    .map(propertyItemToText)
    .filter(Boolean)
    .join(", ");
}

async function saveImageUrlToAssets(imageUrl, assetsDir, assetBaseName) {
  return withRetries(
    () => saveImageUrlToAssetsOnce(imageUrl, assetsDir, assetBaseName),
    imageUploadRetries,
    `画像保存失敗: ${imageUrl}`
  );
}

async function saveImageUrlToAssetsOnce(imageUrl, assetsDir, assetBaseName) {
  const controller = new AbortController();

  const response = await withTimeout(
    () => fetch(imageUrl, { signal: controller.signal }),
    imageFetchTimeoutMs,
    `画像取得: ${imageUrl}`,
    () => controller.abort()
  );

  if (!response.ok) {
    throw new Error(
      `画像の取得に失敗しました: ${imageUrl} (${response.status})`
    );
  }

  const arrayBuffer = await withTimeout(
    () => response.arrayBuffer(),
    imageFetchTimeoutMs,
    `画像読み込み: ${imageUrl}`,
    () => controller.abort()
  );
  const buffer = Buffer.from(arrayBuffer);
  const extension = getImageExtension(
    imageUrl,
    response.headers.get("content-type")
  );
  const assetFileName = `${assetBaseName}.${extension}`;
  const assetPath = path.join(assetsDir, assetFileName);

  await fs.writeFile(assetPath, buffer);

  return path.posix.join("assets", assetFileName);
}

async function getAllPropertyValues(page) {
  const result = {};

  const allPropertyNames = Object.keys(page.properties);

  const orderedNames = [
    ...PROPERTY_ORDER.filter((name) => allPropertyNames.includes(name)),
    ...allPropertyNames.filter((name) => !PROPERTY_ORDER.includes(name)),
  ];

  for (const propertyName of orderedNames) {
    result[propertyName] = await getPropertyValue(page, propertyName);
  }

  return result;
}

async function convertPageToMarkdown(page, index, assetsDir, assetPrefix = "") {
  const values = await getAllPropertyValues(page);

  const question = values.Question || `Untitled-${index + 1}`;
  const safeFileName = sanitizeFileName(markdownToFileNameText(question));
  const lines = [];

  for (const value of [values.Answer, values.Description]) {
    if (value != null && value !== "") {
      lines.push(String(value));
    }
  }

  const imageUrls = Array.isArray(values.Image)
    ? values.Image
    : values.Image
      ? [values.Image]
      : [];

  if (imageUrls.length > 0) {
    for (let i = 0; i < imageUrls.length; i++) {
      const originalUrl = imageUrls[i];

      try {
        const assetBaseName = sanitizeAssetFileBaseName(
          `${assetPrefix}-${page.id}-${i + 1}`
        );
        const assetRelativePath = await saveImageUrlToAssets(
          originalUrl,
          assetsDir,
          assetBaseName
        );

        lines.push(`![](${assetRelativePath})`);
      } catch (error) {
        lines.push(`画像保存失敗: ${originalUrl}`);
        lines.push(`Error: ${error.message}`);
      }
    }
  }

  return {
    fileName: safeFileName,
    markdown: `${lines.join("\n")}\n`,
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const targets = await getAllDataSourceTargets();

  console.log(`${targets.length} 件のデータベースを処理します`);

  for (const target of targets) {
    const targetOutputDir = path.join(OUTPUT_DIR, target.outputDirName);
    const targetAssetsDir = path.join(targetOutputDir, "assets");

    await fs.mkdir(targetOutputDir, { recursive: true });
    await fs.mkdir(targetAssetsDir, { recursive: true });

    const pages = await getAllDatabasePages(target.dataSourceId);

    console.log(
      `[${target.outputDirName}] ${pages.length} 件のレコードを取得しました`
    );

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      const { fileName, markdown } = await convertPageToMarkdown(
        page,
        i,
        targetAssetsDir,
        `${target.outputDirName}-`
      );

      const filePath = await ensureUniquePath(targetOutputDir, fileName);
      await fs.writeFile(filePath, markdown, "utf8");

      console.log(`[${i + 1}/${pages.length}] ${filePath}`);
    }
  }

  console.log("完了しました");
}

main().catch((error) => {
  if (isNotionObjectNotFoundError(error)) {
    console.error(formatNotionObjectNotFoundError(error));
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
