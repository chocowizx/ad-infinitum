"""
Generate Reading Passages and Definitions using Claude API
Creates 3-sentence college-level passages for SAT practice questions.
"""

import json
import os
import sys
import time
import requests

# Fix Unicode encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

# API Configuration
API_URL = "https://api.anthropic.com/v1/messages"

script_dir = os.path.dirname(os.path.abspath(__file__))

# Load API key from file
api_key_path = os.path.join(script_dir, 'api_key.txt')
with open(api_key_path, 'r') as f:
    API_KEY = f.read().strip()

input_path = os.path.join(script_dir, 'data/words_processed.json')
output_path = os.path.join(script_dir, 'data/words_processed.json')
progress_path = os.path.join(script_dir, 'data/passage_progress.json')

def generate_passage_and_definition(word, current_definition, part_of_speech):
    """Generate a 3-sentence passage and definition if missing"""

    prompt = f"""For the vocabulary word "{word}" ({part_of_speech}):

1. If this definition is missing or poor, provide a clear, concise definition (1 sentence):
Current definition: {current_definition if current_definition else "MISSING"}

2. Write a 3-sentence college-level reading passage where "{word}" is used naturally and is ESSENTIAL to understanding the text. The passage should:
- Be sophisticated and academic in tone
- Provide enough context that a student could infer the word's meaning
- Use the word exactly ONCE
- Be about topics like: science, history, philosophy, literature, social issues, or current events
- NOT be a simple example sentence - it should read like an excerpt from an academic text

Format your response EXACTLY like this:
DEFINITION: [definition here]
PASSAGE: [3-sentence passage here]"""

    headers = {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    data = {
        "model": "claude-3-haiku-20240307",
        "max_tokens": 300,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    try:
        response = requests.post(API_URL, headers=headers, json=data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            text = result['content'][0]['text'].strip()

            # Parse response
            definition = ""
            passage = ""

            if "DEFINITION:" in text and "PASSAGE:" in text:
                parts = text.split("PASSAGE:")
                definition_part = parts[0].replace("DEFINITION:", "").strip()
                passage = parts[1].strip() if len(parts) > 1 else ""

                # Only use new definition if current one is missing/poor
                if not current_definition or len(current_definition) < 10 or current_definition.startswith("(Definition needed"):
                    definition = definition_part
                else:
                    definition = current_definition
            else:
                # Fallback: use whole response as passage
                passage = text
                definition = current_definition

            return definition, passage
        else:
            print(f"  API Error {response.status_code}: {response.text[:100]}")
            return None, None
    except Exception as e:
        print(f"  Request error: {e}")
        return None, None

def load_progress():
    """Load progress from previous run"""
    if os.path.exists(progress_path):
        with open(progress_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'processed': []}

def save_progress(progress):
    """Save progress"""
    with open(progress_path, 'w', encoding='utf-8') as f:
        json.dump(progress, f)

def main():
    # Load words
    print("Loading words...")
    with open(input_path, 'r', encoding='utf-8') as f:
        words = json.load(f)

    print(f"Loaded {len(words)} words")

    # Load progress
    progress = load_progress()
    processed_words = set(progress.get('processed', []))

    # Find words to process
    words_to_process = []
    for i, word in enumerate(words):
        word_text = word.get('word', '')
        if word_text not in processed_words:
            words_to_process.append((i, word))

    print(f"Words to process: {len(words_to_process)}")

    if len(words_to_process) == 0:
        print("All words already processed!")
        return

    print(f"\nEstimated cost: ~${len(words_to_process) * 0.0005:.2f}")
    print("Starting generation...\n")

    # Process words
    updated = 0
    errors = 0

    for idx, (i, word_entry) in enumerate(words_to_process):
        word = word_entry.get('word', '')
        definition = word_entry.get('definition', '')
        pos = word_entry.get('partOfSpeech', '')

        print(f"[{idx+1}/{len(words_to_process)}] {word}...", end=" ", flush=True)

        new_def, passage = generate_passage_and_definition(word, definition, pos)

        if passage:
            words[i]['passage'] = passage
            if new_def and new_def != definition:
                words[i]['definition'] = new_def
                # Update tldr too
                words[i]['tldr'] = new_def.split('.')[0][:50] if new_def else word
            updated += 1
            print(f"OK")
        else:
            errors += 1
            print("ERROR")

        # Track progress
        progress['processed'].append(word)

        # Save every 50 words
        if (idx + 1) % 50 == 0:
            print(f"\n--- Saving progress ({updated} updated, {errors} errors) ---\n")
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(words, f, ensure_ascii=False, indent=2)
            save_progress(progress)

        # Rate limiting
        time.sleep(0.2)

    # Final save
    print(f"\n\nSaving final results...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
    save_progress(progress)

    print(f"\nDone!")
    print(f"  Updated: {updated}")
    print(f"  Errors: {errors}")
    print(f"\nNext step: Clear Firebase and re-import via import.html")

if __name__ == "__main__":
    main()
