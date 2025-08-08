// pages/index.js
import { parse } from "cookie";
import { getSession, useSession, signOut } from "next-auth/react";
import React, { useMemo, useState } from 'react';
import Head from 'next/head';
import { marked } from 'marked';

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: '/api/auth/signin', permanent: false } };
  const cookies = parse(context.req.headers.cookie || '');
  if (!cookies.region) return { redirect: { destination: '/onboard', permanent: false } };
  return { props: { defaultCurriculum: cookies.region } };
}

export default function Home({ defaultCurriculum }) {
  const { data: session, status } = useSession();
  const loadingSession = status === 'loading';

  const [curriculum, setCurriculum] = useState(defaultCurriculum);
  const [subject,   setSubject]   = useState('');
  const [grade,     setGrade]     = useState('');
  const [input,     setInput]     = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [numLessons,   setNumLessons]   = useState(1);
  const [includeQuiz,  setIncludeQuiz]  = useState(false);

  // RAG states
  const [needsChoice, setNeedsChoice] = useState(false);
  const [candidates,  setCandidates]  = useState([]); // [{code, description, scoreLLM,...}]

  // result states
  const [plan,     setPlan]     = useState('');
  const [standard, setStandard] = useState('');

  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [error,   setError]   = useState('');

  const curriculumOptions = [
    { value: 'nys',        label: 'New York State' },
    { value: 'england',    label: 'England (KS1–4)' },
    { value: 'common_core',label: 'Common Core' },
    { value: 'none',       label: 'None / General' },
  ];
  const subjectsByCurriculum = {
    nys: [
      'English Language Arts','Mathematics','Science','Social Studies',
      'World Languages','Technology','Health','Physical Education',
      'Family and Consumer Sciences','Career Development',
      'Dance','Media Arts','Music','Theatre','Visual Arts'
    ],
    england: [
      'English','Mathematics','Biology','Chemistry','Physics','Combined Science',
      'Geography','History','Modern Foreign Languages','Computing',
      'Design and Technology','Art and Design','Music','Physical Education',
      'Religious Education','Citizenship'
    ],
    common_core: ['English Language Arts','Mathematics','Science','Social Studies'],
    none:        ['English Language Arts','Mathematics','Science','Social Studies'],
  };
  const gradesByCurriculum = {
    nys:         ['Kindergarten', ...Array.from({length:12},(_,i)=>`Grade ${i+1}`)],
    england:     Array.from({length:11},(_,i)=>`Year ${i+1}`),
    common_core: ['Kindergarten', ...Array.from({length:12},(_,i)=>`Grade ${i+1}`)],
    none:        ['Kindergarten', ...Array.from({length:12},(_,i)=>`Grade ${i+1}`)],
  };
  const subjectOptions = useMemo(() => subjectsByCurriculum[curriculum] || [], [curriculum]);
  const gradeOptions   = useMemo(() => gradesByCurriculum[curriculum]   || [], [curriculum]);

  const onCurriculumChange = val => {
    setCurriculum(val);
    setSubject(''); setGrade(''); setPlan(''); setStandard(''); setError('');
    setNeedsChoice(false); setCandidates([]);
  };

  async function callGenerate(body) {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${resp.status})`);
    }
    return resp.json();
  }

  const generateLessonPlan = async () => {
    setLoading(true);
    setCopied(false);
    setError('');
    setPlan('');
    setStandard('');
    setNeedsChoice(false);
    setCandidates([]);

    if (!curriculum || !subject || !grade || !input.trim()) {
      setError('Please choose curriculum, subject, grade / year and enter a topic.');
      setLoading(false);
      return;
    }

    try {
      const data = await callGenerate({ curriculum, subject, grade, input, numLessons, includeQuiz });
      if (data.needsChoice) {
        setNeedsChoice(true);
        setCandidates(data.candidates || []);
        return;
      }
      setPlan(data.plan || '');
      setStandard(data.standard || '');
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const chooseStandard = async (code) => {
    setLoading(true); setError('');
    try {
      const data = await callGenerate({ curriculum, subject, grade, input, numLessons, includeQuiz, forceCode: code });
      setNeedsChoice(false);
      setCandidates([]);
      setPlan(data.plan || '');
      setStandard(data.standard || '');
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(plan).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadAsTxt = () => {
    const blob = new Blob([plan], {type:'text/plain'});
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
        <link rel="icon" href="/favicon.ico"/>
      </Head>

      <div style={{ position: 'relative' }}>
        {!loadingSession && session && (
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            style={{ position: 'absolute', top: 16, right: 16, padding: '0.5rem 1rem',
                     border: '1px solid #333', background: 'transparent', cursor: 'pointer',
                     borderRadius: 4, fontSize: '0.9rem' }}
          >
            Sign out
          </button>
        )}

        <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
                      background:'#f5f5f7',minHeight:'100vh',display:'flex',justifyContent:'center',padding:'3rem 1rem' }}>
          <div style={{ background:'#fff',padding:'2rem',borderRadius:12, boxShadow:'0 4px 20px rgba(0,0,0,0.05)',
                         width:'100%',maxWidth:760 }}>
            <h1 style={{ textAlign:'center',marginBottom:'2rem', fontWeight:600,fontSize:'2rem',color:'#1c1c1e' }}>
              Lesson Pilot
            </h1>

            {/* Curriculum */}
            <label style={{display:'block',marginBottom:'1rem'}}>
              <strong>Curriculum:</strong>
              <select value={curriculum} onChange={e => onCurriculumChange(e.target.value)} style={selectStyle}>
                {curriculumOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            {/* Subject */}
            <label style={{display:'block',marginBottom:'1rem'}}>
              <strong>Subject:</strong>
              <select value={subject} onChange={e => setSubject(e.target.value)} style={selectStyle}>
                <option value="">Select subject</option>
                { (subjectsByCurriculum[curriculum] || []).map(s => <option key={s} value={s}>{s}</option>) }
              </select>
            </label>

            {/* Grade / Year */}
            <label style={{display:'block',marginBottom:'1rem'}}>
              <strong>{gradeLabel}</strong>
              <select value={grade} onChange={e => setGrade(e.target.value)} style={selectStyle}>
                <option value="">{`Select ${curriculum==='england'?'year':'grade'}`}</option>
                { (gradesByCurriculum[curriculum] || []).map(g => <option key={g} value={g}>{g}</option>) }
              </select>
            </label>

            {/* Topic */}
            <label style={{display:'block',marginBottom:'1.5rem'}}>
              <strong>What do you want to teach?</strong>
              <textarea
                rows={4}
                style={{ width:'100%',padding:'0.75rem', borderRadius:8,border:'1px solid #ccc',marginTop:'0.5rem' }}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={ curriculum==='england' ? 'e.g., Photosynthesis (Year 8 Biology)' : 'e.g., Fractions as equal parts' }
              />
            </label>

            {/* Advanced */}
            <div style={{marginBottom:'1rem'}}>
              <button type="button" onClick={() => setShowAdvanced(v => !v)}
                      style={{ background:'none',border:'none', color:'#007aff',cursor:'pointer' }}>
                {showAdvanced ? '▾' : '▸'} Advanced options
              </button>
              {showAdvanced && (
                <div style={{marginTop:'0.75rem',paddingLeft:'1rem'}}>
                  <label style={{display:'block',marginBottom:'0.7rem'}}>
                    <strong>Number of lessons:</strong>
                    <select value={numLessons} onChange={e => setNumLessons(Number(e.target.value))}
                            style={{ ...selectStyle, width:'auto', marginLeft:'0.6rem' }}>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" checked={includeQuiz} onChange={e => setIncludeQuiz(e.target.checked)}
                           style={{marginRight:'0.4rem'}} />
                    Include end-of-unit quiz
                  </label>
                </div>
              )}
            </div>

            {/* Generate */}
            <button
              onClick={generateLessonPlan}
              style={{ ...primaryButtonStyle,
                       opacity: loading || !curriculum || !subject || !grade || !input.trim() ? 0.6 : 1 }}
              disabled={loading || !curriculum || !subject || !grade || !input.trim()}
            >
              {loading ? 'Generating…' : 'Generate Lesson Plan'}
            </button>

            {/* Messages */}
            {error && (
              <p style={{ marginTop:'1rem',background:'#fee', color:'#a40000',padding:'0.9rem',borderRadius:8 }}>
                {error}
              </p>
            )}

            {/* Needs choice UI */}
            {needsChoice && (
              <div style={{ marginTop:'1.2rem', background:'#fff7e6', border:'1px solid #ffd591',
                             padding:'1rem', borderRadius:8 }}>
                <p style={{ marginTop:0, marginBottom:'0.75rem' }}>
                  We found several close standards. Pick one to continue.
                </p>
                <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:'0.6rem' }}>
                  {candidates.map(c => (
                    <li key={c.code}
                        style={{ border:'1px solid #eee', borderRadius:8, padding:'0.75rem', background:'#fff' }}>
                      <div style={{ fontWeight:600 }}>{c.code}</div>
                      <div style={{ fontSize:14, margin:'0.25rem 0 0.5rem' }}>{c.description}</div>
                      <div style={{ fontSize:12, color:'#666' }}>
                        {typeof c.scoreLLM === 'number' ? `LLM score: ${c.scoreLLM}` : null}
                        {typeof c.scoreRecall === 'number' ? `  ·  Recall: ${c.scoreRecall}` : null}
                      </div>
                      <div style={{ marginTop:'0.5rem' }}>
                        <button onClick={() => chooseStandard(c.code)} style={secondaryButtonStyle}>Use this standard</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Output */}
            {!loading && plan && (
              <>
                <h2 style={{ marginTop:'2.2rem',fontSize:'1.4rem',fontWeight:600 }}>Generated Plan</h2>

                {standard && (
                  <details style={{margin:'0 0 1rem'}}>
                    <summary><strong>Aligned Standard</strong></summary>
                    <pre style={{ background:'#fff',border:'1px solid #eee',padding:'0.75rem',
                                   borderRadius:8,whiteSpace:'pre-wrap',lineHeight:1.5 }}>
                      {standard}
                    </pre>
                  </details>
                )}

                <article style={{ background:'#fafafa',padding:'1.35rem',borderRadius:10,
                                   border:'1px solid #ddd',maxHeight:520,overflowY:'auto',
                                   lineHeight:1.65,fontSize:16 }}
                         dangerouslySetInnerHTML={{__html: marked.parse(plan)}}/>

                <div style={{display:'flex',gap:'1rem',marginTop:'1.2rem'}}>
                  <button onClick={copyToClipboard} style={secondaryButtonStyle} disabled={!plan}>
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button onClick={downloadAsTxt} style={secondaryButtonStyle} disabled={!plan}>
                    Download as .txt
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const selectStyle = {
  marginTop:'0.5rem',width:'100%',padding:'0.55rem',
  borderRadius:8,border:'1px solid #ccc'
};
const primaryButtonStyle = {
  width:'100%',padding:'0.8rem',background:'#007aff',
  color:'#fff',border:'none',borderRadius:8,
  fontWeight:600,fontSize:'1rem',cursor:'pointer',
  transition:'opacity 0.2s'
};
const secondaryButtonStyle = {
  padding:'0.6rem 0.8rem',background:'#555',color:'#fff',
  border:'none',borderRadius:8,fontWeight:500,cursor:'pointer'
};
