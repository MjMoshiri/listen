/**
 * TTS provider — turns a text chunk into a complete WAV buffer via the
 * selfhost backend (Kokoro on Modal, OpenAI-compatible /v1/audio/speech).
 */

import { getSettings, selfhostApiKey } from '../settings';

/** Returns a complete WAV file buffer for the given text. */
export async function synthesizeChunk(text: string): Promise<Buffer> {
  const { selfhost } = getSettings();
  if (!selfhost.on || !selfhost.ttsUrl) {
    throw new Error('Selfhost backend is off — turn it on from the dashboard');
  }
  const res = await fetch(`${selfhost.ttsUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${selfhostApiKey()}`,
    },
    body: JSON.stringify({
      model: 'kokoro-82m',
      input: text,
      voice: selfhost.ttsVoice,
    }),
  });
  if (!res.ok) throw new Error(`Selfhost TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}
