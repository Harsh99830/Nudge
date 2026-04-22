import React, { useState, useEffect, useRef } from 'react';

const SparkleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
      fill="url(#sparkle-grad)" stroke="none"/>
    <defs>
      <linearGradient id="sparkle-grad" x1="4" y1="2" x2="20" y2="18" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#a78bfa"/>
        <stop offset="100%" stopColor="#60a5fa"/>
      </linearGradient>
    </defs>
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const AIAvatar = () => (
  <div
    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
    style={{
      background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
      boxShadow: '0 0 12px rgba(124,58,237,0.4)',
    }}
  >
    <SparkleIcon />
  </div>
);

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      {[0, 0.15, 0.3].map((delay, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{
            background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
            animation: `mentorBounce 1.2s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.type === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[78%] px-4 py-3 text-sm text-white leading-relaxed"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            borderRadius: '18px 18px 4px 18px',
            boxShadow: '0 2px 16px rgba(124,58,237,0.25)',
            textAlign: 'left',
          }}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <AIAvatar />
      <div
        className="max-w-[78%] px-4 py-3 text-sm leading-relaxed"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '4px 18px 18px 18px',
          color: '#e2e8f0',
          textAlign: 'left',
        }}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}

function AI({ userCode, messages, setMessages, terminalOutput = [] }) {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const prevMessagesLength = useRef(messages.length);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isFirstRender.current = false;
    } else if (messages.length > prevMessagesLength.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLength.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 1,
        type: 'ai',
        content: "Hey! I'm your AI mentor for this Pandas project. I won't give you the answers directly — but I'll guide you with hints and questions to help you think it through. What are you working on?",
        timestamp: new Date(),
      }]);
    }
  }, [messages.length, setMessages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    const userMessage = { id: Date.now(), type: 'user', content: inputMessage, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const history = messages.slice(-6).map(
        m => `${m.type === 'user' ? 'User' : 'AI'}: ${m.content}`
      ).join('\n');

      const prompt = `You are an experienced data science mentor sitting next to a student who is building a Pandas project in JupyterLite.

Your role:
- Guide the student like a real mentor — ask questions, give hints, point out what to look for
- NEVER give the full solution or write code for them
- Keep responses concise (2-4 sentences), conversational, and encouraging
- If the student is stuck, ask a guiding question instead of solving it
- Reference their actual code when it's available

Student's Current Code:
\`\`\`python
${userCode || 'No code written yet'}
\`\`\`

Conversation so far:
${history}

Student's message: ${inputMessage}

Respond as a mentor — be warm, concise, and guiding. No code solutions.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.6,
          max_tokens: 180,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error?.message || 'API failed');

      const aiText = data.choices?.[0]?.message?.content || 'Something went wrong. Try again!';
      setMessages(prev => [...prev, { id: Date.now() + 1, type: 'ai', content: aiText, timestamp: new Date() }]);
    } catch (error) {
      const errMsg = error.message === 'The operation was aborted'
        ? 'Took too long to respond. Try again!'
        : 'Something went wrong. Please try again.';
      setMessages(prev => [...prev, { id: Date.now() + 1, type: 'ai', content: errMsg, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputMessage]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>

      <style>{`
        @keyframes mentorBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes mentorPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .mentor-scroll::-webkit-scrollbar { width: 4px; }
        .mentor-scroll::-webkit-scrollbar-track { background: transparent; }
        .mentor-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .mentor-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
        .mentor-input::placeholder { color: rgba(255,255,255,0.25); }
      `}</style>

      {/* Header */}
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
              boxShadow: '0 0 20px rgba(124,58,237,0.35)',
            }}
          >
            <SparkleIcon />
          </div>
          <div>
            <h2
              className="text-base font-semibold"
              style={{
                background: 'linear-gradient(90deg, #c4b5fd, #93c5fd)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              AI Mentor
            </h2>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Guiding you, not solving for you
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: '#4ade80',
                boxShadow: '0 0 6px #4ade80',
                animation: 'mentorPulse 2s ease-in-out infinite',
              }}
            />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 mentor-scroll">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <AIAvatar />
            <div
              className="px-4 py-3"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px 18px 18px 18px',
              }}
            >
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 py-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your mentor anything…"
            disabled={isLoading}
            rows={1}
            className="mentor-input"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: '#e2e8f0',
              fontSize: '14px',
              lineHeight: '1.5',
              minHeight: '24px',
              maxHeight: '120px',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: inputMessage.trim() && !isLoading
                ? 'linear-gradient(135deg, #7c3aed, #3b82f6)'
                : 'rgba(255,255,255,0.06)',
              color: inputMessage.trim() && !isLoading ? 'white' : 'rgba(255,255,255,0.2)',
              border: 'none',
              cursor: inputMessage.trim() && !isLoading ? 'pointer' : 'not-allowed',
              boxShadow: inputMessage.trim() && !isLoading ? '0 0 12px rgba(124,58,237,0.4)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <SendIcon />
          </button>
        </div>
        <p className="text-center text-xs mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

export default AI;
