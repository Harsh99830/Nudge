import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { ref, update, get } from 'firebase/database';
import { db } from '../firebase';

const JUPYTERLITE_LAB = '/jupyterlite/lab/index.html';

// ── Decode whatever JupyterLite stored in IndexedDB ──────────────────
function decodeRawValue(raw) {
  if (!raw) return null;
  if (raw.cells) return raw;
  if (raw.content) {
    if (raw.content.cells) return raw.content;
    if (typeof raw.content === 'string') {
      try { const p = JSON.parse(raw.content); if (p?.cells) return p; } catch (_) {}
    }
  }
  const keys = Object.keys(raw);
  const isUint8 = keys.length > 0 && keys.every(k => !isNaN(k)) && typeof raw[0] === 'number';
  if (isUint8) {
    try {
      const arr = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) arr[i] = raw[i];
      const text = new TextDecoder('utf-8').decode(arr);
      const parsed = JSON.parse(text);
      if (parsed?.cells) return parsed;
      if (parsed?.content?.cells) return parsed.content;
      return parsed;
    } catch (e) {
      console.warn('[STED] Uint8Array decode failed:', e.message);
    }
  }
  if (typeof raw === 'string') {
    try { const q = JSON.parse(raw); if (q?.cells) return q; } catch (_) {}
  }
  return raw;
}

function codeFromNotebook(nb) {
  const notebook = decodeRawValue(nb);
  if (!notebook) return '';
  let cells = notebook.cells;
  if (!cells && notebook.content) cells = notebook.content.cells;
  if (!Array.isArray(cells)) return '';
  return cells
    .filter(c => c.cell_type === 'code')
    .map(c => {
      const source = Array.isArray(c.source) ? c.source.join('') : c.source || '';
      let outputText = '';
      if (Array.isArray(c.outputs) && c.outputs.length > 0) {
        const outputs = c.outputs.map(out => {
          if (out.output_type === 'stream' && out.text)
            return Array.isArray(out.text) ? out.text.join('') : out.text;
          if (out.output_type === 'execute_result' && out.data?.['text/plain'])
            return Array.isArray(out.data['text/plain']) ? out.data['text/plain'].join('') : out.data['text/plain'];
          if (out.output_type === 'error')
            return `ERROR: ${out.ename}: ${out.evalue}`;
          return '';
        }).filter(s => s.trim()).join('\n');
        if (outputs) outputText = '\n# --- Output ---\n' + outputs;
      }
      return source + outputText;
    })
    .filter(s => s.trim())
    .join('\n\n');
}

// ── Bridge: sends cell click info plus lightweight live code/error snapshots.
// The bulb itself is rendered by React in the parent page — no DOM injection needed.
// Version stamp busts the guard on each change.
const BRIDGE_SCRIPT = `
(function() {
  var VER = 'v6';
  if (window.__STED_BRIDGE_VER__ === VER) return;
  window.__STED_BRIDGE_VER__ = VER;

  /* ── IDB helpers ── */
  function openDB() {
    return new Promise(function(resolve, reject) {
      var baseUrl = (window.location.pathname.replace(/\\/lab.*/, '') || '/').replace(/\\/$/, '') + '/';
      var dbName = 'JupyterLite Storage - ' + baseUrl;
      var req = indexedDB.open(dbName);
      req.onerror = function() { reject(new Error('Cannot open IDB: ' + dbName)); };
      req.onsuccess = function(e) { resolve(e.target.result); };
    });
  }

  function getStore(db) {
    var names = Array.from(db.objectStoreNames);
    return names.find(function(s) { return s === 'files'; }) || names[0];
  }

  async function listNotebooks() {
    try {
      var db = await openDB();
      var storeName = getStore(db);
      if (!storeName) return [];
      return new Promise(function(resolve) {
        var tx = db.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).getAllKeys();
        req.onsuccess = function(e) {
          resolve(e.target.result.filter(function(k) { return String(k).endsWith('.ipynb'); }));
        };
        req.onerror = function() { resolve([]); };
      });
    } catch(e) { return []; }
  }

  async function readNotebook(filename) {
    var db = await openDB();
    var storeName = getStore(db);
    if (!storeName) throw new Error('No object store');
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(storeName, 'readonly');
      var store = tx.objectStore(storeName);
      var req = store.get(filename);
      req.onsuccess = function(e) {
        if (e.target.result !== undefined) {
          resolve({ name: filename, content: e.target.result });
        } else {
          var allReq = store.getAllKeys();
          allReq.onsuccess = function(ke) {
            var keys = ke.target.result.filter(function(k) { return String(k).endsWith('.ipynb'); });
            if (!keys.length) { reject(new Error('No .ipynb found')); return; }
            var gr = store.get(keys[0]);
            gr.onsuccess = function(fe) { resolve({ name: keys[0], content: fe.target.result }); };
            gr.onerror = function() { reject(new Error('Cannot read ' + keys[0])); };
          };
          allReq.onerror = function() { reject(new Error('getAllKeys failed')); };
        }
      };
      req.onerror = function() { reject(new Error('Cannot get ' + filename)); };
    });
  }

  /* ── STED_GET_NOTEBOOK handler ── */
  window.addEventListener('message', async function(event) {
    if (!event.data || event.data.type !== 'STED_GET_NOTEBOOK') return;
    var filename = event.data.filename || 'notebook.ipynb';
    try {
      var allNbs = await listNotebooks();
      var target = allNbs.includes(filename) ? filename : (allNbs[0] || filename);
      var result = await readNotebook(target);
      event.source.postMessage({
        type: 'STED_NOTEBOOK_DATA',
        notebook: result.content,
        filename: result.name,
        allFiles: allNbs,
      }, event.origin);
    } catch(err) {
      event.source.postMessage({ type: 'STED_NOTEBOOK_ERROR', error: err.message }, event.origin);
    }
  });

  /* ── Cell click tracker ─────────────────────────────────────────────
     Sends cell position + content to parent. Parent renders the bulb.  */
  function getCellData(cell) {
    var sourceEl = cell.querySelector('.jp-InputArea-editor, .jp-Editor, .CodeMirror');
    var cellCode = sourceEl ? sourceEl.textContent.trim() : '';
    var outputParts = [];
    var errorParts = [];
    cell.querySelectorAll('.jp-OutputArea-output').forEach(function(out) {
      var txt = out.textContent.trim();
      if (txt) outputParts.push(txt);
      if (
        txt &&
        /(^|\\n)\\s*(traceback|syntaxerror|nameerror|typeerror|valueerror|keyerror|filenotfounderror|parsererror|error:)/i.test(txt)
      ) {
        errorParts.push(txt);
      }
    });
    return { cellCode: cellCode, cellOutput: outputParts.join('\\n'), cellError: errorParts.join('\\n') };
  }

  function getNotebookSnapshot() {
    var cells = Array.from(document.querySelectorAll('.jp-CodeCell')).map(function(cell, index) {
      var data = getCellData(cell);
      return {
        index: index,
        cellCode: data.cellCode,
        cellOutput: data.cellOutput,
        cellError: data.cellError,
      };
    }).filter(function(cell) {
      return cell.cellCode || cell.cellOutput || cell.cellError;
    });
    var code = cells.map(function(cell) {
      var block = cell.cellCode || '';
      if (cell.cellOutput) block += '\\n# --- Output ---\\n' + cell.cellOutput;
      return block;
    }).filter(function(text) {
      return text.trim();
    }).join('\\n\\n');
    var errors = cells.filter(function(cell) {
      return cell.cellError || /(^|\\n)\\s*(traceback|syntaxerror|nameerror|typeerror|valueerror|keyerror|filenotfounderror|parsererror|error:)/i.test(cell.cellOutput || '');
    }).map(function(cell) {
      return {
        index: cell.index,
        cellCode: cell.cellCode,
        cellError: cell.cellError || cell.cellOutput,
      };
    });
    return { code: code, cells: cells, errors: errors };
  }

  function hasContent(cell) {
    var el = cell.querySelector('.jp-InputArea-editor, .jp-MarkdownOutput, .jp-Editor, .CodeMirror');
    return el && el.textContent.trim().length > 0;
  }

  function attach(cell) {
    if (cell.dataset.stedTrack) return;
    cell.dataset.stedTrack = 'true';
    cell.addEventListener('mousedown', function() {
      if (!hasContent(cell)) {
        window.parent.postMessage({ type: 'STED_CELL_BLUR' }, '*');
        return;
      }
      var rect = cell.getBoundingClientRect();
      var data = getCellData(cell);
      window.parent.postMessage({
        type:       'STED_CELL_CLICK',
        top:        rect.top,
        left:       rect.left,
        height:     rect.height,
        cellCode:   data.cellCode,
        cellOutput: data.cellOutput,
        cellError:  data.cellError,
      }, '*');
    });
  }

  function attachAll() {
    document.querySelectorAll('.jp-CodeCell, .jp-MarkdownCell').forEach(attach);
  }

  // Hide bulb when clicking toolbar / outside cells
  document.addEventListener('mousedown', function(e) {
    if (!e.target.closest('.jp-CodeCell, .jp-MarkdownCell')) {
      window.parent.postMessage({ type: 'STED_CELL_BLUR' }, '*');
    }
  });

  attachAll();

  var lastSnapshotKey = '';
  var lastErrorKey = '';
  var snapshotTimer = null;

  function scheduleLiveSnapshot(reason) {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(function() {
      var snapshot = getNotebookSnapshot();
      var snapshotKey = JSON.stringify({
        code: snapshot.code,
        errors: snapshot.errors.map(function(err) {
          return { index: err.index, cellError: err.cellError };
        }),
      });
      if (snapshotKey === lastSnapshotKey) return;
      lastSnapshotKey = snapshotKey;
      window.parent.postMessage({
        type: 'STED_LIVE_CONTEXT',
        reason: reason || 'mutation',
        code: snapshot.code,
        cells: snapshot.cells,
        errors: snapshot.errors,
      }, '*');

      if (snapshot.errors.length > 0) {
        var latest = snapshot.errors[snapshot.errors.length - 1];
        var errorKey = latest.index + ':' + latest.cellError;
        if (errorKey !== lastErrorKey) {
          lastErrorKey = errorKey;
          window.parent.postMessage({
            type: 'STED_CELL_ERROR',
            cellIndex: latest.index,
            cellCode: latest.cellCode,
            cellError: latest.cellError,
            code: snapshot.code,
          }, '*');
        }
      } else {
        lastErrorKey = '';
      }
    }, 900);
  }

  var obs = new MutationObserver(function() {
    document.querySelectorAll(
      '.jp-CodeCell:not([data-sted-track]), .jp-MarkdownCell:not([data-sted-track])'
    ).forEach(attach);
    scheduleLiveSnapshot('mutation');
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  scheduleLiveSnapshot('bridge-ready');

  console.log('[STED Bridge] v6 installed');
})();
`;

export default function JupyterNotebook({ setUserCode, onCodeSync, onBulbHint, onLiveContext }) {
  const { user, isLoaded, isSignedIn } = useUser();

  const [projectKey,   setProjectKey]   = useState(null);
  const [iframeReady,  setIframeReady]  = useState(false);
  const [bridgeReady,  setBridgeReady]  = useState(false);
  const [status,       setStatus]       = useState('');
  const [statusType,   setStatusType]   = useState('info');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [notebooks,    setNotebooks]    = useState([]);
  const [activeNb,     setActiveNb]     = useState('notebook.ipynb');
  const [showPreview,  setShowPreview]  = useState(false);
  const [previewCells, setPreviewCells] = useState([]);
  const [syncing,      setSyncing]      = useState(false);

  // Bulb state — rendered in React, positioned over the iframe using fixed coords
  const [bulbPos, setBulbPos] = useState(null); // { top, left, cellCode, cellOutput }

  const iframeRef   = useRef(null);
  const pendingSync = useRef(null);

  // 1. Fetch project key
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    (async () => {
      try {
        const snap = await get(ref(db, `users/${user.id}`));
        if (snap.exists()) {
          const pk = snap.val()?.pandas?.PandasCurrentProject;
          if (pk) setProjectKey(pk);
        }
      } catch (e) { console.error('fetchProjectKey', e); }
    })();
  }, [isLoaded, isSignedIn, user]);

  // 2. Load saved notebook from Firebase on mount
  useEffect(() => {
    if (!user || !projectKey) return;
    (async () => {
      try {
        const snap = await get(ref(db, `users/${user.id}/pandas/${projectKey}`));
        if (snap.exists()) {
          const data = snap.val();
          if (data.notebook) {
            try {
              const nb   = JSON.parse(data.notebook);
              const code = codeFromNotebook(nb);
              if (setUserCode) setUserCode(code);
              if (onCodeSync)  onCodeSync({ code, savedAt: data.notebookSavedAt });
              if (data.notebookSavedAt) setLastSyncedAt(data.notebookSavedAt);
              setPreviewCells(nb.cells || []);
            } catch (_) {}
          }
        }
      } catch (e) { console.error('loadNotebook', e); }
    })();
  }, [user, projectKey]);

  // 3. Inject bridge via eval()
  const injectBridge = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.eval(BRIDGE_SCRIPT);
      setBridgeReady(true);
      console.log('[STED] Bridge injected');
    } catch (err) {
      console.warn('[STED] Bridge injection failed:', err.message);
    }
  }, []);

  // 4. Handle postMessage from iframe
  useEffect(() => {
    function onMessage(event) {
      if (!event.data) return;

      // Cell clicked inside iframe → compute absolute position and show React bulb
      if (event.data.type === 'STED_CELL_CLICK') {
        const iframeEl = iframeRef.current;
        if (!iframeEl) return;
        const iframeRect = iframeEl.getBoundingClientRect();
        // rect from iframe is relative to iframe viewport; add iframe's page offset
        setBulbPos({
          top:        iframeRect.top  + event.data.top,
          left:       iframeRect.left + event.data.left,
          cellCode:   event.data.cellCode,
          cellOutput: event.data.cellOutput,
          cellError:  event.data.cellError,
        });
        return;
      }

      if (event.data.type === 'STED_CELL_BLUR') {
        setBulbPos(null);
        return;
      }

      if (event.data.type === 'STED_NOTEBOOK_DATA') {
        const { notebook, filename, allFiles } = event.data;
        if (allFiles?.length > 0) setNotebooks(allFiles);
        if (filename) setActiveNb(filename);
        const decoded = decodeRawValue(notebook);
        const code    = codeFromNotebook(decoded);
        const now     = new Date().toISOString();
        if (setUserCode) setUserCode(code);
        if (onCodeSync)  onCodeSync({ code, savedAt: now });
        setLastSyncedAt(now);
        setPreviewCells(decoded?.cells || []);
        setSyncing(false);
        if (user && projectKey) {
          update(ref(db, `users/${user.id}/pandas/${projectKey}`), {
            notebook:         JSON.stringify(decoded),
            notebookSavedAt:  now,
            notebookFilename: filename,
          }).catch(console.error);
        }
        if (pendingSync.current) { pendingSync.current.resolve(decoded); pendingSync.current = null; }
        showToast(`✓ Synced "${filename}"`, 'success');
      }

      if (event.data.type === 'STED_NOTEBOOK_ERROR') {
        const msg = event.data.error || 'Unknown error';
        console.warn('[STED] Notebook error:', msg);
        if (pendingSync.current) { pendingSync.current.reject(new Error(msg)); pendingSync.current = null; }
        setSyncing(false);
        if (msg.includes('No .ipynb')) {
          showToast('No notebook found — create one in JupyterLite first.', 'info');
        } else {
          showToast(`Could not read notebook: ${msg}`, 'error');
        }
      }

      if (event.data.type === 'STED_LIVE_CONTEXT') {
        const code = event.data.code || '';
        if (setUserCode) setUserCode(code);
        if (onLiveContext) onLiveContext({
          code,
          cells: event.data.cells || [],
          errors: event.data.errors || [],
          reason: event.data.reason,
        });
        return;
      }

      if (event.data.type === 'STED_CELL_ERROR') {
        const code = event.data.code || '';
        if (setUserCode) setUserCode(code);
        if (onLiveContext) onLiveContext({
          code,
          event: {
            id: `${event.data.cellIndex}-${Date.now()}`,
            type: 'cell-error',
            cellIndex: event.data.cellIndex,
            cellCode: event.data.cellCode || '',
            cellError: event.data.cellError || '',
            occurredAt: new Date().toISOString(),
          },
        });
        return;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [user, projectKey, setUserCode, onCodeSync, onLiveContext]);

  // 5. Request notebook (manual)
  const requestNotebook = useCallback((silent = false) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    if (!silent) setSyncing(true);
    if (!bridgeReady) injectBridge();
    iframe.contentWindow.postMessage({ type: 'STED_GET_NOTEBOOK', filename: activeNb }, '*');
    setTimeout(() => {
      if (pendingSync.current) {
        pendingSync.current = null;
        if (!silent) { setSyncing(false); showToast('No response. Try again.', 'error'); }
      }
    }, 5000);
  }, [activeNb, bridgeReady, injectBridge]);

  // 6. Inject bridge after iframe loads
  const handleIframeLoad = useCallback(() => {
    setIframeReady(true);
    setTimeout(injectBridge, 1500);
  }, [injectBridge]);

  const showToast = (msg, type = 'info') => {
    setStatus(msg); setStatusType(type);
    setTimeout(() => setStatus(''), 4000);
  };

  const syncLabel = lastSyncedAt
    ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const handleBulbClick = () => {
    if (!bulbPos) return;
    if (onBulbHint) onBulbHint({ cellCode: bulbPos.cellCode, cellOutput: bulbPos.cellOutput, cellError: bulbPos.cellError });
    setBulbPos(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-white">
      <HowToBanner synced={!!lastSyncedAt} />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className={`flex flex-col min-h-0 h-full ${showPreview ? 'w-1/2' : 'w-full'}`}>
          {!iframeReady && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <svg className="w-8 h-8 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-sm">Loading JupyterLite…</span>
            </div>
          )}

          <iframe
            ref={iframeRef}
            src={JUPYTERLITE_LAB}
            title="JupyterLite"
            className={`w-full border-0 ${iframeReady ? 'block' : 'hidden'}`}
            style={{ height: '100%', flex: 1 }}
            onLoad={handleIframeLoad}
          />

          {/* 💡 Bulb — React button, position:fixed over the iframe */}
          {bulbPos && (
            <button
              onClick={handleBulbClick}
              style={{
                position:   'fixed',
                top:        bulbPos.top + 8,
                left:       bulbPos.left + 6,
                zIndex:     99999,
                fontSize:   22,
                lineHeight: 1,
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                padding:    0,
                userSelect: 'none',
                filter:     'drop-shadow(0 0 4px rgba(255,220,0,0.6))',
                transition: 'transform 0.1s',
              }}
              title="Get a hint for this cell"
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              💡
            </button>
          )}
        </div>

        {showPreview && previewCells.length > 0 && (
          <div className="w-1/2 h-full overflow-y-auto border-l border-gray-700 bg-[#111113] p-3">
            <p className="text-[10px] text-gray-500 mb-3 font-semibold uppercase tracking-widest">Live Code Preview</p>
            <NotebookPreview cells={previewCells} />
          </div>
        )}
      </div>
    </div>
  );
}

function HowToBanner({ synced }) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('jupyter_banner_v4') === '1');
  if (dismissed) return null;
  return (
    <div className="flex items-start gap-3 bg-indigo-950/70 border-b border-indigo-800/50 px-4 py-2 text-xs text-indigo-200 shrink-0">
      <svg className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
      </svg>
      {synced
        ? <span><b className="text-green-400">✓ Code synced.</b> Click <b>Sync Code</b> again after making changes to update.</span>
        : <span>Write your code in JupyterLite, then click <b>Sync Code</b> in the toolbar to read your code into STED.</span>
      }
      <button
        onClick={() => { sessionStorage.setItem('jupyter_banner_v4', '1'); setDismissed(true); }}
        className="ml-auto text-indigo-400 hover:text-white shrink-0 text-base leading-none"
      >✕</button>
    </div>
  );
}

function NotebookPreview({ cells = [] }) {
  if (!cells.length) return <p className="text-gray-500 text-xs italic">No cells yet.</p>;
  return (
    <div className="space-y-3">
      {cells.map((cell, idx) => {
        const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source || '';
        if (cell.cell_type === 'code') return (
          <div key={idx} className="rounded bg-[#23232a] border border-gray-700 overflow-hidden">
            <div className="text-[9px] text-gray-500 px-2 pt-1 uppercase tracking-widest">In [{idx+1}]</div>
            <pre className="text-green-300 text-xs p-2 overflow-x-auto whitespace-pre-wrap leading-relaxed">{src}</pre>
            {cell.outputs?.length > 0 && (
              <div className="border-t border-gray-700 bg-black/50 px-2 py-1 space-y-1">
                {cell.outputs.map((out, oi) => {
                  for (const fmt of ['image/png','image/jpeg'])
                    if (out.data?.[fmt]) return <img key={oi} src={`data:${fmt};base64,${out.data[fmt]}`} alt="" className="max-w-full my-1 rounded"/>;
                  if (out.data?.['text/html']) {
                    const html = Array.isArray(out.data['text/html']) ? out.data['text/html'].join('') : out.data['text/html'];
                    return <div key={oi} className="text-xs text-white overflow-x-auto" dangerouslySetInnerHTML={{__html: html}}/>;
                  }
                  const txt = out.data?.['text/plain'] ?? out.text;
                  if (txt) return <pre key={oi} className="text-gray-200 text-xs whitespace-pre-wrap">{Array.isArray(txt)?txt.join(''):txt}</pre>;
                  if (out.ename) return <div key={oi} className="text-red-400 text-xs">{out.ename}: {out.evalue}</div>;
                  return null;
                })}
              </div>
            )}
          </div>
        );
        if (cell.cell_type === 'markdown') return (
          <div key={idx} className="rounded bg-[#1e1e24] border border-gray-700 px-3 py-2">
            <div className="text-[9px] text-gray-500 mb-1 uppercase tracking-widest">Markdown</div>
            <pre className="text-gray-300 text-xs whitespace-pre-wrap leading-relaxed">{src}</pre>
          </div>
        );
        return null;
      })}
    </div>
  );
}
