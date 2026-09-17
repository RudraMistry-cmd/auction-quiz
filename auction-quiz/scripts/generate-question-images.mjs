/**
 * Renders questions/round2-problem-bank.json into projected question images
 * (templates/question_template.html) and writes questions/manifest.json.
 *
 * Usage:
 *   node scripts/generate-question-images.mjs             (full production run — regenerates
 *                                                            every question image + manifest.json)
 *   node scripts/generate-question-images.mjs <questionId> (sample mode — renders ONE question
 *                                                            into questions/round2_sample/ only;
 *                                                            does not touch manifest.json or the
 *                                                            live questions/ images)
 * Requires a local Chrome/Edge install (puppeteer-core drives it directly,
 * no bundled Chromium download).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(__dirname, "round2-problem-bank.json");
const TEMPLATE_PATH = path.join(ROOT, "templates", "question_template.html");
const OUT_DIR = path.join(ROOT, "questions");
const SAMPLE_OUT_DIR = path.join(ROOT, "questions", "round2_sample");
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

// Every generated image is forced to this exact canvas. The live display
// fits images via object-fit:contain inside a fixed-size frame — a question
// with a long code block naturally renders much TALLER than a short
// description-only one, and object-fit:contain shrinks the taller image far
// more aggressively to make it fit, so its text ends up visibly smaller on
// screen even though the source font-size is identical. Forcing every image
// to the same WxH (auto-shrinking dense content with CSS zoom so it fits,
// rather than letting the canvas grow) keeps every question's on-screen text
// size consistent regardless of how much content it has.
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const LEGIBILITY_WARN_ZOOM = 0.6; // below this, content is technically complete but getting small

async function renderQuestionImage(page, template, q, outPath) {
  const contentHtml = buildContentHtml(q);
  const baseHtml = template.replace("{{QUESTION_CONTENT}}", contentHtml);

  await page.setViewport({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  await page.setContent(baseHtml, { waitUntil: "load", timeout: 10000 });
  const naturalHeight = await page.evaluate(() => document.body.scrollHeight);

  // Shrink-to-fit only — never zoom past 1x, so short questions never risk
  // overflowing the fixed width by being blown up. No floor on how far it
  // can shrink: cutting off content is worse than making it small, so the
  // full content ALWAYS fits — density is only ever surfaced as a warning
  // telling you to trim the question, never silently truncated.
  let zoom = 1;
  if (naturalHeight > CANVAS_HEIGHT) {
    zoom = (CANVAS_HEIGHT / naturalHeight) * 0.97;
    if (zoom < LEGIBILITY_WARN_ZOOM) {
      console.warn(`  ! ${q.id}: content is dense (zoom ${zoom.toFixed(2)}) — everything fits, but consider trimming the code/description for legibility on a projector.`);
    }
    // Zoom the CONTENT wrapper, not <body> itself — body keeps centering
    // (justify-content + min-height:100vh) based on the true, un-zoomed
    // viewport height. Zooming body directly inflates its own 100vh math,
    // which defeats the centering and pins shrunk content to the top.
    const applyZoom = (z) =>
      baseHtml.replace(`<div class="question-content">`, `<div class="question-content" style="zoom:${z}">`);

    await page.setContent(applyZoom(zoom), { waitUntil: "load", timeout: 10000 });
    // Re-measure post-zoom: CSS zoom can round sub-pixel, occasionally
    // leaving content a hair taller than the viewport. Nudge down further
    // if so, rather than risk a 1-2px clip.
    const zoomedHeight = await page.evaluate(() => document.body.scrollHeight);
    if (zoomedHeight > CANVAS_HEIGHT) {
      const adjustedZoom = zoom * (CANVAS_HEIGHT / zoomedHeight) * 0.99;
      await page.setContent(applyZoom(adjustedZoom), { waitUntil: "load", timeout: 10000 });
    }
  }

  await page.screenshot({ path: outPath, type: "jpeg", quality: 92, fullPage: false });
}

function buildContentHtml(q) {
  const parts = [];
  // No title heading — the image shows only the question text, then the
  // example/code, matching the reference layout (plain question text, no
  // bold heading above it).
  parts.push(`<div>${escapeHtml(q.description)}</div>`);

  if (q.example) {
    const inputRow = q.example.input
      ? `<div><span class="ex-label">Input:</span> <span class="ex-value">${escapeHtml(q.example.input)}</span></div>`
      : "";
    parts.push(
      `<div class="example-box">` +
        inputRow +
        `<div><span class="ex-label">Output:</span></div>` +
        `<div class="ex-value">${escapeHtml(q.example.output)}</div>` +
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

  const sampleId = process.argv[2];
  if (sampleId) {
    const q = bank.questions.find((x) => x.id === sampleId);
    if (!q) throw new Error(`Question "${sampleId}" not found in round2-problem-bank.json`);

    if (!existsSync(SAMPLE_OUT_DIR)) mkdirSync(SAMPLE_OUT_DIR, { recursive: true });

    const chromePath = process.env.CHROME_PATH || findChrome();
    console.log(`Using browser: ${chromePath}`);
    const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
    const page = await browser.newPage();

    const imagePath = path.join(SAMPLE_OUT_DIR, `${q.id}.jpg`);
    await renderQuestionImage(page, template, q, imagePath);

    await browser.close();
    console.log(`Rendered sample ${q.id} -> ${imagePath}`);
    console.log(`(Sample only — manifest.json and questions/${q.id}.jpg were NOT touched.)`);
    return;
  }

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

  const manifest = [];

  for (const q of bank.questions) {
    const cat = categoryBySlug.get(q.category);
    const reward = q.reward ?? cat.defaultReward;
    const time = q.time ?? cat.defaultTime;
    if (reward == null) throw new Error(`No reward resolved for ${q.id}`);

    const imageFile = `${q.id}.jpg`;
    await renderQuestionImage(page, template, q, path.join(OUT_DIR, imageFile));

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
