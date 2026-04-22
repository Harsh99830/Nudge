import React, { useState } from 'react';
import AI from './AI';
import JupyterNotebook from './JupyterNotebook';

// ──────────────────────────────────────────────────────────────────────
//  Project.jsx  –  Pandas project workspace
//
//  Data flow for the Check button:
//    JupyterNotebook (left)
//      ↓  setUserCode(code)       – called on every Sync Notebook upload
//      ↓  onCodeSync({ code, savedAt }) – optional metadata
//    Project.jsx
//      ↓  userCode prop
//    AI.jsx (right)
//      → AI assistant for code help
// ──────────────────────────────────────────────────────────────────────

function Project() {
  const [chatMessages,         setChatMessages]         = useState([]);
  const [userCode,             setUserCode]             = useState('');
  const [lastSyncedAt,         setLastSyncedAt]         = useState(null);

  // Called by JupyterNotebook whenever the student syncs a snapshot
  const handleCodeSync = ({ code, savedAt }) => {
    console.log('[STED] handleCodeSync called. code length:', code?.length, 'First 100 chars:', code?.substring(0, 100), 'savedAt:', savedAt);
    setUserCode(code);
    if (savedAt) setLastSyncedAt(savedAt);
    console.log('[STED] handleCodeSync complete. userCode state updated.');
  };

  return (
    <div className="flex h-screen pt-12 p-3 bg-[#0F0F0F] w-screen">

      {/* ── Left: Jupyter Notebook ── */}
      <div
        className="border border-white h-full text-white"
        style={{ width: '950px', minWidth: '350px', maxWidth: '950px', flexShrink: 0 }}
      >
        <JupyterNotebook
          setUserCode={setUserCode}
          onCodeSync={handleCodeSync}
        />
      </div>

      {/* ── Right: Statement / AI ── */}
      <div
        className="flex-1 h-full text-white p-5 border border-white"
        style={{ backgroundColor: 'rgb(24, 24, 27)', minWidth: 500, borderRadius: 0 }}
      >

        {/* Content */}
        <div className="mt-2">
          <AI
            userCode={userCode}
            messages={chatMessages}
            setMessages={setChatMessages}
            terminalOutput={[]}
          />
        </div>
      </div>
    </div>
  );
}

export default Project;
