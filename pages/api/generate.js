// review-only change: no functional edits

import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { grade, subject, input } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OpenAI API key' });
  }

  const standardsPath = path.join(process.cwd(), 'data', `${subject.toLowerCase()}_standards.json`);
  let matchedStandard = 'Not found';

  try {
    const standards = JSON.parse(fs.readFileSync(standardsPath, 'utf8'));
    const gradeKey = `Grade ${grade}`;
    const keywords = input.toLowerCase().split(/\W+/);

    if (standards[gradeKey]) {
      for (const std of standards[gradeKey]) {
        const description = std.description.toLowerCase();
        if (keywords.some(word => description.includes(word))) {
          matchedStandard = `${std.code} – ${std.description}`;
          break;
        }
      }
    }
  } catch (err) {
    console.warn("Could not load or parse standards:", err.message);
  }

  const prompt = `
You are a teaching assistant trained in Singapore’s structured planning approach. Create a clear, high-quality, curriculum-aligned lesson plan using the following format:

Standard: ${matchedStandard}

1. **Learning Objective**  
A clear objective aligned to the above standard and appropriate for Grade ${grade} ${subject}.

2. **Common Misconceptions**  
List 2–3 common misconceptions students may have.

3. **Thinking Questions**  
Write 3 higher-order thinking questions to guide inquiry.

4. **Assessment Questions**  
Write 3 questions to check understanding, including 1 open-ended question.

5. **Suggested Activities**  
Provide 2–3 realistic, classroom-friendly activities requiring minimal prep.

6. **Differentiation Tips**  
Give 1 suggestion for struggling learners and 1 for extension.

Topic: "${input}"
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant that creates lesson plans." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("OpenAI API error:", data.error);
      return res.status(500).json({ error: data.error.message });
    }

    res.status(200).json({ result: data.choices[0].message.content.trim() });
  } catch (err) {
    console.error("Request failed:", err);
    res.status(500).json({ error: "Failed to generate response." });
  }
}
