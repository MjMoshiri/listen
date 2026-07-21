"use client";

import { useEffect, useState } from 'react';
import styles from './SelfhostToggle.module.css';

interface SelfhostStatus {
  on: boolean;
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

  const setPower = async (action: 'on' | 'off') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/selfhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
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

  if (!status) return null;

  return (
    <div className={styles.container}>
      <span className={styles.label}>
        Selfhost:{' '}
        <strong className={status.on ? styles.on : styles.off}>
          {status.on ? 'On' : 'Off'}
        </strong>
      </span>

      {status.on ? (
        <button className={styles.buttonSecondary} disabled={busy} onClick={() => setPower('off')}>
          {busy ? 'Stopping…' : 'Turn Off'}
        </button>
      ) : (
        <button className={styles.button} disabled={busy} onClick={() => setPower('on')}>
          {busy ? 'Deploying… (~2 min)' : 'Turn On'}
        </button>
      )}

      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
