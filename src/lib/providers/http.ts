/**
 * Backend HTTP client with a real connection pool.
 *
 * Next.js patches global fetch in server code, and in practice every request
 * to the same origin ends up serialized over a single socket — which turned
 * the "concurrent" clean/TTS pipeline into a one-request-at-a-time queue.
 * undici's own fetch with an explicit Agent bypasses the patch entirely.
 */

import { fetch as undiciFetch, Agent } from 'undici';

const g = globalThis as unknown as { __listenHttpAgent?: Agent };

const agent = (g.__listenHttpAgent ??= new Agent({
  connections: 32, // per origin — clean + TTS fan-out both fit
  headersTimeout: 15 * 60_000, // a clean piece can decode for minutes
  bodyTimeout: 15 * 60_000,
}));

export function backendFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) {
  return undiciFetch(url, { ...init, dispatcher: agent });
}
