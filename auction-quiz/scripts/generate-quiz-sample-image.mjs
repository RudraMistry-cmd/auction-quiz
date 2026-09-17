/**
 * Renders Round-1 quiz questions (from round1-quiz-bank.json) into images
 * using the SAME templates/question_template.html as the auction round
 * questions, so the visual style matches. Only questions with a "code" field
 * produce an image. Does not touch questions/manifest.json or the live app.
 *
 * Usage:
 *   node scripts/generate-quiz-sample-image.mjs            (renders quiz_01 only)
 *   node scripts/generate-quiz-sample-image.mjs quiz_03    (renders one by id)
 *   node scripts/generate-quiz-sample-image.mjs all        (renders every question with code)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(__dirname, "round1-quiz-bank.json");
const TEMPLATE_PATH = path.join(ROOT, "templates", "question_template.html");
const OUT_DIR = path.join(ROOT, "questions", "round1_sample");

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

// The image contains ONLY the code — nothing else. The question text is the
// "title" and is delivered as plain text alongside the image, and MCQ options
// are delivered as separate text too, per the requested structure.
function buildContentHtml(q) {
  if (!q.code) return "";
  // Override the shared template's margin-top (meant to trail a title/
  // description above it) since here the code is the only element on the page.
  return `<pre style="margin-top:0"><code>${escapeHtml(q.code)}</code></pre>`;
}

async function main() {
  const bank = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const template = readFileSync(TEMPLATE_PATH, "utf8");

  const arg = process.argv[2] || "quiz_01";
  const targets = arg === "all"
    ? bank.questions.filter((q) => q.code)
    : [bank.questions.find((x) => x.id === arg)].filter(Boolean);

  if (targets.length === 0) throw new Error(`No matching question(s) for "${arg}"`);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const chromePath = process.env.CHROME_PATH || findChrome();
  console.log(`Using browser: ${chromePath}`);
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  for (const q of targets) {
    const html = template.replace("{{QUESTION_CONTENT}}", buildContentHtml(q));
    await page.setContent(html, { waitUntil: "load", timeout: 10000 });

    const imagePath = path.join(OUT_DIR, `${q.id}.jpg`);
    await page.screenshot({ path: imagePath, type: "jpeg", quality: 92, fullPage: true });
    console.log(`Rendered ${q.id} -> ${imagePath}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
