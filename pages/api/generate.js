// pages/api/generate.js
// RAG for NYS: retrieval + selector + user choice fallback + safe generation

import fs from "fs";
import path from "path";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-nano";
const EMB_MODEL  = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

/* ---------------- helpers ---------------- */

const tokensFrom = (txt) =>
  Array.from(new Set(String(txt || "").toLowerCase().split(/\W+/).filter(Boolean)));

const lexicalScore = (row, toks) => {
  let s = 0;
  const d = String(row.description || "").toLowerCase();
  toks.forEach((t) => { if (d.includes(t)) s += 2; });
  s -= Math.min(2, Math.floor(d.length / 250)); // length penalty
  return s;
};

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedQuery(q) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMB_MODEL, input: q })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.data[0].embedding;
}

async function llmScore(topic, standardText) {
  const sys = { role: "system", content: "You score curriculum alignment. Respond only with valid JSON." };
  const user = {
    role: "user",
    content:
`Score how well the STANDARD matches the TEACHER_TOPIC on a 0 to 6 scale.
Return JSON: {"score": <number>, "reason": "<max 10 words>"}

TEACHER_TOPIC: "${topic}"
STANDARD: "${standardText}"`
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: CHAT_MODEL, temperature: 0.2, messages: [sys, user], max_tokens: 40 })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const txt = d.choices?.[0]?.message?.content?.trim() || "{}";
  try {
    const j = JSON.parse(txt);
    const sc = typeof j.score === "number" ? j.score : 0;
    return { score: sc, reason: String(j.reason || "") };
  } catch {
    return { score: 0, reason: "parse error" };
  }
}

/* ---------------- lazy-load standards index (works local + Vercel) ---------------- */

let STD_INDEX = null;

async function loadIndex(req) {
  if (STD_INDEX && Array.isArray(STD_INDEX) && STD_INDEX.length) return STD_INDEX;

  // Try filesystem first (local dev)
  try {
    const idxPath = path.join(process.cwd(), "public", "standards_index.v1.json");
    if (fs.existsSync(idxPath)) {
      STD_INDEX = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      console.log("[generate] index loaded from FS:", STD_INDEX.length);
      return STD_INDEX;
    }
  } catch (_) {
    // ignore and try HTTP
  }

  // Serverless: fetch via HTTP. Prefer an explicit base URL if set.
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (req?.headers?.host ? `https://${req.headers.host}` : "");
  const url = base ? `${base.replace(/\/$/, "")}/standards_index.v1.json` : "";

  if (!url) {
    console.warn("[generate] cannot resolve index URL");
    STD_INDEX = [];
    return STD_INDEX;
  }

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    STD_INDEX = await r.json();
    console.log("[generate] index loaded via HTTP:", STD_INDEX.length, url);
  } catch (e) {
    console.warn("[generate] failed to fetch index:", url, e?.message);
    STD_INDEX = [];
  }
  return STD_INDEX;
}

const subjectKeyMap = {
  /* ---------------- NYS ---------------- */
  nys: {
    // Core
    Mathematics:                 "mathematics",
    "English Language Arts":     "ela",
    Science:                     "science",

    // Social-studies PDFs are split K-8 and HS
    "Social Studies (K-8)":      "social_studies_k8",
    "Social Studies (HS)":       "social_studies_hs",

    // Languages & Tech
    "World Languages":           "world_languages",
    Technology:                  "technology",
    "Computer Science":          "computer_science",

    // Health / PE / FCS
    Health:                      "health_pe_fcs",
    "Physical Education":        "physical_education",
    "Family and Consumer Sciences": "health_pe_fcs",

    // Career & CDOS
    "Career Development":        "cdos",

    // The Arts
    Dance:                       "dance",
    "Media Arts":                "media_arts",
    Music:                       "music",
    Theatre:                     "theatre",
    "Visual Arts":               "visual_arts",
    "The Arts":                  "visual_arts"
  },

  /* ---------------- England (add later) ---------------- */
  england: { /* add later */ },

  /* ---------------- Common Core & None ---------------- */
  common_core: {
    Mathematics: "mathematics",
    "English Language Arts": "ela",
    Science: "science",
    "Social Studies": "social_studies_k8"   // default to K-8 set
  },
  none: {
    Mathematics: "mathematics",
    "English Language Arts": "ela",
    Science: "science",
    "Social Studies": "social_studies_k8"
  }
};


const normaliseGrade = (cur, g) => {
  if (!g) return g;
  if (["nys", "common_core", "none"].includes(cur)) {
    const low = g.toLowerCase();
    if (low === "kindergarten") return "Grade K";
    if (/^pre[-\s]?k$/i.test(g) || /^pk$/i.test(g)) return "Grade PK";
    return g;
  }
  return g;
};

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/* ---------------- retrieval: relaxed filters + hybrid scoring ---------------- */

async function retrieveCandidates({ curriculum, subjectKey, gradeKey, input }) {
  if (!STD_INDEX?.length || !subjectKey) return [];

  const gradeKeyNorm = norm(gradeKey);

  // Progressive pools from strict to relaxed
  const pools = [];

  // strict: curriculum + subject + grade
  pools.push(STD_INDEX.filter(r =>
    norm(r.curriculum) === norm(curriculum) &&
    norm(r.subjectKey) === norm(subjectKey) &&
    norm(r.grade) === gradeKeyNorm
  ));

  // relax grade: curriculum + subject
  if (!pools[0].length) {
    pools.push(STD_INDEX.filter(r =>
      norm(r.curriculum) === norm(curriculum) &&
      norm(r.subjectKey) === norm(subjectKey)
    ));
  }

  // relax subject: curriculum only
  if (!pools.at(-1).length) {
    pools.push(STD_INDEX.filter(r => norm(r.curriculum) === norm(curriculum)));
  }

  // last resort: whole index
  if (!pools.at(-1).length) {
    pools.push(STD_INDEX);
  }

  const filtered = pools.find(arr => arr && arr.length) || [];
  if (!filtered.length) return [];

  // Score
  const q = `[${curriculum}][${subjectKey}][${gradeKey}] ${input}`.trim();
  const qv = await embedQuery(q);
  const toks = tokensFrom(input);

  let minLex = Infinity, maxLex = -Infinity;
  const interim = filtered.map(r => {
    const cos = cosine(qv, r.vector);
    const lex = lexicalScore(r, toks);
    if (lex < minLex) minLex = lex;
    if (lex > maxLex) maxLex = lex;
    return { ...r, _cos: cos, _lex: lex };
  });

  const denom = Math.max(1e-6, maxLex - minLex);
  const blended = interim.map(r => {
    const lexNorm = (r._lex - minLex) / denom;
    const score = 0.7 * r._cos + 0.3 * lexNorm;
    return { ...r, scoreRecall: score };
  });

  blended.sort((a, b) => b.scoreRecall - a.scoreRecall);
  return blended.slice(0, 25);
}

async function rerankAndSelect(topic, candidates) {
  if (!candidates.length) return { needsChoice: true, ranked: [] };

  const top = candidates.slice(0, 12);
  const scored = await Promise.all(top.map(async r => {
    const s = await llmScore(topic, `${r.code}: ${r.description}`);
    return { ...r, scoreLLM: s.score, reason: s.reason };
  }));
  scored.sort((a, b) => (b.scoreLLM - a.scoreLLM) || (b.scoreRecall - a.scoreRecall));

  const best = scored[0];
  const threshold = 3.5; // raise to 4.0 if you want more user confirmations
  if (!best || best.scoreLLM < threshold) {
    return { needsChoice: true, ranked: scored.slice(0, 5) };
  }
  return { needsChoice: false, ranked: scored.slice(0, 5), chosen: best };
}

/* ---------------- API handler ---------------- */

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const {
    curriculum = "nys",
    subject = "",
    grade = "",
    input = "",
    numLessons = 1,
    includeQuiz = false,
    forceCode = "" // when user picks a specific code
  } = req.body || {};

  if (!process.env.OPENAI_API_KEY)
    return res.status(500).json({ error: "Missing OpenAI API key" });
  if (!curriculum.trim() || !subject.trim() || !grade.trim() || !input.trim())
    return res.status(400).json({ error: "Curriculum, subject, grade/year, and topic are required." });

  // Ensure index is available in this runtime
  const INDEX = await loadIndex(req);
  res.setHeader("x-index-rows", String(INDEX.length || 0));
  if (!INDEX.length) {
    // No index available, avoid hallucination
    res.setHeader("x-model-used", CHAT_MODEL);
    return res.status(200).json({ needsChoice: true, candidates: [] });
  }

  const gradeKey = normaliseGrade(curriculum, grade);
  const subjectKey = subjectKeyMap[curriculum]?.[subject];

  let chosen = null;
  let ranked = [];

  if (forceCode) {
    // Find exact code with relaxed metadata constraints
    const pools = [];
    pools.push(STD_INDEX.filter(r =>
      norm(r.curriculum) === norm(curriculum) &&
      norm(r.subjectKey) === norm(subjectKey) &&
      norm(r.grade) === norm(gradeKey)
    ));
    if (!pools[0].length) {
      pools.push(STD_INDEX.filter(r =>
        norm(r.curriculum) === norm(curriculum) &&
        norm(r.subjectKey) === norm(subjectKey)
      ));
    }
    if (!pools.at(-1).length) {
      pools.push(STD_INDEX.filter(r => norm(r.curriculum) === norm(curriculum)));
    }
    if (!pools.at(-1).length) pools.push(STD_INDEX);
    const pool = pools.find(arr => arr && arr.length) || [];
    chosen = pool.find(r => r.code === forceCode) || null;
    ranked = pool.slice(0, 5);
  } else {
    const candidates = await retrieveCandidates({ curriculum, subjectKey, gradeKey, input });
    const sel = await rerankAndSelect(input, candidates);
    ranked = sel.ranked;
    if (sel.needsChoice) {
      res.setHeader("x-model-used", CHAT_MODEL);
      return res.status(200).json({
        needsChoice: true,
        candidates: ranked.map(r => ({
          code: r.code,
          description: r.description,
          grade: r.grade,
          subjectKey: r.subjectKey,
          scoreRecall: Number((r.scoreRecall || 0).toFixed(3)),
          scoreLLM: Number((r.scoreLLM || 0).toFixed(3)),
          reason: r.reason || ""
        }))
      });
    }
    chosen = sel.chosen;
  }

  if (!chosen) {
    res.setHeader("x-model-used", CHAT_MODEL);
    return res.status(200).json({ needsChoice: true, candidates: [] });
  }

  const matchedStandard = `${chosen.code} - ${chosen.description}`;

  // Prompt scaffold
  const retrievedBlock = `Context standard (do not quote in output):
• ${chosen.code}: ${chosen.description}`;

  const baseContext = `
Teacher topic: "${input}"
Curriculum: ${curriculum}
Subject: ${subject}
Grade/Year: ${grade}
${retrievedBlock}
Use clear, concise Markdown. No em dashes.
Do not restate or quote the standard code or description anywhere in your output.`.trim();

  const gradeLine = grade ? `Language level: suitable for students in ${grade}.` : "";

  const sectionDefs = [
    { key: "purpose", title: "### 0. Why are we learning this?", instr:
`Write one paragraph no longer than **70 words**.
Start with the big idea.
Mention how understanding it supports critical thinking or future study.
End with "Consider how…" to spark reflection.
No bullet points in the output.` },
    { key: "objective", title: "### 1. Learning Objective", instr:
`Write one measurable objective that:
• Starts with "Students will be able to…".
• Uses a Bloom verb.
• References the specific concept or skill.
• Ends with the standard code in parentheses (e.g., ${chosen.code}).`, fmt: "- {{objective}}" },
    { key: "misconceptions", title: "### 2. Common Misconceptions", instr:
`List exactly **three** misconceptions.
For each: student misconception (≤ 12 words), why it happens (1 sentence), teacher check/fix (1 sentence).`, fmt:
`1. **Student misconception:** {{m1}}
   **Why it happens:** {{c1}}
   **Teacher check / fix:** {{f1}}

2. **Student misconception:** {{m2}}
   **Why it happens:** {{c2}}
   **Teacher check / fix:** {{f2}}

3. **Student misconception:** {{m3}}
   **Why it happens:** {{c3}}
   **Teacher check / fix:** {{f3}}` },
    { key: "thinking", title: "### 3. Thinking Questions", instr:
`Write **three** open-ended questions at Analyze/Evaluate.
Require justification or comparison. Do not supply answers.`, fmt: "1. {{q1}}\n2. {{q2}}\n3. {{q3}}" },
    { key: "assessment", title: "### 4. Assessment Questions (with Model Answers)", instr:
`Create **three** checks for understanding.
Vary formats (MCQ, short answer, diagram label).
Order from recall to application.
After each question, give a model answer prefixed **Answer:**.
Start directly with item 1.`, fmt:
"1. Q: {{a1}}\n   **Answer:** {{aa1}}\n2. Q: {{a2}}\n   **Answer:** {{aa2}}\n3. Q: {{a3}}\n   **Answer:** {{aa3}}" },
    { key: "activities", title: "### 5. Suggested Activities", instr:
`Provide **three** low-prep activities.
Include at least one hands-on and one discussion task.
List materials in parentheses.
Each ≤ 25 words.`, fmt: "- {{act1}}\n- {{act2}}\n- {{act3}}" },
    { key: "diff", title: "### 6. Differentiation Tips", instr:
`Give exactly two strategies: Support (≤ 25 words) and Extension (≤ 25 words).`, fmt:
"- **Support:** {{support}}\n- **Extension:** {{extension}}" }
  ];

  const lessonNos = Array.from({ length: Math.max(1, Math.min(5, +numLessons)) }, (_, i) => i + 1);

  const buildUserMsg = (lessonNo, sec) => ({
    role: "user",
    content:
`${baseContext}
${gradeLine}

Lesson ${lessonNo} of ${lessonNos.length}

Write only the ${sec.key.replace(/^./, m => m.toUpperCase())} section.

${sec.instr}
${sec.fmt ? `\nFormat:\n${sec.fmt}` : ""}`.trim()
  });

  const calls = [];
  lessonNos.forEach(n => sectionDefs.forEach(sec => calls.push({ lesson: n, sec, msg: buildUserMsg(n, sec) })));
  if (includeQuiz) {
    calls.push({
      lesson: 0,
      sec: { key: "quiz", title: "## End-of-Unit Quiz" },
      msg: { role: "user", content:
`${baseContext}
${gradeLine}

Write a short **end-of-unit quiz** (5 questions).
Mix multiple-choice and short-answer.
Provide an answer key afterwards.` }
    });
  }

  async function chat(msg) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: CHAT_MODEL, messages: [
        { role: "system", content: "You are a helpful assistant that creates lesson plans." }, msg
      ], temperature: 0.6, max_tokens: 450 })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.choices?.[0]?.message?.content?.trim() || "";
  }

  try {
    const outputs = await Promise.all(calls.map(c => chat(c.msg)));
    const lessonBlocks = lessonNos.map(n => {
      const secs = sectionDefs.map(sec => {
        const idx = calls.findIndex(c => c.lesson === n && c.sec.key === sec.key);
        return `${sec.title}\n${outputs[idx]}`;
      });
      return `## Lesson ${n} of ${lessonNos.length}\n\n${secs.join("\n\n")}`;
    });
    let md = lessonBlocks.join("\n\n");
    if (includeQuiz) {
      const quizIdx = calls.findIndex(c => c.sec.key === "quiz");
      md += `\n\n${calls[quizIdx].sec.title}\n${outputs[quizIdx]}`;
    }

    // final guard
    md = matchedStandard ? md.replaceAll(matchedStandard, "").trim() : md;

    res.setHeader("x-model-used", CHAT_MODEL);
    res.setHeader("x-index-rows", String(STD_INDEX?.length || 0));
    return res.status(200).json({
      standard: matchedStandard,
      standards: (ranked || []).map(r => ({
        code: r.code,
        description: r.description,
        grade: r.grade,
        subjectKey: r.subjectKey,
        scoreRecall: r.scoreRecall ? Number(r.scoreRecall.toFixed(3)) : undefined,
        scoreLLM: r.scoreLLM ? Number(r.scoreLLM.toFixed(3)) : undefined
      })),
      plan: md
    });
  } catch (e) {
    console.error("Generation failed:", e);
    return res.status(500).json({ error: "Failed to generate response." });
  }
}
