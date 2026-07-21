/**
 * LLM provider — rewrites chapter text for spoken delivery.
 * gemini: Google GenAI (original behavior)
 * selfhost: OpenAI-compatible endpoint (Gemma on Modal)
 */

import { config } from '../config';
import { getSettings, selfhostApiKey } from '../settings';
import { splitTextIntoParagraphs } from '../text-chunker';

const CLEAN_PROMPT =
  `Keep the full text exactly the same word for word, but take out anything ` +
  `that makes it hard to read out loud in front of people. This includes things ` +
  `like footnote numbers, citation marks like [Lindsay1979] or [1], cross-reference ` +
  `artifacts, or extra symbols that don't help when speaking. Figure descriptions ` +
  `should be kept and read naturally. Don't change the words or shorten the ` +
  `text—just clean it up for smooth reading. Reply with the cleaned text only.`;

async function cleanWithGemini(text: string): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: config.geminiTextModel,
    contents: [{ parts: [{ text: `${CLEAN_PROMPT}\n\n${text}` }] }],
    config: { maxOutputTokens: config.maxOutputTokens, temperature: config.temperature },
  });
  const cleaned = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!cleaned) throw new Error('Gemini returned no text');
  return cleaned;
}

async function cleanWithSelfhost(text: string): Promise<string> {
  const { selfhost } = getSettings();
  if (!selfhost.llmUrl) throw new Error('Selfhost LLM URL not set — deploy via the Selfhost button');
  // Cold start: the endpoint scales from zero and llama-server answers 503
  // while the model loads (~2 min), so wait it out instead of failing.
  for (let attempt = 0; ; attempt++) {
    const res = await selfhostChatRequest(selfhost, text);
    if (res.status === 503 && attempt < 10) {
      await new Promise(r => setTimeout(r, 15_000));
      continue;
    }
    return res.result();
  }
}

async function selfhostChatRequest(
  selfhost: { llmUrl: string; llmModel: string },
  text: string,
): Promise<{ status: number; result: () => Promise<string> }> {
  const res = await fetch(`${selfhost.llmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${selfhostApiKey()}`,
    },
    body: JSON.stringify({
      model: selfhost.llmModel,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: CLEAN_PROMPT },
        { role: 'user', content: text },
      ],
    }),
  });
  return {
    status: res.status,
    result: async () => {
      if (!res.ok) throw new Error(`Selfhost LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const cleaned = data.choices?.[0]?.message?.content;
      if (!cleaned) throw new Error('Selfhost LLM returned no text');
      return cleaned;
    },
  };
}

/**
 * Chapters are cleaned in ~500-word pieces and rejoined: a full chapter
 * (15-20k words) exceeds both Gemini's 8k output-token cap and the selfhost
 * endpoint's per-slot context, and a clean pass outputs roughly its input size.
 */
export async function cleanTextForSpeech(text: string): Promise<string> {
  const clean = getSettings().mode === 'selfhost' ? cleanWithSelfhost : cleanWithGemini;
  const pieces = splitTextIntoParagraphs(text);
  const cleaned: string[] = [];
  for (const piece of pieces) {
    cleaned.push(await clean(piece));
  }
  return cleaned.join('\n\n');
}
