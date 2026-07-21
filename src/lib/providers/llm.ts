/**
 * LLM provider — rewrites chapter text for spoken delivery via the selfhost
 * backend (Gemma on Modal, OpenAI-compatible chat endpoint).
 */

import { config } from '../config';
import { getSettings, selfhostApiKey } from '../settings';
import { splitTextIntoParagraphs } from '../text-chunker';
import { backendFetch } from './http';

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
  // Other transient failures (network blip, redeploy, 5xx) also retry —
  // a thrown error here makes the whole chapter fall back to uncleaned text.
  let transientRetries = 0;
  for (let attempt = 0; ; attempt++) {
    let res: Awaited<ReturnType<typeof backendFetch>>;
    try {
      res = await backendFetch(`${selfhost.llmUrl}/v1/chat/completions`, {
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
    } catch (err) {
      if (transientRetries++ < 5) {
        await new Promise(r => setTimeout(r, 5_000 * transientRetries));
        continue;
      }
      throw err;
    }

    if (res.status === 503 && attempt < 20) {
      await new Promise(r => setTimeout(r, 15_000));
      continue;
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      if (res.status >= 500 && transientRetries++ < 5) {
        await new Promise(r => setTimeout(r, 5_000 * transientRetries));
        continue;
      }
      throw new Error(`Selfhost LLM ${res.status}: ${body}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const cleaned = data.choices?.[0]?.message?.content;
    if (!cleaned) {
      // 200 with empty content happens when generation dies mid-flight
      // (e.g. thinking ate the slot's context) — transient, retry
      if (transientRetries++ < 5) {
        await new Promise(r => setTimeout(r, 5_000 * transientRetries));
        continue;
      }
      throw new Error('Selfhost LLM returned no text');
    }
    return cleaned;
  }
}

/**
 * Chapters are cleaned in ~500-word pieces and rejoined: a full chapter
 * (15-20k words) exceeds the endpoint's per-slot context, and a clean pass
 * outputs roughly its input size. onProgress reports pieces done/total so
 * the dashboard can show the cleaning stage moving.
 */
// Pieces cleaned in parallel per chapter; the endpoint decodes 4 requests per
// container and scales out, so keeping several in flight is what makes a
// 40-piece chapter take minutes instead of an hour.
const PIECE_CONCURRENCY = 3;

export async function cleanTextForSpeech(
  text: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const pieces = splitTextIntoParagraphs(text);
  onProgress?.(0, pieces.length);
  const cleaned: string[] = new Array(pieces.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(PIECE_CONCURRENCY, pieces.length) }, async () => {
    while (next < pieces.length) {
      const i = next++;
      cleaned[i] = await cleanPiece(pieces[i]);
      onProgress?.(++done, pieces.length);
    }
  });
  await Promise.all(workers);
  return cleaned.join('\n\n');
}
