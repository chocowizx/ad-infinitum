"""
Fix passages that contain the target word more than once.
Regenerates only those passages with a stricter prompt.
"""

import json
import os
import sys
import time
import re
import requests

sys.stdout.reconfigure(encoding='utf-8')

API_URL = "https://api.anthropic.com/v1/messages"

script_dir = os.path.dirname(os.path.abspath(__file__))

api_key_path = os.path.join(script_dir, 'api_key.txt')
with open(api_key_path, 'r') as f:
    API_KEY = f.read().strip()

input_path = os.path.join(script_dir, 'data/words_processed.json')
output_path = os.path.join(script_dir, 'data/words_processed.json')
progress_path = os.path.join(script_dir, 'data/fix_passage_progress.json')

def count_word_occurrences(word, text):
    """Count how many times word appears in text (whole word only)"""
    pattern = r'\b' + re.escape(word.lower()) + r'\b'
    return len(re.findall(pattern, text.lower(), re.IGNORECASE))

def generate_fixed_passage(word, definition, part_of_speech):
    """Generate a passage with EXACTLY one occurrence of the word"""

    prompt = f"""Write a 3-sentence college-level reading passage for the vocabulary word "{word}" ({part_of_speech}).

Definition: {definition}

CRITICAL REQUIREMENTS:
1. The word "{word}" must appear EXACTLY ONCE in the entire passage - no more, no less
2. Do NOT use the word multiple times, even in different forms
3. Do NOT use synonyms that are too similar to the word
4. The passage should be sophisticated and academic
5. The word should be used naturally and be essential to understanding the text
6. Topics: science, history, philosophy, literature, social issues

Return ONLY the 3-sentence passage, nothing else. Double-check that "{word}" appears exactly once before responding."""

    headers = {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    data = {
        "model": "claude-3-haiku-20240307",
        "max_tokens": 250,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    try:
        response = requests.post(API_URL, headers=headers, json=data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            passage = result['content'][0]['text'].strip()

            # Verify it only has 1 occurrence
            occurrences = count_word_occurrences(word, passage)
            if occurrences == 1:
                return passage, True
            else:
                return passage, False
        else:
            print(f"  API Error {response.status_code}: {response.text[:100]}")
            return None, False
    except Exception as e:
        print(f"  Request error: {e}")
        return None, False

def load_progress():
    if os.path.exists(progress_path):
        with open(progress_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'processed': []}

def save_progress(progress):
    with open(progress_path, 'w', encoding='utf-8') as f:
        json.dump(progress, f)

def main():
    print("Loading words...")
    with open(input_path, 'r', encoding='utf-8') as f:
        words = json.load(f)

    print(f"Loaded {len(words)} words")

    progress = load_progress()
    processed_words = set(progress.get('processed', []))

    # Find words with multiple occurrences in passage
    words_to_fix = []
    for i, w in enumerate(words):
        word = w.get('word', '')
        passage = w.get('passage', '')
        if word and passage and word not in processed_words:
            occurrences = count_word_occurrences(word, passage)
            if occurrences > 1:
                words_to_fix.append((i, w, occurrences))

    print(f"Passages to fix: {len(words_to_fix)}")

    if len(words_to_fix) == 0:
        print("All passages are good!")
        return

    print(f"\nEstimated cost: ~${len(words_to_fix) * 0.0005:.2f}")
    print("Starting regeneration...\n")

    fixed = 0
    still_bad = 0
    errors = 0

    for idx, (i, word_entry, old_count) in enumerate(words_to_fix):
        word = word_entry.get('word', '')
        definition = word_entry.get('definition', '')
        pos = word_entry.get('partOfSpeech', '')

        print(f"[{idx+1}/{len(words_to_fix)}] {word} (had {old_count})...", end=" ", flush=True)

        # Try up to 3 times to get a good passage
        success = False
        for attempt in range(3):
            passage, is_valid = generate_fixed_passage(word, definition, pos)

            if passage and is_valid:
                words[i]['passage'] = passage
                fixed += 1
                success = True
                print("OK")
                break
            elif passage:
                new_count = count_word_occurrences(word, passage)
                if attempt < 2:
                    print(f"retry({new_count})...", end=" ", flush=True)
                    time.sleep(0.3)

        if not success:
            if passage:
                # Use the last attempt anyway, even if not perfect
                words[i]['passage'] = passage
                still_bad += 1
                print(f"KEPT ({count_word_occurrences(word, passage)})")
            else:
                errors += 1
                print("ERROR")

        progress['processed'].append(word)

        # Save every 50 words
        if (idx + 1) % 50 == 0:
            print(f"\n--- Saving ({fixed} fixed, {still_bad} imperfect, {errors} errors) ---\n")
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(words, f, ensure_ascii=False, indent=2)
            save_progress(progress)

        time.sleep(0.2)

    # Final save
    print(f"\n\nSaving final results...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
    save_progress(progress)

    print(f"\nDone!")
    print(f"  Fixed: {fixed}")
    print(f"  Still imperfect: {still_bad}")
    print(f"  Errors: {errors}")
    print(f"\nNext step: Clear Firebase and re-import via import.html")

if __name__ == "__main__":
    main()
