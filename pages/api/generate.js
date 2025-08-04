// align/api-ui: curriculum-aware standards + multi-lesson & optional quiz (parallel on gpt-4.1-nano)

import fs from "fs";
import path from "path";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-nano";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  /* ---------- inputs ---------- */
  const {
    curriculum = "nys",
    subject = "",
    grade = "",
    input = "",
    numLessons = 1,
    includeQuiz = false,
  } = req.body || {};

  if (!process.env.OPENAI_API_KEY)
    return res.status(500).json({ error: "Missing OpenAI API key" });

  if (!curriculum.trim() || !subject.trim() || !grade.trim() || !input.trim())
    return res
      .status(400)
      .json({ error: "Curriculum, subject, grade/year, and topic are required." });

  /* ---------- grade normalisation ---------- */
  const normaliseGrade = (cur, g) => {
    if (!g) return g;
    if (cur === "nys" || cur === "common_core" || cur === "none") {
      if (g.toLowerCase() === "kindergarten") return "Grade K";
      if (/^pre[-\s]?k$/i.test(g) || /^pk$/i.test(g)) return "Grade PK";
      return g;
    }
    return g; // England etc.
  };
  const gradeKey = normaliseGrade(curriculum, grade);

  /* ---------- subject → JSON key ---------- */
  const subjectKeyMap = {
    nys: {
      "Mathematics": "mathematics",
      "English Language Arts": "ela",
      "Science": "science",
      "Social Studies": "social_studies",
      "World Languages": "world_languages",
      "Technology": "technology",
      "Computer Science": "technology",
      "Health": "health_pe_fcs",
      "Physical Education": "health_pe_fcs",
      "Family and Consumer Sciences": "health_pe_fcs",
      "Career Development": "cdos",
      "Dance": "dance",
      "Media Arts": "media_arts",
      "Music": "music",
      "Theatre": "theatre",
      "Visual Arts": "visual_arts",
      "The Arts": "visual_arts",
    },
    england: {
      "English": "eng_english",
      "Mathematics": "eng_mathematics",
      "Biology": "eng_biology",
      "Chemistry": "eng_chemistry",
      "Physics": "eng_physics",
      "Combined Science": "eng_combined_science",
      "Geography": "eng_geography",
      "History": "eng_history",
      "Modern Foreign Languages": "eng_mfl",
      "Computing": "eng_computing",
      "Design and Technology": "eng_design_technology",
      "Art and Design": "eng_art_design",
      "Music": "eng_music",
      "Physical Education": "eng_physical_education",
      "Religious Education": "eng_re",
      "Citizenship": "eng_citizenship",
    },
    common_core: {
      "Mathematics": "mathematics",
      "English Language Arts": "ela",
      "Science": "science",
      "Social Studies": "social_studies",
    },
    none: {
      "Mathematics": "mathematics",
      "English Language Arts": "ela",
      "Science": "science",
      "Social Studies": "social_studies",
    },
  };

  /* ---------- helpers ---------- */
  const collectRows = (node, out = []) => {
    if (!node) return out;
    if (Array.isArray(node)) node.forEach(v => collectRows(v, out));
    else if (typeof node === "object") {
      if (node.code && node.description)
        out.push({ code: String(node.code), description: String(node.description) });
      Object.values(node).forEach(v => collectRows(v, out));
    }
    return out;
  };

  const tokensFrom = txt =>
    Array.from(new Set(txt.toLowerCase().split(/\W+/).filter(Boolean)));

  const scoreRow = (row, toks) => {
    let s = 0;
    const d = row.description.toLowerCase();
    toks.forEach(t => { if (d.includes(t)) s += 2; });
    s -= Math.min(2, Math.floor(d.length / 250)); // length penalty
    return s;
  };

  /* ---------- load standards ---------- */
  const subjectKey = subjectKeyMap[curriculum]?.[subject];
  let matchedStandard = "Not found";

  if (subjectKey) {
    const candidatePaths = [
      path.join(process.cwd(), "public", "standards", curriculum, `${subjectKey}_standards.json`),
      path.join(process.cwd(), "public", "standards", `${subjectKey}_standards.json`),
    ];
    let json = null;
    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) { json = JSON.parse(fs.readFileSync(p, "utf8")); break; }
      } catch (_) {}
    }

    if (json) {
      let rows = [];
      if (json[gradeKey]) rows = collectRows(json[gradeKey]);
      if (!rows.length && json[grade]) rows = collectRows(json[grade]);
      if (!rows.length) rows = collectRows(json);
      const toks = tokensFrom(input);
      let best = null, bestScore = -Infinity;
      rows.forEach(r => {
        const sc = scoreRow(r, toks);
        if (sc > bestScore) { best = r; bestScore = sc; }
      });
      if (best) matchedStandard = `${best.code} - ${best.description}`;
    }
  }

  /* ---------- build prompts ---------- */
  const sys = { role: "system", content: "You are a helpful assistant that creates lesson plans." };
  const baseContext = `
Teacher topic: "${input}"
Curriculum: ${curriculum}
Subject: ${subject}
Grade/Year: ${grade}
Aligned standard: ${matchedStandard}
Use clear, concise Markdown. No em dashes.`;

  const sectionDefs = [
    { key: "objective",       title: "### 1. Learning Objective",            instr: "Write one clear objective aligned to the standard and appropriate for the selected grade/subject.",                                    fmt:"- One sentence objective." },
    { key: "misconceptions",  title: "### 2. Common Misconceptions",         instr: "List 3 frequent mistakes students make on this topic, each followed by a short correction.",                                           fmt:"- mistake - one-line correction (3 bullets)" },
    { key: "thinking",        title: "### 3. Thinking Questions",            instr: "Write 3 higher-order, inquiry-focused questions.",                                                                                        fmt:"1. ...\\n2. ...\\n3. ..." },
    { key: "assessment",      title: "### 4. Assessment Questions (with Model Answers)", instr: "Write 3 questions to check understanding; include a model answer after each question, prefixed with **Answer:**.", fmt:"1. Q: ...\\n   **Answer:** ... (×3)" },
    { key: "activities",      title: "### 5. Suggested Activities",          instr: "Provide 2-3 realistic, low-prep classroom activities.",                                                                                 fmt:"- Activity 1\\n- Activity 2\\n- Activity 3" },
    { key: "diff",            title: "### 6. Differentiation Tips",          instr: "Give one support idea for struggling learners and one extension idea.",                                                                  fmt:"- **Support:** ...\\n- **Extension:** ..." },
  ];

  const lessonNos = Array.from({ length: Math.max(1, Math.min(5, +numLessons)) }, (_, i) => i + 1);

  const buildUserMsg = (lessonNo, sec) => ({
    role:"user",
    content:
`${baseContext}
Lesson ${lessonNo} of ${lessonNos.length}

Write only the ${sec.key.replace(/^./,m=>m.toUpperCase())} section.

${sec.instr}

Format:
${sec.fmt}`
  });

  // gather all calls
  const calls = [];
  lessonNos.forEach(n => {
    sectionDefs.forEach(sec => calls.push({ lesson:n, sec, msg: buildUserMsg(n, sec) }));
  });
  if (includeQuiz) {
    calls.push({
      lesson: 0,
      sec:{ key:"quiz", title:"## End-of-Unit Quiz" },
      msg:{
        role:"user",
        content:
`${baseContext}

Write a short **end-of-unit quiz** (5 questions). Mix multiple-choice and short-answer. Provide an answer key afterwards.`
      }
    });
  }

  /* ---------- helper to call OpenAI ---------- */
  async function chat(msg){
    const r = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${process.env.OPENAI_API_KEY}` },
      body:JSON.stringify({ model:CHAT_MODEL, messages:[sys,msg], temperature:0.7, max_tokens:400 })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.choices?.[0]?.message?.content?.trim() || "";
  }

  /* ---------- run in parallel ---------- */
  try{
    const outputs = await Promise.all(calls.map(c => chat(c.msg)));

    // stitch per-lesson blocks
    const lessonBlocks = lessonNos.map(n => {
      const secs = sectionDefs.map(sec => {
        const idx = calls.findIndex(c => c.lesson===n && c.sec.key===sec.key);
        return `${sec.title}\n${outputs[idx]}`;
      });
      return `## Lesson ${n} of ${lessonNos.length}\n` + secs.join("\n\n");
    });

    let md = [`**Standard (NYS):** ${matchedStandard}`,"",lessonBlocks.join("\n\n")].join("\n");

    if (includeQuiz) {
      const quizIdx = calls.findIndex(c => c.sec.key==="quiz");
      md += `\n\n${calls[quizIdx].sec.title}\n${outputs[quizIdx]}`;
    }

    return res.status(200).json({ result: md });

  }catch(e){
    console.error("Generation failed:", e);
    return res.status(500).json({ error: "Failed to generate response." });
  }
}
