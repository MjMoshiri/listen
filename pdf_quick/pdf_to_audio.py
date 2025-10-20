# given a pdf file and a sub page put the text of that pages into a single txt
# python3 ./pdf_to_audio.py Attachment.pdf 25 28   
import PyPDF2
import sys
import os
from google import genai
from google.genai import types
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
model = "gemini-2.5-pro"
import textwrap

def clean_text_for_tts(input_text):
    prompt = textwrap.dedent(f"""
        You are an expert text editor specializing in preparing documents for text-to-speech narration.
        Your task is to clean the following text by removing any page numbers, headers, footers, references,
        and any content unsuitable for audiobook narration. Keep all remaining wording and titles exactly
        as written and ready for direct input into a TTS service.

        Here is the text to be cleaned:

        {input_text}

        Here is the cleaned text:
    """).strip()

    response = client.models.generate_content_stream(
        model=model,
        contents=[
            types.Part.from_text(text= prompt)
        ],
    )
    print("Cleaning text for TTS...")
    cleaned_text = ""
    for part in response:
        if part.text:
            print(part.text)
            cleaned_text += part.text
    return cleaned_text

def pdf_to_text(pdf_path, start_page, end_page, output_txt):
    with open(pdf_path, 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        with open(output_txt, 'w', encoding='utf-8') as txt_file:
            for page_num in range(start_page - 1, end_page):
                if page_num < len(reader.pages):
                    page = reader.pages[page_num]
                    text = page.extract_text()
                    txt_file.write(text + '\n')
                else:
                    print(f"Page {page_num + 1} does not exist in the PDF.")
                    
def paragraph_splitter(text, max_length=1500):
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

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python3 pdf_to_audio.py <pdf_path> <start_page> <end_page> <output_txt>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    start_page = int(sys.argv[2])
    end_page = int(sys.argv[3])
    output_txt = sys.argv[4]
    
    pdf_to_text(pdf_path, start_page, end_page, output_txt)
    print(f"Text from pages {start_page} to {end_page} has been written to {output_txt}.")  

    cleaned_text = clean_text_for_tts(open(output_txt, 'r', encoding='utf-8').read())
    print(f"Cleaned text has been written to {output_txt}.cleaned.")
    with open(output_txt + ".cleaned", 'w', encoding='utf-8') as txt_file:
        txt_file.write(cleaned_text)





