/**
 * Runtime settings persisted to data/settings.json (gitignored).
 * Holds the active provider mode and the selfhost endpoint URLs discovered
 * when `modal deploy` runs. Secrets stay in .env (SELFHOST_API_KEY).
 */

import fs from 'fs';
import path from 'path';

export interface AppSettings {
  // Which backend the pipeline uses for cleaning + TTS
  mode: 'gemini' | 'selfhost';
  selfhost: {
    llmUrl: string;   // OpenAI-compatible base URL, e.g. https://...modal.run
    ttsUrl: string;   // Kokoro endpoint base URL
    llmModel: string; // model alias served by llama-server
    ttsVoice: string; // Kokoro voice id
  };
}

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');

const DEFAULTS: AppSettings = {
  mode: 'gemini',
  selfhost: {
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
      ...DEFAULTS,
      ...raw,
      selfhost: { ...DEFAULTS.selfhost, ...(raw.selfhost || {}) },
    };
  } catch {
    return { ...DEFAULTS, selfhost: { ...DEFAULTS.selfhost } };
  }
}

export type SettingsPatch = Partial<Omit<AppSettings, 'selfhost'>> & {
  selfhost?: Partial<AppSettings['selfhost']>;
};

export function saveSettings(patch: SettingsPatch): AppSettings {
  const merged: AppSettings = {
    ...getSettings(),
    ...patch,
    selfhost: { ...getSettings().selfhost, ...(patch.selfhost || {}) },
  };
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

export function selfhostApiKey(): string {
  return process.env.SELFHOST_API_KEY || '';
}
