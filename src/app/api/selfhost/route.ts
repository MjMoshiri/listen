/**
 * Selfhost control.
 * GET  -> current mode + endpoint URLs
 * POST {action:'deploy'} -> `modal deploy` the Gemma + Kokoro apps, save their
 *                           URLs, switch the pipeline to selfhost
 * POST {action:'mode', mode:'gemini'|'selfhost'} -> switch provider mode
 */

import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSettings, saveSettings } from '@/lib/settings';

const execFileAsync = promisify(execFile);

export const maxDuration = 300;

const MODAL_BIN = process.env.MODAL_BIN || '/Users/mjmoshiri/.local/bin/modal';
const MODAL_REPO = process.env.MODAL_REPO || '/Users/mjmoshiri/opencode-on-modal';

const APPS = {
  llm: 'serve/gemma4_26b_a4b.py',
  tts: 'serve/kokoro_tts.py',
};

async function deployApp(file: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(MODAL_BIN, ['deploy', file], {
    cwd: MODAL_REPO,
    timeout: 240_000,
  });
  const out = stdout + stderr;
  const urls = out.match(/https:\/\/[^\s│]+\.modal\.run/g);
  if (!urls || urls.length === 0) {
    throw new Error(`No endpoint URL in modal deploy output for ${file}: ${out.slice(-500)}`);
  }
  return urls[urls.length - 1];
}

export async function GET() {
  const s = getSettings();
  return NextResponse.json({
    mode: s.mode,
    llmUrl: s.selfhost.llmUrl,
    ttsUrl: s.selfhost.ttsUrl,
    ready: Boolean(s.selfhost.llmUrl && s.selfhost.ttsUrl),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.action === 'mode') {
    if (body.mode !== 'gemini' && body.mode !== 'selfhost') {
      return NextResponse.json({ error: 'mode must be gemini or selfhost' }, { status: 400 });
    }
    const s = saveSettings({ mode: body.mode });
    return NextResponse.json({ mode: s.mode });
  }

  if (body.action === 'deploy') {
    try {
      const [llmUrl, ttsUrl] = await Promise.all([
        deployApp(APPS.llm),
        deployApp(APPS.tts),
      ]);
      const s = saveSettings({ mode: 'selfhost', selfhost: { llmUrl, ttsUrl } });
      return NextResponse.json({
        mode: s.mode,
        llmUrl: s.selfhost.llmUrl,
        ttsUrl: s.selfhost.ttsUrl,
        ready: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Selfhost deploy failed:', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
