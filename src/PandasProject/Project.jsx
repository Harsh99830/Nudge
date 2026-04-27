import React, { useState, useEffect, useCallback } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../firebase';
import AI from './AI';
import JupyterNotebook from './JupyterNotebook';

const META_KEYS = new Set(['id', 'title', 'description']);

function pickFirst(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function extractProfilePayload(profile = {}) {
  const nestedProfile = pickFirst(
    profile.dataProfile,
    profile.datasetProfile,
    profile.profile,
    profile.profileData,
    profile.analysis,
    profile.summary
  );
  if (nestedProfile) return nestedProfile;

  const profileOnlyData = Object.fromEntries(
    Object.entries(profile).filter(([key]) => !META_KEYS.has(key))
  );
  return Object.keys(profileOnlyData).length ? profileOnlyData : null;
}

function Project() {
  const [chatMessages,  setChatMessages]  = useState([]);
  const [userCode,      setUserCode]     = useState('');
  const [lastSyncedAt,  setLastSyncedAt] = useState(null);
  const [projectConfig, setProjectConfig] = useState({ title: '', description: '' });
  const [bulbHint,      setBulbHint]     = useState(null); // { cellCode, cellOutput }
  const [liveMentorEvent, setLiveMentorEvent] = useState(null);

  const handleCodeSync = useCallback(({ code, savedAt }) => {
    setUserCode(code);
    if (savedAt) setLastSyncedAt(savedAt);
  }, []);

  const handleLiveContext = useCallback(({ code, event }) => {
    setUserCode(code);
    if (event) setLiveMentorEvent(event);
  }, []);

  // Fetch project data from Firebase
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get('id') || 'Project3';
        const projectRef = ref(db, `PandasProject/${projectId}`);
        const snap = await get(projectRef);
        if (snap.exists()) {
          const data = snap.val();
          const profile = data.Profile || data.profile || {};
          const dataProfile = pickFirst(
            extractProfilePayload(profile),
            data.DataProfile,
            data.dataProfile,
            data.datasetProfile,
            data.profileData,
            data.ProfileData
          );
          const dataSample = pickFirst(
            data.DataSample,
            data.dataSample,
            data.SampleData,
            data.sampleData,
            data.Data,
            data.data
          );
          setProjectConfig({
            title: profile.title || data.title || 'Pandas Project',
            description: profile.description || data.description || 'Learn pandas by working with real datasets',
            dataLink: data.DataLink || data.dataLink || profile.DataLink || profile.dataLink || '',
            dataProfile,
            dataSample,
          });
        }
      } catch (error) {
        console.error('Error fetching project data:', error);
      }
    };
    fetchProjectData();
  }, []);

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #09090f 0%, #0d0d1a 50%, #09090f 100%)' }}
    >
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
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
            onBulbHint={setBulbHint}
            onLiveContext={handleLiveContext}
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
            bulbHint={bulbHint}
            onBulbHintConsumed={() => setBulbHint(null)}
            liveMentorEvent={liveMentorEvent}
            projectConfig={projectConfig}
          />
        </div>
      </div>
    </div>
  );
}

export default Project;
