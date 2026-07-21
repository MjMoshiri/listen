/**
 * Minimal WAV inspection — duration of a PCM WAV buffer. Each TTS chunk's
 * duration is recorded so the read-along player can map paragraphs to time
 * offsets in the combined chapter audio.
 */

export function wavDurationSeconds(buf: Buffer): number | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let pos = 12;
  let byteRate = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    let size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      byteRate = buf.readUInt32LE(pos + 16);
    } else if (id === 'data') {
      const remaining = buf.length - pos - 8;
      // Streaming encoders sometimes leave a bogus data size in the header
      if (size === 0 || size > remaining) size = remaining;
      return byteRate > 0 ? size / byteRate : null;
    }
    pos += 8 + size + (size % 2);
  }
  return null;
}
