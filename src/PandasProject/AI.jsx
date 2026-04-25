import React, { useState, useEffect, useRef } from 'react';

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 0.18, 0.36].map((delay, i) => (
        <div key={i} className="w-1.5 h-1.5 rounded-full"
          style={{ background: '#14b8a6', animation: `aiDot 1.1s ease-in-out ${delay}s infinite` }} />
      ))}
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function AI({ userCode, messages, setMessages, terminalOutput = [], bulbHint, onBulbHintConsumed, liveMentorEvent }) {
  const [hintText,       setHintText]       = useState('');   // what shows in the hint box
  const [hintLoading,    setHintLoading]     = useState(false);
  const [hintSource,     setHintSource]      = useState(null); // 'bulb' | 'ask'
  const [hintLevel,      setHintLevel]       = useState(1);
  const [storedBulbHint, setStoredBulbHint]  = useState(null);
  const [askHelpLevel,   setAskHelpLevel]    = useState(1);
  const [storedAskQuestion, setStoredAskQuestion] = useState('');
  const [askHistory,     setAskHistory]      = useState([]);
  const [askInput,       setAskInput]        = useState('');
  const [elapsedMin,     setElapsedMin]      = useState(0);

  const inputRef  = useRef(null);
  const startTime = useRef(Date.now());
  const lastLiveEventKey = useRef('');
  const lastLiveEventAt = useRef(0);

  // Timer
  useEffect(() => {
    const t = setInterval(() =>
      setElapsedMin(Math.floor((Date.now() - startTime.current) / 60000)), 30000);
    return () => clearInterval(t);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 110) + 'px';
    }
  }, [askInput]);

  // ── Bulb triggered ───────────────────────────────────────────────────
  useEffect(() => {
    if (!bulbHint) return;
    if (onBulbHintConsumed) onBulbHintConsumed();
    setHintText('');
    setHintLevel(1);
    setStoredBulbHint(bulbHint);
    setStoredAskQuestion('');
    setAskHistory([]);
    setAskHelpLevel(1);
    setHintSource('bulb');
    setHintLoading(true);
    callAI(buildBulbPrompt(bulbHint, 1));
  }, [bulbHint]);

  // ── Level escalation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!storedBulbHint || hintLevel === 1) return;
    setHintLoading(true);
    callAI(buildBulbPrompt(storedBulbHint, hintLevel));
  }, [hintLevel]);

  // ── Ask escalation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!storedAskQuestion || askHelpLevel === 1) return;
    setHintLoading(true);
    callAI(buildAskPrompt(storedAskQuestion, askHelpLevel));
  }, [askHelpLevel]);

  // Real-time mentor: react to new execution errors, not every keystroke.
  useEffect(() => {
    if (!liveMentorEvent || liveMentorEvent.type !== 'cell-error') return;
    const errorKey = `${liveMentorEvent.cellIndex}:${liveMentorEvent.cellError}`;
    const now = Date.now();
    if (errorKey === lastLiveEventKey.current) return;
    if (now - lastLiveEventAt.current < 12000) return;
    lastLiveEventKey.current = errorKey;
    lastLiveEventAt.current = now;
    setHintText('');
    setHintSource('live-error');
    setHintLoading(true);
    setHintLevel(1);
    setStoredBulbHint(null);
    setStoredAskQuestion('');
    setAskHistory([]);
    setAskHelpLevel(1);
    callAI(buildLiveErrorPrompt(liveMentorEvent));
  }, [liveMentorEvent]);

  // ── Helpers ──────────────────────────────────────────────────────────
  function buildBulbPrompt(hint, level) {
    return `You are a friendly data-science tutor. A student is stuck on a cell.

Full notebook code:
\`\`\`python
${userCode || '# (no code synced yet)'}
\`\`\`

The cell they clicked:
\`\`\`python
${hint.cellCode || '(empty cell)'}
\`\`\`
${hint.cellError || hint.cellOutput ? `\nOutput / error:\n${hint.cellError || hint.cellOutput}` : ''}

Hint level ${level}/3:
- 1: One gentle nudge sentence, do NOT name the problem.
- 2: 1–2 sentences pointing to the general area.
- 3: 2 sentences, very close to the answer but no exact code.

Rules: never give the solution or full code. If code is correct say "This looks correct! What's your next step?"
Be warm and beginner-friendly.`;
  }

  function compactText(text, maxChars = 4500) {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    const head = text.slice(0, Math.floor(maxChars * 0.65));
    const tail = text.slice(-Math.floor(maxChars * 0.25));
    return `${head}\n\n# ... earlier notebook context trimmed ...\n\n${tail}`;
  }

  function buildLiveErrorPrompt(event) {
    return `You are a calm real-time data-science mentor watching a student work in a Jupyter notebook.
The student just ran a cell and got an error, but they have NOT asked for help yet.
Your job is only to notice the error and make them inspect it themselves.

Full notebook context:
\`\`\`python
${compactText(userCode || '# (no live code yet)')}
\`\`\`

Cell with the error:
\`\`\`python
${event.cellCode || '(empty cell)'}
\`\`\`

Error:
${compactText(event.cellError || 'Unknown error', 1800)}

Reply with exactly one short sentence unless the error is impossible to notice without extra context.
Do NOT explain the error, name the cause, mention the likely fix, or provide code.
Ask the student to read the error and tell you what they think caused it.`;
  }

  function buildAskPrompt(question, level = 1) {
    const recentErrorContext = liveMentorEvent?.type === 'cell-error'
      ? `\nMost recent error cell:\n\`\`\`python\n${liveMentorEvent.cellCode || '(empty cell)'}\n\`\`\`\n\nMost recent error output:\n${compactText(liveMentorEvent.cellError || '', 1800)}`
      : '';
    const isNextStepQuestion = /what'?s my next step|what is my next step|next step/i.test(question);
    const recentAskHistory = askHistory.slice(-4)
      .map(turn => `${turn.role === 'student' ? 'Student' : 'Mentor'}: ${turn.content}`)
      .join('\n');
    const previousMentorAskedQuestion = askHistory.slice().reverse()
      .some(turn => turn.role === 'mentor' && /\?\s*$/.test(turn.content || ''));

    return `You are a helpful data-science tutor. The student is working on a pandas project.
Give hints and guidance only. Keep answers concise and warm.
${hintText ? `\nRecent hint shown to student: "${hintText}"` : ''}
${recentAskHistory ? `\nRecent Ask conversation:\n${recentAskHistory}` : ''}
${userCode ? `\nNotebook code:\n\`\`\`python\n${compactText(userCode)}\n\`\`\`` : ''}
${recentErrorContext}
${isNextStepQuestion ? `\nThe student is asking for the next step. Do NOT tell them the next step directly. Vary the response naturally: either ask one short reflective question, or briefly recap what they just did and name the current broad problem, then ask what they think they should do next. Do not mention exact methods, column names, syntax, or code unless the student already named them.` : ''}
${previousMentorAskedQuestion && !isNextStepQuestion ? `\nThe student appears to be answering your previous reflective question. Treat this as a continuation, not a new standalone request. Judge their proposed next step using the notebook/output. If their step is reasonable, say only that it is a good next move and tell them to continue. If it is not reasonable, gently say what broad idea to reconsider. Do NOT add extra tasks, examples, column names, method names, syntax, or code unless the student explicitly asked for them or already named those exact columns/methods. Do NOT ask another open-ended question unless their idea is too vague to evaluate. Keep this response to one short sentence.` : ''}

Help level ${level}/4:
- 1: One sentence only. Give the concept or direction. Do NOT include code, exact syntax, or a full method call.
- 2: One or two sentences. You may name the relevant pandas method or parameter, but do NOT write the exact code line.
- 3: Give a partial code shape with blanks/placeholders, not the completed answer.
- 4: If the student has clearly tried multiple times, you may give the exact minimal syntax.

When the student asks about an error, inspect the code that produced it before giving advice.
Do not give generic debugging advice if the code reveals a specific likely cause.
For pandas errors, pay close attention to method defaults and parameters like axis, columns, index, inplace, sep, header, and encoding.
If a DataFrame method is being used with a column name but the method defaults to rows, guide them toward the relevant parameter instead of telling them only to inspect df.columns.
If the student asks "how can I..." for a normal concept, do not jump to a full answer at level 1.

Student asks: ${question}`;
  }

  function callAI(prompt, onText) {
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
      .then(d => {
        const text = d.choices?.[0]?.message?.content || 'Could not generate a response.';
        setHintText(text);
        if (onText) onText(text);
      })
      .catch(() => setHintText('Something went wrong. Please try again.'))
      .finally(() => setHintLoading(false));
  }

  // ── Ask ──────────────────────────────────────────────────────────────
  const handleAsk = () => {
    const q = askInput.trim();
    if (!q || hintLoading) return;
    setAskInput('');
    setHintText('');
    setHintSource('ask');
    setHintLoading(true);
    setHintLevel(1);
    setAskHelpLevel(1);
    setStoredBulbHint(null); // ask replaces bulb context
    setStoredAskQuestion(q);
    const nextHistory = [...askHistory.slice(-5), { role: 'student', content: q }];
    setAskHistory(nextHistory);
    callAI(buildAskPrompt(q, 1), (reply) => {
      setAskHistory([...nextHistory, { role: 'mentor', content: reply }].slice(-6));
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  };

  const progressDots = 4;
  const filledDots   = Math.min(Math.ceil(elapsedMin / 15), progressDots);
  const hasContent   = hintLoading || !!hintText;

  return (
    <div className="flex flex-col h-full" style={{ background: '#070b0d', color: '#cbd5e1' }}>
      <style>{`
        @keyframes aiDot {
          0%,60%,100% { transform:translateY(0); opacity:.4; }
          30%          { transform:translateY(-4px); opacity:1; }
        }
        .ai-scroll::-webkit-scrollbar { width:4px; }
        .ai-scroll::-webkit-scrollbar-track { background:transparent; }
        .ai-scroll::-webkit-scrollbar-thumb { background:rgba(20,184,166,.2); border-radius:2px; }
        .ai-scroll { scrollbar-width:thin; scrollbar-color:rgba(20,184,166,.2) transparent; }
        .ai-textarea { resize:none; background:transparent; border:none; outline:none;
          color:#e2e8f0; font-size:13px; line-height:1.55; width:100%; min-height:24px; font-family:inherit; }
        .ai-textarea::placeholder { color:rgba(203,213,225,.25); }
        .card { border:1px solid rgba(255,255,255,.07); border-radius:12px; background:rgba(255,255,255,.025); }
        .quick-btn:hover { background:rgba(20,184,166,.07) !important; border-color:rgba(20,184,166,.2) !important; color:#e2e8f0 !important; }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="card px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Pandas Data Analysis</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(203,213,225,.4)' }}>
                Build data analysis skills with real datasets
              </p>
            </div>
            <span className="text-xs font-mono" style={{ color: '#14b8a6' }}>{elapsedMin} min</span>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            {Array.from({ length: progressDots }).map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full transition-all duration-500"
                style={{
                  background: i < filledDots ? '#14b8a6' : 'rgba(255,255,255,.1)',
                  boxShadow:  i < filledDots ? '0 0 6px rgba(20,184,166,.5)' : 'none',
                }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Hint Box ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="card p-4">

          {/* Title row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15 }}>{hintSource === 'ask' ? '💬' : hintSource === 'live-error' ? '⚠️' : '💡'}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#14b8a6' }}>
                {hintSource === 'ask'
                  ? 'NUDGE AI · REPLY'
                  : hintSource === 'live-error'
                    ? 'NUDGE AI · LIVE DEBUG'
                    : 'NUDGE AI · CELL HINT'}
              </span>
            </div>
            {(hintSource === 'bulb' || hintSource === 'ask') && !hintLoading && hintText && (
              <span style={{ fontSize: 9, color: 'rgba(203,213,225,.35)' }}>
                Level {hintSource === 'ask' ? askHelpLevel : hintLevel} / {hintSource === 'ask' ? 4 : 3}
              </span>
            )}
          </div>

          {/* Body */}
          {hintLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <TypingDots />
              <span style={{ fontSize: 11, color: 'rgba(203,213,225,.35)' }}>
                {hintSource === 'ask'
                  ? 'Thinking…'
                  : hintSource === 'live-error'
                    ? 'Reading the error…'
                    : 'Analysing your cell…'}
              </span>
            </div>
          ) : hintText ? (
            <>
              <p className="text-xs leading-relaxed text-left" style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                {hintText}
              </p>
              <div className="flex items-center justify-between mt-3">
                {hintSource === 'bulb' && hintLevel < 3 ? (
                  <button
                    onClick={() => setHintLevel(l => l + 1)}
                    style={{
                      fontSize: 11, color: '#14b8a6',
                      background: 'rgba(20,184,166,.08)', border: '1px solid rgba(20,184,166,.2)',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                    }}
                  >
                    Need more help →
                  </button>
                ) : hintSource === 'ask' && askHelpLevel < 4 ? (
                  <button
                    onClick={() => setAskHelpLevel(l => l + 1)}
                    style={{
                      fontSize: 11, color: '#14b8a6',
                      background: 'rgba(20,184,166,.08)', border: '1px solid rgba(20,184,166,.2)',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                    }}
                  >
                    Need more help →
                  </button>
                ) : hintSource === 'bulb' ? (
                  <span style={{ fontSize: 10, color: 'rgba(203,213,225,.3)' }}>Max hint level reached</span>
                ) : hintSource === 'ask' ? (
                  <span style={{ fontSize: 10, color: 'rgba(203,213,225,.3)' }}>Max help level reached</span>
                ) : <span />}
                <button
                  onClick={() => {
                    setHintText('');
                    setHintLevel(1);
                    setAskHelpLevel(1);
                    setStoredBulbHint(null);
                    setStoredAskQuestion('');
                    setHintSource(null);
                  }}
                  style={{ fontSize: 10, color: 'rgba(203,213,225,.3)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ✕ clear
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <span style={{ fontSize: 30, opacity: 0.2 }}>💡</span>
              <p style={{ fontSize: 12, color: 'rgba(203,213,225,.3)', textAlign: 'center', lineHeight: 1.6 }}>
                Click <strong style={{ color: 'rgba(203,213,225,.5)' }}>💡</strong> on a cell for an automatic hint,<br />
                or ask a question below.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Ask ──────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-4 flex flex-col gap-2 min-h-0">
        <div className="card p-4 flex flex-col gap-3 flex-1 min-h-0">

          <div className="flex items-center gap-2 flex-shrink-0">
            <span style={{ fontSize: 13 }}>💬</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#14b8a6' }}>
              ASK A QUESTION
            </span>
          </div>

          {/* Quick prompts — always visible */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {["What's my next step?", "Can you explain this error?", "Am I on the right track?"].map(q => (
              <button
                key={q}
                className="quick-btn"
                onClick={() => {
                  setAskInput(q);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                style={{
                  textAlign: 'left', fontSize: 11, color: 'rgba(203,213,225,.55)',
                  background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
                  borderRadius: 7, padding: '6px 10px', cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input bar */}
          <div
            className="flex items-end gap-2 mt-auto flex-shrink-0"
            style={{
              background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 10, padding: '8px 10px',
            }}
          >
            <textarea
              ref={inputRef}
              value={askInput}
              onChange={e => setAskInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your code or project… (Enter to send)"
              disabled={hintLoading}
              rows={1}
              className="ai-textarea"
            />
            <button
              onClick={handleAsk}
              disabled={!askInput.trim() || hintLoading}
              style={{
                flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: 'none',
                cursor: askInput.trim() && !hintLoading ? 'pointer' : 'not-allowed',
                background: askInput.trim() && !hintLoading
                  ? 'linear-gradient(135deg,#0d9488,#0891b2)' : 'rgba(255,255,255,.06)',
                color: askInput.trim() && !hintLoading ? '#fff' : 'rgba(203,213,225,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .15s',
              }}
            >
              <SendIcon />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default AI;
