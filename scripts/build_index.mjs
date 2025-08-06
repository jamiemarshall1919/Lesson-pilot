// scripts/build_index.mjs
// Build a vector index from public/standards/**/**_standards.json
// Output: public/standards_index.v1.json
// Requires: OPENAI_API_KEY in your environment

import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "public", "standards");
const OUT  = path.join(process.cwd(), "public", "standards_index.v1.json");
const MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const BATCH = Number(process.env.EMBED_BATCH || 128);

/* ---------------- utils ---------------- */

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/** Recursively find all *_standards.json under ROOT */
function findStandardsJson(dir, out = []) {
  if (!isDir(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (isDir(full)) {
      findStandardsJson(full, out);
    } else if (isFile(full) && /_standards\.json$/i.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Depth-first collect rows with {code, description} from arbitrary JSON */
function collectRows(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const v of node) collectRows(v, out);
  } else if (typeof node === "object") {
    if (node.code && node.description) {
      out.push({ code: String(node.code), description: String(node.description) });
    }
    for (const v of Object.values(node)) collectRows(v, out);
  }
  return out;
}

/** Normalize text for embedding */
function textOf(row) {
  const desc = String(row.description || "").replace(/\s+/g, " ").trim();
  return `[${row.curriculum}][${row.subjectKey}][${row.grade}] ${row.code}: ${desc}`;
}

/** Call OpenAI embeddings for a batch of strings */
async function embedBatch(texts) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.data.map(x => x.embedding);
}

/* --------------- main build --------------- */

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set");
    process.exit(1);
  }
  if (!fs.existsSync(ROOT)) {
    console.error(`Standards root not found: ${ROOT}`);
    process.exit(1);
  }

  // Discover all standards JSON files
  const files = findStandardsJson(ROOT);
  if (!files.length) {
    console.log("No *_standards.json files found under public/standards");
    process.exit(0);
  }

  // Read and flatten rows across all files
  /** @type {Array<{code:string,description:string,curriculum:string,subjectKey:string,grade:string}>} */
  const rowsAll = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);           // e.g., "nys/mathematics_standards.json"
    const parts = rel.split(path.sep);
    const curriculum = parts.length > 1 ? parts[0] : ""; // folder name if present
    const subjectKey = path.basename(file).replace(/_standards\.json$/i, "");
    const json = JSON.parse(fs.readFileSync(file, "utf8"));

    for (const [grade, tree] of Object.entries(json)) {
      const rows = collectRows(tree, []);
      for (const r of rows) {
        rowsAll.push({
          code: r.code,
          description: r.description,
          curriculum,
          subjectKey,
          grade,
        });
      }
    }
  }

  if (!rowsAll.length) {
    console.log("No standards rows found in the JSON files");
    process.exit(0);
  }

  // Embed in batches
  const out = [];
  for (let i = 0; i < rowsAll.length; i += BATCH) {
    const batch = rowsAll.slice(i, i + BATCH);
    const inputs = batch.map(textOf);
    const vectors = await embedBatch(inputs);
    for (let j = 0; j < batch.length; j++) {
      out.push({
        ...batch[j],
        text: inputs[j],
        vector: vectors[j], // number[]
      });
    }
    const done = Math.min(i + BATCH, rowsAll.length);
    console.log(`Indexed ${done} / ${rowsAll.length}`);
  }

  // Write index
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${OUT}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
