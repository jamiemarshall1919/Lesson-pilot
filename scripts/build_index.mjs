// scripts/build_index.mjs
// Build public/standards_index.v1.json from every *_standards.json under public/standards/**
//
//   • requires:   OPENAI_API_KEY
//   • optional:   OPENAI_EMBEDDING_MODEL   (default: text-embedding-3-small)
//                 EMBED_BATCH              (default: 64)

import fs   from "fs";
import path from "path";

const ROOT   = path.join(process.cwd(), "public", "standards");
const OUT    = path.join(process.cwd(), "public", "standards_index.v1.json");
const MODEL  = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const BATCH  = Number(process.env.EMBED_BATCH || 64);          // ↓ safer default

/* ──────────── helpers ──────────── */

function isDir(p)  { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile();      } catch { return false; } }

function findStandardsJson(dir, out = []) {
  if (!isDir(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (isDir(full)) findStandardsJson(full, out);
    else if (isFile(full) && /_standards\.json$/i.test(name)) out.push(full);
  }
  return out;
}

function collectRows(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) node.forEach(v => collectRows(v, out));
  else if (typeof node === "object") {
    if (node.code && node.description)
      out.push({ code: String(node.code), description: String(node.description) });
    Object.values(node).forEach(v => collectRows(v, out));
  }
  return out;
}

function textOf(r) {
  const desc = String(r.description || "").replace(/\s+/g, " ").trim();
  return `[${r.curriculum}][${r.subjectKey}][${r.grade}] ${r.code}: ${desc}`;
}

/* ──────────── OpenAI embed with retries ──────────── */
async function embedBatch(texts) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ model: MODEL, input: texts })
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const d = await r.json();
      if (!d?.data) throw new Error("No data field");
      return d.data.map(x => x.embedding);
    } catch (err) {
      const wait = 1500 * (attempt + 1);
      console.warn(`Embed attempt ${attempt + 1} failed (${err.message}); retrying in ${wait} ms…`);
      await new Promise(res => setTimeout(res, wait));
    }
  }
  throw new Error("embedBatch failed after 5 retries");
}

/* ──────────── main ──────────── */
(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌  OPENAI_API_KEY not set"); process.exit(1);
  }

  if (!fs.existsSync(ROOT)) {
    console.error(`❌  standards root missing: ${ROOT}`); process.exit(1);
  }

  const files = findStandardsJson(ROOT);
  if (!files.length) {
    console.log("No *_standards.json found – nothing to index"); process.exit(0);
  }

  const rowsAll = [];
  for (const file of files) {
    const rel        = path.relative(ROOT, file);                 // eg: nys/mathematics_standards.json
    const curriculum = rel.split(path.sep)[0];                     // nys / england / …
    const subjectKey = path.basename(file).replace(/_standards\.json$/i, "");
    const json       = JSON.parse(fs.readFileSync(file, "utf8"));

    for (const [grade, tree] of Object.entries(json)) {
      collectRows(tree).forEach(r =>
        rowsAll.push({ ...r, curriculum, subjectKey, grade })
      );
    }
  }

  if (!rowsAll.length) { console.log("No rows – abort"); process.exit(0); }

  /* ── embed & build index ── */
  const out = [];
  for (let i = 0; i < rowsAll.length; i += BATCH) {
    const batch   = rowsAll.slice(i, i + BATCH);
    const inputs  = batch.map(textOf);
    const vectors = await embedBatch(inputs);

    for (let j = 0; j < batch.length; j++) {
      out.push({ ...batch[j], text: inputs[j], vector: vectors[j] });
    }
    console.log(`Indexed ${Math.min(i + BATCH, rowsAll.length)} / ${rowsAll.length}`);
  }

  /* ── write (streaming) ── */
  console.log(`Writing ${out.length.toLocaleString()} rows → ${OUT}`);
  const ws = fs.createWriteStream(OUT, { encoding: "utf8" });
  ws.write("[\n");
  out.forEach((row, i) => {
    ws.write(JSON.stringify(row));
    if (i !== out.length - 1) ws.write(",\n");
  });
  ws.write("\n]\n");
  ws.end();
  console.log("✔  done");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
