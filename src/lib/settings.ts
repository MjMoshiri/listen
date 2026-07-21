/**
 * Runtime settings persisted to data/settings.json (gitignored).
 * The pipeline runs exclusively on the selfhost backend (Gemma + Kokoro on
 * Modal); `on` tracks whether the backend is currently deployed and active.
 * Secrets stay in .env (SELFHOST_API_KEY).
 */

import fs from 'fs';
import path from 'path';

export interface AppSettings {
  selfhost: {
    on: boolean;      // backend deployed and accepting work
    llmUrl: string;   // OpenAI-compatible base URL, e.g. https://...modal.run
    ttsUrl: string;   // Kokoro endpoint base URL
    llmModel: string; // model alias served by llama-server
    ttsVoice: string; // Kokoro voice id
  };
}

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');

const DEFAULTS: AppSettings = {
  selfhost: {
    on: false,
    llmUrl: '',
    ttsUrl: '',
    llmModel: 'gemma4-26b-a4b',
    ttsVoice: 'af_heart',
  },
};

export function getSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    return {
      selfhost: { ...DEFAULTS.selfhost, ...(raw.selfhost || {}) },
    };
  } catch {
    return { selfhost: { ...DEFAULTS.selfhost } };
  }
}

export type SettingsPatch = {
  selfhost?: Partial<AppSettings['selfhost']>;
};

export function saveSettings(patch: SettingsPatch): AppSettings {
  const merged: AppSettings = {
    selfhost: { ...getSettings().selfhost, ...(patch.selfhost || {}) },
  };
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

/** True when the backend is on and both endpoint URLs are known. */
export function selfhostReady(): boolean {
  const { selfhost } = getSettings();
  return selfhost.on && Boolean(selfhost.llmUrl && selfhost.ttsUrl);
}

export function selfhostApiKey(): string {
  return process.env.SELFHOST_API_KEY || '';
}
