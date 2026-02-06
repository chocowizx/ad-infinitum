"""
Generate Example Sentences using Claude API
Processes words and creates high-quality example sentences for SAT practice.
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
progress_path = os.path.join(script_dir, 'data/generation_progress.json')

def generate_example(word, definition, part_of_speech):
    """Generate an example sentence using Claude API"""

    prompt = f"""Generate ONE example sentence for the vocabulary word "{word}" ({part_of_speech}).

Definition: {definition}

Requirements:
- The sentence must clearly demonstrate the meaning of the word
- Use the word naturally in context (not forced)
- Make it suitable for SAT-level students
- The sentence should be 15-25 words long
- Do NOT include the definition in the sentence
- The word "{word}" MUST appear exactly once in the sentence

Return ONLY the example sentence, nothing else."""

    headers = {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    data = {
        "model": "claude-3-haiku-20240307",
        "max_tokens": 100,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    try:
        response = requests.post(API_URL, headers=headers, json=data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            return result['content'][0]['text'].strip()
        else:
            print(f"  API Error {response.status_code}: {response.text[:100]}")
            return None
    except Exception as e:
        print(f"  Request error: {e}")
        return None

def needs_new_example(word_entry):
    """Check if a word needs a new example sentence"""
    example = word_entry.get('example', '')

    # No example at all
    if not example or len(example.strip()) < 10:
        return True

    # Has placeholder/template example
    placeholder_phrases = [
        "The student demonstrated",
        "It is important to understand",
        "Many scholars consider",
        "The concept of",
        "She showed great"
    ]

    for phrase in placeholder_phrases:
        if phrase in example:
            return True

    return False

def load_progress():
    """Load progress from previous run"""
    if os.path.exists(progress_path):
        with open(progress_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'processed': [], 'last_index': 0}

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
    processed_ids = set(progress.get('processed', []))

    # Count words needing new examples
    words_to_process = []
    for i, word in enumerate(words):
        word_id = word.get('word', str(i))
        if word_id not in processed_ids and needs_new_example(word):
            words_to_process.append((i, word))

    print(f"Words needing new examples: {len(words_to_process)}")

    if len(words_to_process) == 0:
        print("All words already have good examples!")
        return

    print(f"\nEstimated cost: ~${len(words_to_process) * 0.0003:.2f}")
    print("Starting generation...\n")

    # Process words
    updated = 0
    errors = 0

    for idx, (i, word_entry) in enumerate(words_to_process):
        word = word_entry.get('word', '')
        definition = word_entry.get('definition', '')
        pos = word_entry.get('partOfSpeech', '')

        print(f"[{idx+1}/{len(words_to_process)}] {word}...", end=" ", flush=True)

        if not definition:
            print("SKIP (no definition)")
            continue

        example = generate_example(word, definition, pos)

        if example:
            words[i]['example'] = example
            updated += 1
            print(f"OK")
        else:
            errors += 1
            print("ERROR")

        # Track progress
        progress['processed'].append(word)
        progress['last_index'] = i

        # Save every 50 words
        if (idx + 1) % 50 == 0:
            print(f"\n--- Saving progress ({updated} updated, {errors} errors) ---\n")
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(words, f, ensure_ascii=False, indent=2)
            save_progress(progress)

        # Rate limiting - Haiku allows many requests but let's be safe
        time.sleep(0.2)

    # Final save
    print(f"\n\nSaving final results...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
    save_progress(progress)

    print(f"\nDone!")
    print(f"  Updated: {updated}")
    print(f"  Errors: {errors}")
    print(f"\nNext step: Re-import via import.html to update Firebase")

if __name__ == "__main__":
    main()
