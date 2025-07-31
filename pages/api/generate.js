// align/api-ui: upgraded prompt + safe validation (no NYS standards yet)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { grade = '', subject = '', input = '' } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OpenAI API key' });
  }

  // --- basic validation so we don't burn tokens on empty requests ---
  if (!grade.trim() || !subject.trim() || !input.trim()) {
    return res.status(400).json({ error: 'Grade, subject, and topic are required.' });
  }

  // NYS standards will be plugged in later; placeholder for now
  const matchedStandard = 'To be aligned with NY standards (coming soon)';

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
Topic provided by teacher: "${input}"
`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that creates lesson plans.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1100,
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.error('OpenAI API error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const plan = data.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ result: plan });
  } catch (err) {
    console.error('Request failed:', err);
    return res.status(500).json({ error: 'Failed to generate response.' });
  }
}
