import React, { useState, useEffect, useRef } from 'react';

function AI({ userCode, messages, setMessages, terminalOutput = [] }) {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const prevMessagesLength = useRef(messages.length);
  const isFirstRender = useRef(true);


  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isFirstRender.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isFirstRender.current = false;
    } else if (messages.length > prevMessagesLength.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLength.current = messages.length;
  }, [messages]);

  // Initialize with welcome message only if no messages exist
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 1,
          type: 'ai',
          content: "Hi! I'm here to help you with your Pandas project. What would you like help with?",
          timestamp: new Date()
        }
      ]);
    }
  }, [messages.length, setMessages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    try {
      const history = messages.slice(-6).map(
        m => `${m.type === 'user' ? 'User' : 'AI'}: ${m.content}`
      ).join('\n');
      const prompt = `You are a helpful Pandas programming tutor.

User's Current Code:
\u0060\u0060\u0060python
${userCode || 'No code written yet'}
\u0060\u0060\u0060

Conversation so far:
${history}

User's latest question: ${inputMessage}

IMPORTANT INSTRUCTIONS:
- Respond ONLY to the user's latest question
- Give small, chat-like responses (2-3 sentences max)
- Focus on actionable, specific feedback for the user's code and question
- DO NOT provide complete code solutions
- Give hints and guidance only
- Only answer what the user has asked. Do NOT suggest next steps unless the user specifically asks.`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 150
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'API failed');
      }

      let aiText = 'Sorry, error occurred. Try again!';
      if (data.choices?.[0]?.message?.content) {
        aiText = data.choices[0].message.content;
      }
      setMessages(prev => [...prev, { id: Date.now() + 1, type: 'ai', content: aiText, timestamp: new Date() }]);
    } catch (error) {
      const errMsg = error.message === 'The operation was aborted' 
        ? 'Timeout. Try again!' 
        : 'Error! Try again.';
      
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        type: 'ai', 
        content: errMsg, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [inputMessage]);

  return (
    <div className="flex flex-col bg-gray-900 text-white h-155">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-semibold text-purple-400">AI Mentor</h2>
        <p className="text-sm text-gray-400 mt-1">
          Ask me anything about your Pandas code
        </p>
      </div>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 text-left space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.type === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-100'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              <div className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 text-gray-100 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {/* Input Area */}
      <div className="p-3 border-t text-left border-gray-700">
        <div className="flex space-x-2 items-end">
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={e => {
              setInputMessage(e.target.value);
              if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
              }
            }}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about your project..."
            className="flex-1 bg-gray-800 text-left text-white"
            style={{
              borderRadius: 6,
              padding: '7px 10px',
              fontSize: 14,
              minHeight: 40,
              maxHeight: 120,
              resize: 'none',
              lineHeight: 1.3,
              outline: 'none',
              border: '1px solid #444',
              overflow: 'hidden',
            }}
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            style={{
              background: '#a78bfa',
              color: 'white',
              padding: '6px 14px',
              fontSize: 14,
              borderRadius: 6,
              fontWeight: 600,
              minHeight: 40,
              minWidth: 0,
              border: 'none',
              transition: 'background 0.2s',
              cursor: (!inputMessage.trim() || isLoading) ? 'not-allowed' : 'pointer',
              opacity: (!inputMessage.trim() || isLoading) ? 0.7 : 1,
            }}
            className="transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default AI;
