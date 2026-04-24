import React, { useState, useEffect, useRef } from 'react';

// ── Colors ───────────────────────────────────────────────────────────────────
// Accent: teal/cyan  (#14b8a6 / #06b6d4)
// No purple anywhere.

const MODES = {
  plan: {
    id: 'plan',
    icon: '📋',
    label: 'Plan',
    zoneTitle: 'PLAN YOUR NEXT STEP',
    heading: 'What are you going to do next?',
    sub: 'Before you write any code, describe your next step in one sentence. Thinking comes first.',
    placeholder: 'e.g., Extract the year from the date column…',
    cta: 'Submit plan',
    systemRole:
      'The student is planning their next step. Acknowledge their plan briefly, check if it makes sense, and ask ONE guiding question to help them think deeper. Do NOT write any code.',
  },
  hint: {
    id: 'hint',
    icon: '💡',
    label: 'Hint',
    zoneTitle: 'GET A HINT',
    heading: "Nudge AI",
    placeholder: "I'm trying to… but I'm stuck because…",
    cta: 'Get a hint',
    systemRole:
      'The student is stuck. Give ONE small, specific hint that nudges them forward. Do NOT give the full solution or write code. Be warm and encouraging.',
  },
  check: {
    id: 'check',
    icon: '✓',
    label: 'Check',
    zoneTitle: 'CHECK YOUR APPROACH',
    heading: 'Is your approach right?',
    sub: "Explain your thinking and I'll tell you if you're on the right track — or point out what to reconsider.",
    placeholder: 'My approach is to…',
    cta: 'Check it',
    systemRole:
      "Validate what is correct in the student's approach, flag any misconceptions clearly, and ask one question to deepen their thinking. Do NOT write code.",
  },
  reality: {
    id: 'reality',
    icon: '🔍',
    label: 'Reality',
    zoneTitle: 'REALITY CHECK',
    heading: "Let's look at what your code actually did.",
    sub: 'Run your code, then tell me the output you got. Did it match what you expected?',
    placeholder: 'My code output was… I expected…',
    cta: 'Discuss output',
    systemRole:
      'Help the student compare expected vs actual output. Guide them to understand WHY the result is what it is. Ask one debugging question. Do NOT write code.',
  },
  ask: {
    id: 'ask',
    icon: '?',
    label: 'Ask',
    zoneTitle: 'ASK ANYTHING',
    heading: 'What do you want to know?',
    sub: "Ask anything about pandas, data science, or your project. I'll answer in a way that helps you learn — not just copy-paste.",
    placeholder: 'Ask me anything…',
    cta: 'Ask',
    systemRole:
      "Give hints only. Do NOT give the full solution or write code. Ask guiding questions to help the student think. Keep responses short (max 2 sentences).",
  },
};

const TOOLBAR = ['hint', 'ask'];

// ── Tiny helpers ──────────────────────────────────────────────────────────────

const DiamondIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M5 0L10 5L5 10L0 5Z" fill="#14b8a6"/>
  </svg>
);

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

function ZoneLabel({ text }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <DiamondIcon />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#14b8a6' }}>
        {text}
      </span>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 0.18, 0.36].map((delay, i) => (
        <div key={i} className="w-1.5 h-1.5 rounded-full"
          style={{ background: '#14b8a6', animation: `aiDot 1.1s ease-in-out ${delay}s infinite` }}/>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function AI({ userCode, messages, setMessages, terminalOutput = [], bulbHint, onBulbHintConsumed }) {
  const [activeMode, setActiveMode] = useState('plan');
  const [inputText,  setInputText]  = useState('');
  const [isLoading,  setIsLoading]  = useState(false);
  const [logOpen,    setLogOpen]    = useState(false);
  const [projectInfo, setProjectInfo] = useState({ title: '', goal: '', time: '0 min' });
  const [elapsedMin,  setElapsedMin]  = useState(0);
  const [bulbHintText,  setBulbHintText]  = useState('');   // AI-generated bulb hint
  const [bulbLoading,   setBulbLoading]   = useState(false); // loading state for bulb hint
  const [hintLevel,     setHintLevel]     = useState(1);     // hint level: 1=subtle, 2=more specific, 3=very specific
  const [storedBulbHint, setStoredBulbHint] = useState(null); // store bulb hint data for re-fetching on level change

  const inputRef    = useRef(null);
  const startTime   = useRef(Date.now());

  // Timer
  useEffect(() => {
    const t = setInterval(() => {
      setElapsedMin(Math.floor((Date.now() - startTime.current) / 60000));
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 130) + 'px';
    }
  }, [inputText]);

  // Reset input on mode switch
  useEffect(() => { setInputText(''); }, [activeMode]);

  // Log messages changes for debugging
  useEffect(() => {
    console.log('[AI] Messages updated:', messages);
  }, [messages]);

  // ── Bulb hint: fire OpenAI when a cell hint is requested ────────────
  useEffect(() => {
    if (!bulbHint) return;
    if (onBulbHintConsumed) onBulbHintConsumed();

    setBulbHintText('');
    setBulbLoading(true);
    setHintLevel(1); // reset to level 1 for new cell
    setStoredBulbHint(bulbHint); // store for re-fetching on level change
    setActiveMode('hint'); // switch to hint tab so the box is visible

    const { cellCode, cellOutput } = bulbHint;

    const prompt = `You are a friendly data-science tutor helping a student who is stuck.

Full notebook code (all cells):
\`\`\`python
${userCode || '# (no code synced yet)'}
\`\`\`

The student clicked the hint bulb on THIS specific cell:
\`\`\`python
${cellCode || '(empty cell)'}
\`\`\`
${cellOutput ? `\nCell output / error:\n${cellOutput}` : ''}

Current hint level: ${hintLevel}
- Level 1: Very subtle hint (max 1 sentence, just a gentle nudge)
- Level 2: More specific hint (1-2 sentences, point to the general area of the problem)
- Level 3: Very specific hint (2 sentences, almost giving the answer but not the exact code)

Your job:

1. If the code is correct, respond: "This looks good. What do you think your next step should be?"

2. If there's a mistake, give a hint based on the current hint level. Do NOT state the error directly.

3. Never give the solution, corrected code, or exact fix.

4. Do NOT use phrases like: "the error is...", "the issue is...", "you should do..."

5. Keep it simple and beginner-friendly.`;


    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 180,
      }),
    })
      .then(r => r.json())
      .then(data => {
        const text = data.choices?.[0]?.message?.content || 'Could not generate a hint. Please try again.';
        setBulbHintText(text);
      })
      .catch(() => setBulbHintText('Something went wrong. Please try again.'))
      .finally(() => setBulbLoading(false));
  }, [bulbHint]);

  // ── Re-fetch hint when hint level changes ──────────────────────────
  useEffect(() => {
    if (!storedBulbHint || hintLevel === 1) return; // only re-fetch for levels 2 and 3

    setBulbLoading(true);
    const { cellCode, cellOutput } = storedBulbHint;

    const prompt = `You are a friendly data-science tutor helping a student who is stuck.

Full notebook code (all cells):
\`\`\`python
${userCode || '# (no code synced yet)'}
\`\`\`

The student clicked the hint bulb on THIS specific cell:
\`\`\`python
${cellCode || '(empty cell)'}
\`\`\`
${cellOutput ? `\nCell output / error:\n${cellOutput}` : ''}

Current hint level: ${hintLevel}
- Level 1: Very subtle hint (max 1 sentence, just a gentle nudge)
- Level 2: More specific hint (1-2 sentences, point to the general area of the problem)
- Level 3: Very specific hint (2 sentences, almost giving the answer but not the exact code)

Your job:

1. If the code is correct, respond: "This looks good. What do you think your next step should be?"

2. If there's a mistake, give a hint based on the current hint level. Do NOT state the error directly.

3. Never give the solution, corrected code, or exact fix.

4. Do NOT use phrases like: "the error is...", "the issue is...", "you should do..."

5. Keep it simple and beginner-friendly.`;


    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.65,
        max_tokens: 180,
      }),
    })
      .then(r => r.json())
      .then(data => {
        const text = data.choices?.[0]?.message?.content || 'Could not generate a hint. Please try again.';
        setBulbHintText(text);
      })
      .catch(() => setBulbHintText('Something went wrong. Please try again.'))
      .finally(() => setBulbLoading(false));
  }, [hintLevel, storedBulbHint, userCode]);

  const handleNextHint = () => {
    if (hintLevel < 3) {
      setHintLevel(prev => prev + 1);
      setBulbLoading(true);
    }
  };

  const mode = MODES[activeMode];

  const handleSubmit = async () => {
    if (!inputText.trim() || isLoading) return;

    console.log('[AI] Submitting message, activeMode:', activeMode);
    const userMsg = { id: Date.now(), mode: activeMode, type: 'user', content: inputText.trim(), ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    const captured = inputText.trim();
    setInputText('');
    setIsLoading(true);

    try {
      const recentLog = messages.slice(-5)
        .map(m => `${m.type === 'user' ? 'Student' : 'Mentor'}: ${m.content}`)
        .join('\n');

      const prompt = `You are an experienced data science mentor. ${mode.systemRole}

Keep your response to 2–4 sentences. Be warm and conversational.

Student's current code:
\`\`\`python
${userCode || '# No code yet'}
\`\`\`

Recent conversation:
${recentLog || '(none)'}

Student says: ${captured}`;

      console.log('[AI] Sending prompt to OpenAI...');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.65,
          max_tokens: 200,
        }),
      });

      const data = await res.json();
      console.log('[AI] OpenAI response:', data);
      if (!res.ok) throw new Error(data?.error?.message || 'API error');

      const reply = data.choices?.[0]?.message?.content || 'Something went wrong. Try again!';
      console.log('[AI] Reply:', reply);
      setMessages(prev => [...prev, { id: Date.now() + 1, mode: activeMode, type: 'ai', content: reply, ts: new Date() }]);
      console.log('[AI] Message added, current messages count:', messages.length + 1);
    } catch (err) {
      console.error('[AI] Error:', err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1, mode: activeMode, type: 'ai',
        content: 'Something went wrong. Please try again.', ts: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // Latest AI response for this mode
  const latestAIResponse = [...messages].reverse().find(m => m.type === 'ai' && m.mode === activeMode);

  const progressDots = 4;
  const filledDots   = Math.min(Math.ceil(elapsedMin / 15), progressDots);

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ background: '#070b0d', color: '#cbd5e1' }}
    >
      <style>{`
        @keyframes aiDot {
          0%,60%,100% { transform:translateY(0); opacity:.4; }
          30%          { transform:translateY(-4px); opacity:1; }
        }
        @keyframes aiPulse {
          0%,100% { opacity:1; }
          50%      { opacity:.35; }
        }
        .ai-scroll::-webkit-scrollbar { width:4px; }
        .ai-scroll::-webkit-scrollbar-track { background:transparent; }
        .ai-scroll::-webkit-scrollbar-thumb { background:rgba(20,184,166,.2); border-radius:2px; }
        .ai-scroll { scrollbar-width:thin; scrollbar-color:rgba(20,184,166,.2) transparent; }
        .ai-input-area { resize:none; background:transparent; border:none; outline:none;
          color:#e2e8f0; font-size:13px; line-height:1.55; width:100%; min-height:24px; font-family:inherit; }
        .ai-input-area::placeholder { color:rgba(203,213,225,.25); }
        .ai-toolbar-btn { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
          transition: all .15s ease; cursor:pointer; }
        .ai-toolbar-btn:hover { background:rgba(20,184,166,.08); border-color:rgba(20,184,166,.25); }
        .ai-toolbar-btn.active { background:rgba(20,184,166,.12); border-color:rgba(20,184,166,.4);
          box-shadow: 0 0 10px rgba(20,184,166,.15); }
        .ai-zone { border:1px solid rgba(255,255,255,.055); border-radius:10px;
          background:rgba(255,255,255,.02); padding:16px; }
      `}</style>

      {/* ── ZONE 1: Project Header ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="ai-zone">

          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm text-white truncate">
                {projectInfo.title || 'Pandas Data Analysis'}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(203,213,225,.45)' }}>
                {projectInfo.goal || 'Goal: Build data analysis skills with real datasets'}
              </p>
            </div>
            <div className="flex-shrink-0 text-xs font-mono" style={{ color: '#14b8a6' }}>
              {elapsedMin} min
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-3">
            {Array.from({ length: progressDots }).map((_, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full transition-all duration-500"
                style={{
                  background: i < filledDots ? '#14b8a6' : 'rgba(255,255,255,.1)',
                  boxShadow: i < filledDots ? '0 0 6px rgba(20,184,166,.5)' : 'none',
                }}/>
            ))}
          </div>
        </div>
      </div>

      {/* ── ZONE 2: Mode Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto ai-scroll px-4 pb-2 flex flex-col justify-center items-center">
        <div className="ai-zone flex flex-col flex-grow justify-center items-center w-full">

          <h3 className="text-base font-bold text-white mb-1.5">{mode.heading}</h3>

          {/* Hint mode: show bulb-triggered hint */}
          {activeMode === 'hint' ? (
            <div className="rounded-lg p-3 w-full"
              style={{ background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)', minHeight: '200px' }}>
              {bulbLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3" style={{ minHeight: 160 }}>
                  <TypingDots />
                  <span style={{ fontSize: 11, color: 'rgba(203,213,225,.4)' }}>Nudge AI is thinking…</span>
                </div>
              ) : bulbHintText ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 16 }}>💡</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: '#14b8a6' }}>NUDGE AI · CELL HINT</span>
                      <span style={{ fontSize: 9, color: 'rgba(203,213,225,.4)' }}>Level {hintLevel}/3</span>
                    </div>
                    {hintLevel < 3 && (
                      <button
                        onClick={handleNextHint}
                        disabled={bulbLoading}
                        style={{
                          fontSize: 14,
                          color: '#14b8a6',
                          background: 'none',
                          border: 'none',
                          cursor: bulbLoading ? 'not-allowed' : 'pointer',
                          padding: 0,
                          opacity: bulbLoading ? 0.5 : 1,
                        }}
                        title="Get a more specific hint"
                      >
                        {bulbLoading ? '...' : '>'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-left" style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                    {bulbHintText}
                  </p>
                  <button
                    onClick={() => setBulbHintText('')}
                    style={{ marginTop: 10, fontSize: 10, color: 'rgba(203,213,225,.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    ✕ dismiss
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full" style={{ minHeight: 160 }}>
                  <span style={{ fontSize: 12, color: 'rgba(203,213,225,.3)', textAlign: 'center' }}>
                    Click 💡 on any cell in the notebook to get a hint here.
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* Ask mode: WhatsApp-style chat interface */
            <div className="w-full flex flex-col h-full">
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3"
                style={{ minHeight: '200px', maxHeight: 'calc(100vh - 400px)' }}>
                {isLoading && messages.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <TypingDots />
                    <span style={{ fontSize: 11, color: 'rgba(203,213,225,.4)' }}>Nudge AI is thinking…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full" style={{ minHeight: 120 }}>
                    <span style={{ fontSize: 12, color: 'rgba(203,213,225,.3)', textAlign: 'center' }}>
                      Ask me anything about your project.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const chatMessages = messages;
                      console.log('[AI] Rendering chat messages:', chatMessages);
                      return chatMessages.map(m => (
                        <div key={m.id} className="flex w-full">
                          {m.type === 'user' ? (
                            <div className="ml-auto max-w-[80%]">
                              <div
                                className="rounded-lg px-3 py-2 text-xs"
                                style={{
                                  background: '#005c4b',
                                  color: '#e9edef',
                                  borderRadius: '8px 8px 0 8px',
                                }}
                              >
                                {m.content}
                              </div>
                              <span className="text-[9px]" style={{ color: 'rgba(203,213,225,.3)' }}>
                                {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            <div className="mr-auto max-w-[80%]">
                              <div
                                className="rounded-lg px-3 py-2 text-xs"
                                style={{
                                  background: '#202c33',
                                  color: '#e9edef',
                                  borderRadius: '8px 8px 8px 0',
                                }}
                              >
                                {m.content}
                              </div>
                              <span className="text-[9px]" style={{ color: 'rgba(203,213,225,.3)' }}>
                                {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                    {isLoading && messages.length > 0 && (
                      <div className="flex w-full">
                        <div className="mr-auto max-w-[80%]">
                          <div
                            className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                            style={{
                              background: '#202c33',
                              color: '#e9edef',
                              borderRadius: '8px 8px 8px 0',
                            }}
                          >
                            <TypingDots />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input area with quick question button */}
              <div className="mt-auto">
                {/* Quick question button */}
                <button
                  onClick={() => {
                    setInputText("What's the next step?");
                    handleSubmit();
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    marginBottom: '8px',
                    fontSize: '11px',
                    color: '#14b8a6',
                    background: 'rgba(20,184,166,.08)',
                    border: '1px solid rgba(20,184,166,.2)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.target.style.background = 'rgba(20,184,166,.12)';
                    e.target.style.borderColor = 'rgba(20,184,166,.3)';
                  }}
                  onMouseLeave={e => {
                    e.target.style.background = 'rgba(20,184,166,.08)';
                    e.target.style.borderColor = 'rgba(20,184,166,.2)';
                  }}
                >
                  What's the next step?
                </button>

                {/* Input box */}
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything…"
                  disabled={isLoading}
                  rows={2}
                  className="ai-input-area rounded-lg p-3"
                  style={{ background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)', minHeight: '60px' }}
                />

                {/* Submit button */}
                <button
                  onClick={handleSubmit}
                  disabled={!inputText.trim() || isLoading}
                  className="w-full py-2 rounded-lg text-sm font-semibold transition-all duration-200 mt-2"
                  style={{
                    background: inputText.trim() && !isLoading
                      ? 'linear-gradient(135deg, #0d9488, #0891b2)'
                      : 'rgba(255,255,255,.05)',
                    color: inputText.trim() && !isLoading ? '#fff' : 'rgba(203,213,225,.25)',
                    border: 'none',
                    cursor: inputText.trim() && !isLoading ? 'pointer' : 'not-allowed',
                    boxShadow: inputText.trim() && !isLoading ? '0 0 16px rgba(13,148,136,.3)' : 'none',
                  }}
                >
                  {isLoading ? 'Thinking…' : 'Ask'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ZONE 3: Toolbar ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="ai-zone" style={{ padding: 12 }}>

          <div className="flex justify-center gap-8">
            {TOOLBAR.map(id => {
              const m = MODES[id];
              return (
                <button
                  key={id}
                  onClick={() => setActiveMode(id)}
                  className={`ai-toolbar-btn rounded-lg flex flex-col items-center gap-1.5 py-2.5 px-6 min-w-[160px]${activeMode === id ? ' active' : ''}`}
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                    color: activeMode === id ? '#14b8a6' : 'rgba(203,213,225,.5)',
                  }}>
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── ZONE 4: Activity Log ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pb-4">
        <div className="ai-zone" style={{ padding: '10px 14px' }}>
          <button
            onClick={() => setLogOpen(o => !o)}
            className="w-full flex items-center justify-between"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div className="flex items-center gap-2">
              <DiamondIcon />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#14b8a6' }}>
                ACTIVITY LOG
              </span>
              {messages.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(20,184,166,.15)', color: '#14b8a6', fontSize: 9 }}>
                  {messages.length}
                </span>
              )}
            </div>
            <ChevronIcon open={logOpen} />
          </button>

          {logOpen && (
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto ai-scroll">
              {messages.length === 0
                ? <p className="text-xs" style={{ color: 'rgba(203,213,225,.3)' }}>No activity yet.</p>
                : [...messages].reverse().map(m => (
                  <div key={m.id} className="text-xs rounded-md px-3 py-2"
                    style={{
                      background: m.type === 'user' ? 'rgba(255,255,255,.04)' : 'rgba(20,184,166,.06)',
                      border: `1px solid ${m.type === 'user' ? 'rgba(255,255,255,.07)' : 'rgba(20,184,166,.12)'}`,
                    }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                      color: m.type === 'user' ? 'rgba(203,213,225,.4)' : '#14b8a6' }}>
                      {m.type === 'user' ? `YOU · ${MODES[m.mode]?.label || m.mode}` : 'MENTOR'}
                    </span>
                    <p className="mt-0.5 leading-relaxed" style={{ color: m.type === 'user' ? '#cbd5e1' : '#e2e8f0' }}>
                      {m.content}
                    </p>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AI;
