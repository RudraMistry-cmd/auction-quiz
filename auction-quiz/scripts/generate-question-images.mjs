/**
 * Renders questions/round2-problem-bank.json into projected question images
 * (templates/question_template.html) and writes questions/manifest.json.
 *
 * Usage: node scripts/generate-question-images.mjs
 * Requires a local Chrome/Edge install (puppeteer-core drives it directly,
 * no bundled Chromium download).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(__dirname, "round2-problem-bank.json");
const TEMPLATE_PATH = path.join(ROOT, "templates", "question_template.html");
const OUT_DIR = path.join(ROOT, "questions");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("No local Chrome/Edge install found. Set CHROME_PATH env var.");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildContentHtml(q) {
  const parts = [];
  parts.push(`<div class="question-title">${escapeHtml(q.title)}</div>`);
  parts.push(`<div>${escapeHtml(q.description)}</div>`);

  if (q.example) {
    parts.push(
      `<div class="example-box">` +
        `<div><span class="ex-label">Input:</span> ${escapeHtml(q.example.input)}</div>` +
        `<div><span class="ex-label">Output:</span> ${escapeHtml(q.example.output)}</div>` +
      `</div>`
    );
  }

  if (q.note) {
    parts.push(`<div class="note">Note: ${escapeHtml(q.note)}</div>`);
  }

  if (q.code) {
    parts.push(`<pre><code>${escapeHtml(q.code)}</code></pre>`);
  }

  return parts.join("\n");
}

async function main() {
  const bank = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const categoryBySlug = new Map(bank.categories.map((c) => [c.slug, c]));

  // Preserve "used" flags from an existing manifest across re-runs.
  const usedById = new Map();
  if (existsSync(MANIFEST_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
      for (const q of existing) usedById.set(q.id, !!q.used);
    } catch {
      // ignore unparsable existing manifest
    }
  }

  const chromePath = process.env.CHROME_PATH || findChrome();
  console.log(`Using browser: ${chromePath}`);
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const manifest = [];

  for (const q of bank.questions) {
    const cat = categoryBySlug.get(q.category);
    const reward = q.reward ?? cat.defaultReward;
    const time = q.time ?? cat.defaultTime;
    if (reward == null) throw new Error(`No reward resolved for ${q.id}`);

    const html = template.replace("{{QUESTION_CONTENT}}", buildContentHtml(q));

    await page.setContent(html, { waitUntil: "load", timeout: 10000 });
    const imageFile = `${q.id}.jpg`;
    await page.screenshot({
      path: path.join(OUT_DIR, imageFile),
      type: "jpeg",
      quality: 92,
      fullPage: true,
    });

    manifest.push({
      id: q.id,
      title: q.title,
      category: q.category,
      image: imageFile,
      reward,
      time,
      used: usedById.get(q.id) ?? false,
    });
    console.log(`Rendered ${q.id} (${cat.label}) -> ${imageFile}`);
  }

  await browser.close();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${manifest.length} questions to ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
