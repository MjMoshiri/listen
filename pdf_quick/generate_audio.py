import os
import sys
import wave

from google import genai
from google.genai import types
from tqdm import tqdm
import concurrent.futures
from pydub import AudioSegment
import textwrap

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def wave_file(filename, pcm, channels=1, rate=24000, sample_width=2):
   with wave.open(filename, "wb") as wf:
      wf.setnchannels(channels)
      wf.setsampwidth(sample_width)
      wf.setframerate(rate)
      wf.writeframes(pcm)

def paragraph_splitter(text, max_length=1500):
    """Splits text into chunks of a maximum length without breaking sentences."""
    paragraphs = text.split('\n\n')
    chunks = []
    current_chunk = ""
    
    for para in paragraphs:
        if len(current_chunk) + len(para) + 2 <= max_length:
            current_chunk += para + '\n\n'
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para + '\n\n'
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks

def text_to_speech_chunk(chunk_info):
    """Generates audio for a single text chunk and saves it as a WAV file."""
    chunk_index, chunk_text, output_dir = chunk_info
    output_filename = os.path.join(output_dir, f"chunk_{chunk_index}.wav")
    if os.path.exists(output_filename):
        return output_filename
    try:
        response = client.models.generate_content(
           model="gemini-2.5-flash-preview-tts",
           contents=chunk_text,
           config=types.GenerateContentConfig(
              response_modalities=["AUDIO"],
              speech_config=types.SpeechConfig(
                 voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                       voice_name='Charon',
                    )
                 )
              ),
           )
        )

        data = response.candidates[0].content.parts[0].inline_data.data
        wave_file(output_filename, data)
            
        return output_filename
    except Exception as e:
        print(f"Error processing chunk {chunk_index}: {e}")
        # Clean up partially created file on error
        if os.path.exists(output_filename):
            os.remove(output_filename)
        return None

def main():
    """
    Main function to generate audio from a cleaned text file.
    """
    if len(sys.argv) != 2:
        print("Usage: python3 generate_audio.py <cleaned_text_file>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    
    if not os.path.exists(input_file):
        print(f"Error: Input file not found at {input_file}")
        sys.exit(1)
        
    # Create output directory if it doesn't exist
    output_dir = "output_audio"
    os.makedirs(output_dir, exist_ok=True)
    
    # Read the cleaned text and split into chunks
    with open(input_file, 'r', encoding='utf-8') as f:
        cleaned_text = f.read()
    
    chunks = paragraph_splitter(cleaned_text)
    
    # Prepare chunk information for parallel processing
    chunk_info_list = [(i, chunk, output_dir) for i, chunk in enumerate(chunks)]
    
    # Process chunks in parallel
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(text_to_speech_chunk, info) for info in chunk_info_list]
        
        for future in tqdm(concurrent.futures.as_completed(futures), total=len(chunks), desc="Generating Audio Chunks"):
            # By iterating over as_completed, the progress bar updates as each task finishes.
            # This includes tasks that are skipped because the file already exists.
            # We call future.result() to catch any exceptions that might have occurred in the thread.
            try:
                future.result()
            except Exception as e:
                # The error is already printed inside text_to_speech_chunk.
                # This will catch any other unexpected errors.
                print(f"A worker thread raised an unexpected exception: {e}")

    # Check if any audio files were generated or exist
    has_audio_files = any(os.path.exists(os.path.join(output_dir, f"chunk_{i}.wav")) for i in range(len(chunks)))

    if not has_audio_files:
        print("No audio files were generated or found. Exiting.")
        sys.exit(1)
        
    # Concatenate audio files
    print("Concatenating audio files...")
    combined = AudioSegment.empty()
    for i in range(len(chunks)):
        filepath = os.path.join(output_dir, f"chunk_{i}.wav")
        if os.path.exists(filepath):
            segment = AudioSegment.from_wav(filepath)
            combined += segment
    
    # Export the final audio file
    final_filename = "final_audio.mp3"
    combined.export(final_filename, format="mp3")
    print(f"Final audio saved as {final_filename}")

if __name__ == "__main__":
    main()