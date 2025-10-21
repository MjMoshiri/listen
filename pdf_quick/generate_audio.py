import os
import sys
import wave
import json
from google import genai
from google.genai import types
from tqdm import tqdm
import concurrent.futures
from pydub import AudioSegment


# ---------- Helper: Save PCM data to WAV ----------
def wave_file(filename, pcm, channels=1, rate=24000, sample_width=2):
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm)


# ---------- Helper: Split text into manageable chunks ----------
import re

def paragraph_splitter(text, max_words=1000):
    """
    Split text into chunks by paragraph boundaries first.
    If a paragraph exceeds max_words, split at the nearest sentence boundary.
    Fallback to word split if no sentence end exists before the limit.
    """
    sentence_end_re = re.compile(r'(?<=[.!?])\s+')
    chunks = []

    def split_paragraph(para_words):
        """Recursively split one paragraph by sentence boundaries if needed."""
        if len(para_words) <= max_words:
            chunks.append(" ".join(para_words).strip())
            return

        # Convert back to text to locate sentence boundaries
        para_text = " ".join(para_words)
        sentences = sentence_end_re.split(para_text)
        word_count = 0
        split_index = None

        for i, sent in enumerate(sentences):
            sent_len = len(sent.split())
            if word_count + sent_len > max_words:
                split_index = i
                break
            word_count += sent_len

        if split_index is None:
            # No sentence break before limit → hard cut
            chunks.append(" ".join(para_words[:max_words]).strip())
            remainder = para_words[max_words:]
            if remainder:
                split_paragraph(remainder)
        else:
            left = " ".join(sentences[:split_index])
            right = " ".join(sentences[split_index:])
            left_words = left.split()
            right_words = right.split()
            chunks.append(" ".join(left_words).strip())
            if right_words:
                split_paragraph(right_words)

    # ---- main loop ----
    for para in text.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        words = para.split()
        split_paragraph(words)

    return chunks


# ---------- Worker: Generate one chunk of audio ----------
def text_to_speech_chunk(chunk_info):
    chunk_index, chunk_text, output_dir = chunk_info
    output_filename = os.path.join(output_dir, f"chunk_{chunk_index}.wav")
    if os.path.exists(output_filename):
        return output_filename

    local_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    try:
        response = local_client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=chunk_text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Charon",
                        )
                    )
                ),
            ),
        )

        data = response.candidates[0].content.parts[0].inline_data.data
        wave_file(output_filename, data)
        return output_filename
    except Exception as e:
        print(f"Error processing chunk {chunk_index}: {e}")
        if os.path.exists(output_filename):
            os.remove(output_filename)
        return None


# ---------- Main Function ----------
def main():
    if len(sys.argv) != 2:
        print("Usage: python3 generate_audio.py <cleaned_text_file>")
        sys.exit(1)

    input_file = sys.argv[1]
    if not os.path.exists(input_file):
        print(f"Error: Input file not found at {input_file}")
        sys.exit(1)

    output_dir = "output_audio"
    os.makedirs(output_dir, exist_ok=True)

    # Read text
    with open(input_file, "r", encoding="utf-8") as f:
        cleaned_text = f.read()

    chapter_name = os.path.splitext(os.path.basename(input_file))[0]
    chunks = paragraph_splitter(cleaned_text)
    if not chunks:
        print("No text content found to convert to audio. Exiting.")
        sys.exit(1)

    # Compute word counts
    total_words = len(cleaned_text.split())
    chunk_word_counts = {i: len(chunk.split()) for i, chunk in enumerate(chunks)}

    word_counts_path = os.path.join(output_dir, "chapter_word_counts.json")
    try:
        with open(word_counts_path, "r", encoding="utf-8") as word_file:
            chapter_word_counts = json.load(word_file)
    except (FileNotFoundError, json.JSONDecodeError):
        chapter_word_counts = {}

    chapter_word_counts[chapter_name] = {
        "total_words": total_words,
        "chunks": chunk_word_counts,
    }

    with open(word_counts_path, "w", encoding="utf-8") as word_file:
        json.dump(chapter_word_counts, word_file, indent=2)

    # ---------- Prepare generation ----------
    chunk_info_list = [(i, chunk, output_dir) for i, chunk in enumerate(chunks)]
    to_generate = [
        info
        for info in chunk_info_list
        if not os.path.exists(os.path.join(output_dir, f"chunk_{info[0]}.wav"))
    ]

    # ---------- Generate audio ----------
    if not to_generate:
        print("All chunks already cached. Skipping generation.")
    else:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            list(
                tqdm(
                    executor.map(text_to_speech_chunk, to_generate),
                    total=len(to_generate),
                    desc="Generating Audio Chunks",
                )
            )

    # ---------- Verify output ----------
    has_audio_files = any(
        os.path.exists(os.path.join(output_dir, f"chunk_{i}.wav"))
        for i in range(len(chunks))
    )
    if not has_audio_files:
        print("No audio files were generated. Exiting.")
        sys.exit(1)

    # ---------- Concatenate ----------
    print("Concatenating audio files...")
    combined = AudioSegment.empty()
    for i in range(len(chunks)):
        filepath = os.path.join(output_dir, f"chunk_{i}.wav")
        if os.path.exists(filepath):
            segment = AudioSegment.from_wav(filepath)
            combined += segment

    final_filename = "final_audio.mp3"
    combined.export(final_filename, format="mp3")
    print(f"Final audio saved as {final_filename}")


# ---------- Entry ----------
if __name__ == "__main__":
    main()