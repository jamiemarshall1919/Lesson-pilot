// align/api-ui: curriculum-first UI with dependent Subject + Grade/Year, Markdown output

import React, { useMemo, useState } from 'react';
import Head from 'next/head';
import { marked } from 'marked'; // npm i marked

export default function Home() {
  const [curriculum, setCurriculum] = useState('nys'); // default NYS
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // ----- option sets -----
  const curriculumOptions = [
    { value: 'nys', label: 'New York State' },
    { value: 'england', label: 'England (KS1–4)' },
    { value: 'common_core', label: 'Common Core' },
    { value: 'none', label: 'None / General' },
  ];

  const subjectsByCurriculum = {
    nys: [
      'English Language Arts', 'Mathematics', 'Science', 'Social Studies',
      'World Languages', 'Technology', 'Health', 'Physical Education',
      'Family and Consumer Sciences', 'Career Development',
      'Dance', 'Media Arts', 'Music', 'Theatre', 'Visual Arts'
    ],
    england: [
      'English', 'Mathematics', 'Biology', 'Chemistry', 'Physics',
      'Combined Science', 'Geography', 'History', 'Modern Foreign Languages',
      'Computing', 'Design and Technology', 'Art and Design', 'Music',
      'Physical Education', 'Religious Education', 'Citizenship'
    ],
    common_core: [
      'English Language Arts', 'Mathematics', 'Science', 'Social Studies'
    ],
    none: [
      'English Language Arts', 'Mathematics', 'Science', 'Social Studies'
    ]
  };

  const gradesByCurriculum = {
    nys: ['Kindergarten', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)],
    england: Array.from({ length: 11 }, (_, i) => `Year ${i + 1}`), // Years 1–11
    common_core: ['Kindergarten', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)],
    none: ['Kindergarten', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)],
  };

  const subjectOptions = useMemo(() => subjectsByCurriculum[curriculum] || [], [curriculum]);
  const gradeOptions = useMemo(() => gradesByCurriculum[curriculum] || [], [curriculum]);

  const onCurriculumChange = (val) => {
    setCurriculum(val);
    setSubject('');
    setGrade('');
    setOutput('');
    setError('');
  };

  const generateLessonPlan = async () => {
    setLoading(true);
    setCopied(false);
    setError('');
    setOutput('');

    if (!curriculum || !subject || !grade || !input.trim()) {
      setError('Please select a curriculum, subject, grade or year, and enter a topic.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculum, subject, grade, input }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Request failed with status ${response.status}`);
      }

      const data = await response.json();
      setOutput(data.result || '');
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadAsTxt = () => {
    const blob = new Blob([output], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lesson-plan-${curriculum}-${subject}-${grade}.txt`;
    link.click();
  };

  const gradeLabel = curriculum === 'england' ? 'Year:' : 'Grade:';

  return (
    <>
      <Head>
        <title>Lesson Pilot</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        backgroundColor: '#f5f5f7',
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '3rem 1rem',
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          padding: '2rem',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          width: '100%',
          maxWidth: '760px',
        }}>
          <h1 style={{
            textAlign: 'center',
            marginBottom: '2rem',
            fontWeight: 600,
            fontSize: '2rem',
            color: '#1c1c1e'
          }}>Lesson Pilot</h1>

          {/* Curriculum */}
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong>Curriculum:</strong>
            <select
              value={curriculum}
              onChange={(e) => onCurriculumChange(e.target.value)}
              style={selectStyle}
            >
              {curriculumOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          {/* Subject */}
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong>Subject:</strong>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select subject</option>
              {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          {/* Grade or Year */}
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong>{gradeLabel}</strong>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              style={selectStyle}
            >
              <option value="">{`Select ${curriculum === 'england' ? 'year' : 'grade'}`}</option>
              {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>

          {/* Topic */}
          <label style={{ display: 'block', marginBottom: '1.5rem' }}>
            <strong>What do you want to teach?</strong>
            <textarea
              rows={4}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ccc', marginTop: '0.5rem' }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={curriculum === 'england' ? 'e.g., Photosynthesis (Year 8 Biology)' : 'e.g., Fractions as equal parts'}
            />
          </label>

          <button
            onClick={generateLessonPlan}
            style={{ ...primaryButtonStyle, opacity: (loading || !curriculum || !subject || !grade || !input.trim()) ? 0.6 : 1 }}
            disabled={loading || !curriculum || !subject || !grade || !input.trim()}
          >
            {loading ? 'Generating…' : 'Generate Lesson Plan'}
          </button>

          {error && (
            <p style={{
              marginTop: '1rem',
              background: '#fee',
              color: '#a40000',
              padding: '0.9rem',
              borderRadius: '8px'
            }}>{error}</p>
          )}

          {!loading && output && (
            <>
              <h2 style={{ marginTop: '2.2rem', fontSize: '1.4rem', fontWeight: 600 }}>Generated Plan</h2>
              <article
                style={{
                  background: '#fafafa',
                  padding: '1.35rem',
                  borderRadius: '10px',
                  border: '1px solid #ddd',
                  maxHeight: 520,
                  overflowY: 'auto',
                  lineHeight: 1.65,
                  fontSize: 16,
                }}
                dangerouslySetInnerHTML={{ __html: marked.parse(output) }}
              />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.2rem' }}>
                <button onClick={copyToClipboard} style={secondaryButtonStyle} disabled={!output}>
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button onClick={downloadAsTxt} style={secondaryButtonStyle} disabled={!output}>
                  Download as .txt
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const selectStyle = {
  marginTop: '0.5rem',
  width: '100%',
  padding: '0.55rem',
  borderRadius: '8px',
  border: '1px solid #ccc'
};

const primaryButtonStyle = {
  width: '100%',
  padding: '0.8rem',
  backgroundColor: '#007aff',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: 'pointer',
  transition: 'opacity 0.2s'
};

const secondaryButtonStyle = {
  flex: 1,
  padding: '0.8rem',
  backgroundColor: '#555',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 500,
  cursor: 'pointer'
};
