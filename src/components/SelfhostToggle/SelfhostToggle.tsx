"use client";

import { useEffect, useState } from 'react';
import styles from './SelfhostToggle.module.css';

interface SelfhostStatus {
  mode: 'gemini' | 'selfhost';
  llmUrl: string;
  ttsUrl: string;
  ready: boolean;
}

export default function SelfhostToggle() {
  const [status, setStatus] = useState<SelfhostStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    fetch('/api/selfhost')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  const deploy = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/selfhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deploy' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setMode = async (mode: 'gemini' | 'selfhost') => {
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/selfhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mode', mode }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <div className={styles.container}>
      <span className={styles.label}>
        Backend:{' '}
        <strong className={status.mode === 'selfhost' ? styles.selfhost : styles.gemini}>
          {status.mode === 'selfhost' ? 'Selfhost (Modal)' : 'Gemini'}
        </strong>
      </span>

      {status.mode === 'gemini' && (
        <button className={styles.button} disabled={busy} onClick={status.ready ? () => setMode('selfhost') : deploy}>
          {busy ? 'Deploying… (~2 min)' : status.ready ? 'Switch to Selfhost' : 'Selfhost'}
        </button>
      )}

      {status.mode === 'selfhost' && (
        <>
          <button className={styles.button} disabled={busy} onClick={deploy}>
            {busy ? 'Deploying…' : 'Redeploy'}
          </button>
          <button className={styles.buttonSecondary} disabled={busy} onClick={() => setMode('gemini')}>
            Switch to Gemini
          </button>
        </>
      )}

      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
