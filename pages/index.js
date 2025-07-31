// align/api-ui: validation, nicer formatting, same font as UI

import React, { useState } from 'react';
import Head from 'next/head';
import { marked } from 'marked';           // install with:  npm i marked

export default function Home() {
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [curriculum, setCurriculum] = useState('nys');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  /* ------------ helpers ------------ */
  const generateLessonPlan = async () => {
    setLoading(true);
    setCopied(false);
    setError('');
    setOutput('');

    if (!grade || !subject || !input.trim()) {
      setError('Please select a grade, choose a subject, and enter a topic.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, subject, input, curriculum }),
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
    link.download = `lesson-plan-${grade}-${subject}.txt`;
    link.click();
  };

  /* ------------ render ------------ */
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
          maxWidth: '740px',
        }}>
          <h1 style={{
            textAlign: 'center',
            marginBottom: '2rem',
            fontWeight: 600,
            fontSize: '2rem',
            color: '#1c1c1e'
          }}>Lesson Pilot</h1>

          {/* ---- controls ---- */}
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong>Grade:</strong>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={selectStyle}>
              <option value="">Select grade</option>
              <option value="Kindergarten">Kindergarten</option>
              {[...Array(12)].map((_, i) => (
                <option key={i} value={`Grade ${i + 1}`}>Grade {i + 1}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong>Subject:</strong>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={selectStyle}>
              <option value="">Select subject</option>
              <option value="English Language Arts">English Language Arts</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Science">Science</option>
              <option value="Social Studies">Social Studies</option>
              <option value="The Arts">The Arts</option>
              <option value="Health">Health</option>
              <option value="Physical Education">Physical Education</option>
              <option value="Technology">Technology</option>
              <option value="World Languages">World Languages</option>
              <option value="Computer Science">Computer Science</option>
              <option value="Career Development">Career Development</option>
              <option value="Family and Consumer Sciences">Family and Consumer Sciences</option>
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong>Curriculum:</strong>
            <select value={curriculum} onChange={(e) => setCurriculum(e.target.value)} style={selectStyle}>
              <option value="nys">New York State</option>
              <option value="common_core">Common Core</option>
              <option value="none">None / General</option>
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: '1.5rem' }}>
            <strong>What do you want to teach?</strong>
            <textarea
              rows={4}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ccc', marginTop: '0.5rem' }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>

          <button
            onClick={generateLessonPlan}
            style={{ ...primaryButtonStyle, opacity: (loading || !grade || !subject || !input.trim()) ? 0.6 : 1 }}
            disabled={loading || !grade || !subject || !input.trim()}
          >
            {loading ? 'Generating…' : 'Generate Lesson Plan'}
          </button>

          {/* ---- messages ---- */}
          {error && (
            <p style={{
              marginTop: '1rem',
              background: '#fee',
              color: '#a40000',
              padding: '0.9rem',
              borderRadius: '8px'
            }}>{error}</p>
          )}

          {/* ---- output ---- */}
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
                <button
                  onClick={copyToClipboard}
                  style={secondaryButtonStyle}
                  disabled={!output}
                >
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button
                  onClick={downloadAsTxt}
                  style={secondaryButtonStyle}
                  disabled={!output}
                >
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

/* ---------- styles ---------- */
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
