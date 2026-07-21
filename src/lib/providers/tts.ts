/**
 * TTS provider — turns a text chunk into a complete WAV buffer.
 * gemini: Google GenAI speech model (original behavior; returns raw PCM we wrap)
 * selfhost: Kokoro on Modal via OpenAI-compatible /v1/audio/speech (returns WAV)
 */

import { config } from '../config';
import { getSettings, selfhostApiKey } from '../settings';

/** Wrap raw 16-bit mono PCM in a WAV container. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function synthesizeWithGemini(text: string): Promise<Buffer> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: config.geminiTTSModel,
    contents: [{
      parts: [{
        text: 'You are narrating an audio book. Read The Following Text in the appropriate tune:\n' + text,
      }],
    }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: config.geminiVoiceName },
        },
      },
    },
  });
  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error('No audio data received from Gemini API');
  return pcmToWav(Buffer.from(data, 'base64'));
}

async function synthesizeWithSelfhost(text: string): Promise<Buffer> {
  const { selfhost } = getSettings();
  if (!selfhost.ttsUrl) throw new Error('Selfhost TTS URL not set — deploy via the Selfhost button');
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

/** Returns a complete WAV file buffer for the given text. */
export async function synthesizeChunk(text: string): Promise<Buffer> {
  return getSettings().mode === 'selfhost' ? synthesizeWithSelfhost(text) : synthesizeWithGemini(text);
}
