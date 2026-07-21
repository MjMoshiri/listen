/**
 * Selfhost backend control — the pipeline's only backend, with a simple
 * on/off switch.
 * GET  -> { on, llmUrl, ttsUrl, ready }
 * POST {action:'on'}  -> `modal deploy` the Gemma + Kokoro apps, save URLs
 * POST {action:'off'} -> `modal app stop` both apps (no idle GPU cost)
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
  llm: { file: 'serve/gemma4_26b_a4b.py', name: 'serve-gemma4-26b-a4b' },
  tts: { file: 'serve/kokoro_tts.py', name: 'serve-kokoro-tts' },
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

async function stopApp(name: string): Promise<void> {
  await execFileAsync(MODAL_BIN, ['app', 'stop', name], {
    cwd: MODAL_REPO,
    timeout: 120_000,
  });
}

export async function GET() {
  const { selfhost } = getSettings();
  return NextResponse.json({
    on: selfhost.on,
    llmUrl: selfhost.llmUrl,
    ttsUrl: selfhost.ttsUrl,
    ready: selfhost.on && Boolean(selfhost.llmUrl && selfhost.ttsUrl),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.action === 'on') {
    try {
      const [llmUrl, ttsUrl] = await Promise.all([
        deployApp(APPS.llm.file),
        deployApp(APPS.tts.file),
      ]);
      const s = saveSettings({ selfhost: { on: true, llmUrl, ttsUrl } });
      return NextResponse.json({
        on: true,
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

  if (body.action === 'off') {
    try {
      await Promise.all([stopApp(APPS.llm.name), stopApp(APPS.tts.name)]);
      saveSettings({ selfhost: { on: false } });
      return NextResponse.json({ on: false, ready: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Selfhost stop failed:', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
