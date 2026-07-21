/**
 * LLM provider — rewrites chapter text for spoken delivery via the selfhost
 * backend (Gemma on Modal, OpenAI-compatible chat endpoint).
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
  `text—just clean it up for smooth reading. Keep the paragraph breaks exactly ` +
  `where they are in the original—never merge or split paragraphs. Reply with ` +
  `the cleaned text only.`;

async function cleanPiece(text: string): Promise<string> {
  const { selfhost } = getSettings();
  if (!selfhost.on || !selfhost.llmUrl) {
    throw new Error('Selfhost backend is off — turn it on from the dashboard');
  }

  // Cold start: the endpoint scales from zero and llama-server answers 503
  // while the model loads (~2 min), so wait it out instead of failing.
  for (let attempt = 0; ; attempt++) {
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

    if (res.status === 503 && attempt < 10) {
      await new Promise(r => setTimeout(r, 15_000));
      continue;
    }
    if (!res.ok) throw new Error(`Selfhost LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const data = await res.json();
    const cleaned = data.choices?.[0]?.message?.content;
    if (!cleaned) throw new Error('Selfhost LLM returned no text');
    return cleaned;
  }
}

/**
 * Chapters are cleaned in ~500-word pieces and rejoined: a full chapter
 * (15-20k words) exceeds the endpoint's per-slot context, and a clean pass
 * outputs roughly its input size.
 */
export async function cleanTextForSpeech(text: string): Promise<string> {
  const pieces = splitTextIntoParagraphs(text);
  const cleaned: string[] = [];
  for (const piece of pieces) {
    cleaned.push(await cleanPiece(piece));
  }
  return cleaned.join('\n\n');
}
