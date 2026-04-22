import React, { useState } from 'react';
import AI from './AI';
import JupyterNotebook from './JupyterNotebook';

function Project() {
  const [chatMessages,  setChatMessages] = useState([]);
  const [userCode,      setUserCode]     = useState('');
  const [lastSyncedAt,  setLastSyncedAt] = useState(null);

  const handleCodeSync = ({ code, savedAt }) => {
    setUserCode(code);
    if (savedAt) setLastSyncedAt(savedAt);
  };

  return (
    <div
      className="flex h-screen pt-12 w-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #09090f 0%, #0d0d1a 50%, #09090f 100%)' }}
    >
      {/* Left: Jupyter Notebook */}
      <div
        className="h-full flex-shrink-0 relative"
        style={{
          width: '950px',
          minWidth: '350px',
          maxWidth: '950px',
          borderRight: '1px solid rgba(139, 92, 246, 0.15)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)' }}
        />
        <JupyterNotebook
          setUserCode={setUserCode}
          onCodeSync={handleCodeSync}
        />
      </div>

      {/* Right: AI Mentor */}
      <div
        className="flex-1 h-full relative"
        style={{ minWidth: 460 }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 100% 0%, rgba(139,92,246,0.04) 0%, transparent 70%)',
          }}
        />
        <AI
          userCode={userCode}
          messages={chatMessages}
          setMessages={setChatMessages}
          terminalOutput={[]}
        />
      </div>
    </div>
  );
}

export default Project;
