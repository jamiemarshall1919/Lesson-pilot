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

  /* ---------- grade normalization ---------- */
  const normaliseGrade = (cur, g) => {
    if (!g) return g;
    if (["nys", "common_core", "none"].includes(cur)) {
      if (g.toLowerCase() === "kindergarten") return "Grade K";
      if (/^pre[-\s]?k$/i.test(g) || /^pk$/i.test(g)) return "Grade PK";
      return g;
    }
    return g;
  };
  const gradeKey = normaliseGrade(curriculum, grade);

  /* ---------- standards lookup ---------- */
  const subjectKeyMap = {
    nys: {
      Mathematics: "mathematics",
      "English Language Arts": "ela",
      Science: "science",
      "Social Studies": "social_studies",
      "World Languages": "world_languages",
      Technology: "technology",
      "Computer Science": "technology",
      Health: "health_pe_fcs",
      "Physical Education": "health_pe_fcs",
      "Family and Consumer Sciences": "health_pe_fcs",
      "Career Development": "cdos",
      Dance: "dance",
      "Media Arts": "media_arts",
      Music: "music",
      Theatre: "theatre",
      "Visual Arts": "visual_arts",
      "The Arts": "visual_arts",
    },
    england: {
      English: "eng_english",
      Mathematics: "eng_mathematics",
      Biology: "eng_biology",
      Chemistry: "eng_chemistry",
      Physics: "eng_physics",
      "Combined Science": "eng_combined_science",
      Geography: "eng_geography",
      History: "eng_history",
      "Modern Foreign Languages": "eng_mfl",
      Computing: "eng_computing",
      "Design and Technology": "eng_design_technology",
      "Art and Design": "eng_art_design",
      Music: "eng_music",
      "Physical Education": "eng_physical_education",
      "Religious Education": "eng_re",
      Citizenship: "eng_citizenship",
    },
    common_core: {
      Mathematics: "mathematics",
      "English Language Arts": "ela",
      Science: "science",
      "Social Studies": "social_studies",
    },
    none: {
      Mathematics: "mathematics",
      "English Language Arts": "ela",
      Science: "science",
      "Social Studies": "social_studies",
    },
  };

  const collectRows = (node, out = []) => {
    if (!node) return out;
    if (Array.isArray(node)) node.forEach(v => collectRows(v, out));
    else if (typeof node === "object") {
      if (node.code && node.description) {
        out.push({ code: String(node.code), description: String(node.description) });
      }
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

  let matchedStandard = "Not found";
  const subjectKey = subjectKeyMap[curriculum]?.[subject];
  if (subjectKey) {
    const stdPath = path.join(process.cwd(), "public", "standards", curriculum, `${subjectKey}_standards.json`);
    if (fs.existsSync(stdPath)) {
      const json = JSON.parse(fs.readFileSync(stdPath, "utf8"));
      let rows = [];
      if (json[gradeKey]) rows = collectRows(json[gradeKey]);
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

  /* ---------- prompt scaffolding ---------- */
  const sys = { role: "system", content: "You are a helpful assistant that creates lesson plans." };
  const baseContext = `
Teacher topic: "${input}"
Curriculum: ${curriculum}
Subject: ${subject}
Grade/Year: ${grade}
Aligned standard: ${matchedStandard}
Use clear, concise Markdown. No em dashes.
Do not restate or quote the aligned standard anywhere in your output.`;
  const gradeLine = grade ? `Language level: suitable for students in ${grade}.` : "";

  /* ---------- section definitions ---------- */
  const sectionDefs = [
    /* 0. PURPOSE */
    {
      key: "purpose",
      title: "### 0. Why are we learning this?",
      instr: `Write one paragraph no longer than **70 words**.
• Start with the big idea (e.g., “Hamlet explores moral choice under pressure”).
• Mention how understanding it supports critical thinking or future study.
• End with “Consider how…” to spark reflection.
No intros like “The purpose…” and no bullet points in the output.`
    },

    /* 1. LEARNING OBJECTIVE */
    {
      key: "objective",
      title: "### 1. Learning Objective",
      instr: `Write one measurable objective that:
• Starts with “Students will be able to…”.
• Uses a Bloom verb appropriate for the grade.
• References the specific concept or skill.
• Ends with the aligned standard code in parentheses (e.g., NY-ELA.9.R.1).`,
      fmt: "- {{objective}}"
    },

    /* 2. COMMON MISCONCEPTIONS */
    {
      key: "misconceptions",
      title: "### 2. Common Misconceptions",
      instr: `List exactly **three** misconceptions routinely seen at this grade.
For each:
• **Student misconception** – **≤ 12 words**.
• **Why it happens** – one sentence cause.
• **Teacher check / fix** – one sentence diagnostic or correction activity.
Keep it concise and teacher-focused.`,
      fmt:
`1. **Student misconception:** {{mis1}}
   **Why it happens:** {{cause1}}
   **Teacher check / fix:** {{fix1}}

2. **Student misconception:** {{mis2}}
   **Why it happens:** {{cause2}}
   **Teacher check / fix:** {{fix2}}

3. **Student misconception:** {{mis3}}
   **Why it happens:** {{cause3}}
   **Teacher check / fix:** {{fix3}}`
    },

    /* 3. THINKING QUESTIONS */
    {
      key: "thinking",
      title: "### 3. Thinking Questions",
      instr: `Write **three** open-ended questions at Bloom’s Analyze/Evaluate level.
Align each to the objective and require justification or comparison.
Do not supply answers.`,
      fmt: "1. {{q1}}\n2. {{q2}}\n3. {{q3}}"
    },

    /* 4. ASSESSMENT */
    {
      key: "assessment",
      title: "### 4. Assessment Questions (with Model Answers)",
      instr: `Create **three** checks for understanding:
• Vary formats (e.g., MCQ, short answer, diagram label).
• Order from recall to application.
• After each question, give a model answer prefixed **Answer:**.
Start directly with item 1—no extra headings.`,
      fmt:
"1. Q: {{aQ1}}\n   **Answer:** {{aA1}}\n2. Q: {{aQ2}}\n   **Answer:** {{aA2}}\n3. Q: {{aQ3}}\n   **Answer:** {{aA3}}"
    },

    /* 5. ACTIVITIES */
    {
      key: "activities",
      title: "### 5. Suggested Activities",
      instr: `Provide **three** low-prep activities:
• Include at least one hands-on/inquiry and one discussion-based task.
• List required materials in parentheses.
• Each activity ≤ 25 words.
Do not repeat the section title or key in your response.`,
      fmt: "- {{act1}}\n- {{act2}}\n- {{act3}}"
    },

    /* 6. DIFFERENTIATION TIPS */
    {
      key: "diff",
      title: "### 6. Differentiation Tips",
      instr: `Give exactly two strategies:
• **Support:** scaffold for learners who need help (≤ 25 words).
• **Extension:** enrichment for those ready to go deeper (≤ 25 words).
Do not repeat the section title or key in your response.`,
      fmt: "- **Support:** {{support}}\n- **Extension:** {{extension}}"
    }
  ];

  /* ---------- build chat calls ---------- */
  const lessonNos = Array.from(
    { length: Math.max(1, Math.min(5, +numLessons)) },
    (_, i) => i + 1
  );

  const buildUserMsg = (lessonNo, sec) => ({
    role: "user",
    content: `${baseContext}
${gradeLine}

Lesson ${lessonNo} of ${lessonNos.length}

Write only the ${sec.key.replace(/^./, m => m.toUpperCase())} section.

${sec.instr}
${sec.fmt ? `\nFormat:\n${sec.fmt}` : ""}`.trim()
  });

  const calls = [];
  lessonNos.forEach(n =>
    sectionDefs.forEach(sec => calls.push({ lesson: n, sec, msg: buildUserMsg(n, sec) }))
  );
  if (includeQuiz) {
    calls.push({
      lesson: 0,
      sec: { key: "quiz", title: "## End-of-Unit Quiz" },
      msg: {
        role: "user",
        content: `${baseContext}
${gradeLine}

Write a short **end-of-unit quiz** (5 questions). Mix multiple-choice and short-answer. Provide an answer key afterwards.`
      }
    });
  }

  /* ---------- call OpenAI ---------- */
  async function chat(msg) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [sys, msg],
        temperature: 0.7,
        max_tokens: 450
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.choices?.[0]?.message?.content?.trim() || "";
  }

  /* ---------- run in parallel and stitch ---------- */
  try {
    const outputs = await Promise.all(calls.map(c => chat(c.msg)));

    const lessonBlocks = lessonNos.map(n => {
      const secs = sectionDefs.map(sec => {
        const idx = calls.findIndex(
          c => c.lesson === n && c.sec.key === sec.key
        );
        return `${sec.title}\n${outputs[idx]}`;
      });
      return `## Lesson ${n} of ${lessonNos.length}\n\n${secs.join("\n\n")}`;
    });

    let md = lessonBlocks.join("\n\n");
    if (includeQuiz) {
      const quizIdx = calls.findIndex(c => c.sec.key === "quiz");
      md += `\n\n${calls[quizIdx].sec.title}\n${outputs[quizIdx]}`;
    }

    // Guardrail: strip any accidental echoes of the standard
    const stripEcho = (text) =>
      text.replaceAll(matchedStandard, "").replace(/\*\*Standard.*?\n/i, "");

    md = stripEcho(md).trim();

    return res.status(200).json({ standard: matchedStandard, plan: md });
  } catch (e) {
    console.error("Generation failed:", e);
    return res.status(500).json({ error: "Failed to generate response." });
  }
}
