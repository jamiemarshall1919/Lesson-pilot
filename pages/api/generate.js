// align/api-ui: NYS standards lookup + upgraded prompt

import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { grade = "", subject = "", input = "" } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OpenAI API key" });
  }

  // ---------- basic validation ----------
  if (!grade.trim() || !subject.trim() || !input.trim()) {
    return res
      .status(400)
      .json({ error: "Grade, subject, and topic are required." });
  }

  // ---------- subject → JSON file key ----------
  const subjectKeyMap = {
    // Core academics
    "Mathematics": "mathematics",
    "English Language Arts": "ela",
    "Science": "science",
    "Social Studies": "social_studies",

    // World Languages
    "World Languages": "world_languages",

    // Technology / MST
    "Technology": "technology",

    // Health / PE / FCS
    Health: "health_pe_fcs",
    "Physical Education": "health_pe_fcs",
    "Family and Consumer Sciences": "health_pe_fcs",

    // Career Development (CDOS)
    "Career Development": "cdos",

    // The Arts
    Dance: "dance",
    "Media Arts": "media_arts",
    Music: "music",
    Theatre: "theatre",
    "The Arts": "visual_arts",   // UI label for Visual Arts
    "Visual Arts": "visual_arts"
  };

  // ---------- load & match standard ----------
  let matchedStandard = "Not found";
  const fileKey = subjectKeyMap[subject];

  if (fileKey) {
    try {
      const jsonPath = path.join(
        process.cwd(),
        "public",
        "standards",
        `${fileKey}_standards.json`
      );
      const stdJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

      const rows = stdJson[grade] || [];
      const keywords = input.toLowerCase().split(/\W+/);

      const hit = rows.find(r =>
        keywords.some(w => r.description.toLowerCase().includes(w))
      );

      if (hit) matchedStandard = `${hit.code} – ${hit.description}`;
    } catch (e) {
      console.warn("Standard lookup failed:", e.message);
    }
  }

  /* ---------- prompt ---------- */
  const prompt = `
You are a master teacher trained in Singapore’s structured planning approach.
Create a **high-quality, curriculum-aligned lesson plan** in *Markdown* using
the exact template below.  For *Assessment Questions*, include a **Model Answer**
immediately after each question, prefixed with “**Answer:**”.  For *Common
Misconceptions*, list frequent mistakes for this grade/subject and add one-line
corrections.

Template (start output after the line “BEGIN PLAN”):

BEGIN PLAN
**Standard (NYS):** ${matchedStandard}

### 1. Learning Objective
• One clear, concise objective aligned to the standard and suitable for **${grade} ${subject}**.

### 2. Common Misconceptions
- Misconception 1 – short correction  
- Misconception 2 – short correction  
- Misconception 3 – short correction  

### 3. Thinking Questions
1. …  
2. …  
3. …  

### 4. Assessment Questions *(with Model Answers)*
1. Q: …  
   **Answer:** …  
2. Q: …  
   **Answer:** …  
3. Q: …  
   **Answer:** …  

### 5. Suggested Activities
- Activity 1  
- Activity 2  
- Activity 3  

### 6. Differentiation Tips
- **Support:** …  
- **Extension:** …  
END PLAN
Topic provided by teacher: “${input}”
`;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that creates lesson plans."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1100
        })
      }
    );

    const data = await response.json();
    if (data.error) {
      console.error("OpenAI API error:", data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const plan = data.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ result: plan });
  } catch (err) {
    console.error("Request failed:", err);
    return res.status(500).json({ error: "Failed to generate response." });
  }
}
