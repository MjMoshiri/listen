import os
import sys
from pydub import AudioSegment
import glob

def merge_audio_chunks(input_dir, output_dir="merged_audio", max_duration_minutes=15):
    """
    Merges small audio chunks into larger parts, each not exceeding a specified duration.

    Args:
        input_dir (str): Directory containing the audio chunks (e.g., 'output_audio').
        output_dir (str): Directory to save the merged audio parts.
        max_duration_minutes (int): Maximum duration of each merged part in minutes.
    """
    if not os.path.isdir(input_dir):
        print(f"Error: Input directory '{input_dir}' not found.")
        return

    os.makedirs(output_dir, exist_ok=True)

    max_duration_ms = max_duration_minutes * 60 * 1000

    # Get all wav files and sort them numerically based on the chunk index
    chunk_files = glob.glob(os.path.join(input_dir, 'chunk_*.wav'))
    chunk_files.sort(key=lambda f: int(os.path.splitext(os.path.basename(f))[0].split('_')[1]))

    if not chunk_files:
        print(f"No .wav chunk files found in '{input_dir}'.")
        return

    current_part_number = 1
    current_part = AudioSegment.empty()

    print(f"Found {len(chunk_files)} audio chunks to merge.")

    for chunk_file in chunk_files:
        segment = AudioSegment.from_wav(chunk_file)

        if len(current_part) + len(segment) > max_duration_ms and len(current_part) > 0:
            # Export the current part
            output_filename = os.path.join(output_dir, f"part_{current_part_number}.wav")
            print(f"Exporting {output_filename} ({len(current_part) / 1000:.2f} seconds)...")
            current_part.export(output_filename, format="wav")

            # Start a new part
            current_part_number += 1
            current_part = segment
        else:
            current_part += segment

    # Export the last remaining part
    if len(current_part) > 0:
        output_filename = os.path.join(output_dir, f"part_{current_part_number}.wav")
        print(f"Exporting {output_filename} ({len(current_part) / 1000:.2f} seconds)...")
        current_part.export(output_filename, format="wav")

    print("Audio merging complete.")

def main():
    """
    Main function to handle command-line arguments.
    """
    if len(sys.argv) != 2:
        print("Usage: python3 merge_audio.py <input_directory_with_chunks>")
        sys.exit(1)

    input_directory = sys.argv[1]
    merge_audio_chunks(input_directory)

if __name__ == "__main__":
    main()
