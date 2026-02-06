"""
Vocabulary Processor for Ad Infinitum
Generates definitions, Korean translations, example sentences, and difficulty levels.
"""

import json
import requests
import time
import os
import sys

# Fix Unicode encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

# Force unbuffered output
import functools
print = functools.partial(print, flush=True)

# Get the script's directory
script_dir = os.path.dirname(os.path.abspath(__file__))

# Load raw words
with open(os.path.join(script_dir, 'data/words_raw.json'), 'r', encoding='utf-8') as f:
    raw_words = json.load(f)

print(f"Loaded {len(raw_words)} words")

# Word frequency list for difficulty assignment (common words = easier)
# Using a simplified approach based on word length and common patterns
def estimate_difficulty(word):
    """Estimate difficulty 1-5 based on word characteristics"""
    word_lower = word.lower().strip()

    # Very common/basic words
    basic_words = {'a', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                   'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
                   'could', 'should', 'may', 'might', 'must', 'shall', 'can',
                   'ability', 'about', 'above', 'accept', 'account', 'across',
                   'act', 'action', 'add', 'admit', 'adult', 'affect', 'after'}

    if word_lower in basic_words or len(word_lower) <= 4:
        return 1

    # Check for common prefixes/suffixes that indicate difficulty
    hard_prefixes = ['pseudo', 'quasi', 'meta', 'ante', 'circum', 'extra']
    hard_suffixes = ['aceous', 'itious', 'escent', 'iferous']

    for prefix in hard_prefixes:
        if word_lower.startswith(prefix):
            return 5

    for suffix in hard_suffixes:
        if word_lower.endswith(suffix):
            return 5

    # Length-based estimation
    if len(word_lower) <= 6:
        return 2
    elif len(word_lower) <= 8:
        return 3
    elif len(word_lower) <= 10:
        return 4
    else:
        return 5

def generate_tldr(definition):
    """Generate a 1-3 word TL;DR from a definition"""
    if not definition:
        return ''

    # Common words to skip
    skip_words = {
        'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by',
        'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'that', 'which',
        'who', 'whom', 'whose', 'this', 'these', 'those', 'it', 'its',
        'or', 'and', 'but', 'if', 'then', 'than', 'so', 'very', 'just',
        'also', 'only', 'even', 'more', 'most', 'other', 'some', 'any',
        'no', 'not', 'such', 'what', 'when', 'where', 'how', 'why',
        'all', 'each', 'every', 'both', 'few', 'many', 'much', 'own',
        'same', 'something', 'someone', 'anything', 'nothing', 'one',
        'two', 'first', 'into', 'about', 'over', 'after', 'before',
        'between', 'under', 'again', 'further', 'once', 'here', 'there',
        'because', 'while', 'although', 'though', 'until', 'unless',
        'whether', 'since', 'during', 'within', 'without', 'through',
        'act', 'make', 'cause', 'give', 'take', 'get', 'put', 'become',
        'come', 'go', 'see', 'show', 'let', 'begin', 'seem', 'help',
        'try', 'leave', 'call', 'need', 'feel', 'high', 'long', 'way',
        'thing', 'things', 'manner', 'state', 'quality', 'process',
        'relating', 'characterized', 'involving', 'marked', 'having'
    }

    # Clean the definition
    clean_def = definition.lower().strip()

    # Remove common starting phrases
    starters_to_remove = [
        'the act of', 'the process of', 'the state of', 'the quality of',
        'to be', 'to make', 'to cause', 'to give', 'relating to',
        'characterized by', 'having the quality of', 'in a manner that',
        'the ability to', 'a person who', 'one who', 'someone who',
        'something that', 'a thing that', 'an act of'
    ]

    for starter in starters_to_remove:
        if clean_def.startswith(starter):
            clean_def = clean_def[len(starter):].strip()

    # Split into words and filter
    import re
    words = re.findall(r'[a-zA-Z]+', clean_def)

    # Get meaningful words (not in skip list, at least 3 chars)
    meaningful = []
    for w in words:
        if w.lower() not in skip_words and len(w) >= 3:
            meaningful.append(w)
            if len(meaningful) >= 3:
                break

    # If we got nothing, just take the first meaningful-looking word
    if not meaningful and words:
        for w in words:
            if len(w) >= 3:
                meaningful = [w]
                break

    # Join with spaces, capitalize first letter
    if meaningful:
        result = ' '.join(meaningful[:3])
        return result.capitalize()

    return ''

def get_definition_from_api(word):
    """Try to get definition from free dictionary API"""
    try:
        url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                entry = data[0]
                meanings = entry.get('meanings', [])
                if meanings:
                    meaning = meanings[0]
                    pos = meaning.get('partOfSpeech', '')
                    definitions = meaning.get('definitions', [])
                    if definitions:
                        definition = definitions[0].get('definition', '')
                        example = definitions[0].get('example', '')
                        return {
                            'definition': definition,
                            'partOfSpeech': pos,
                            'example': example
                        }
    except Exception as e:
        pass
    return None

# Process words in batches
processed_words = []
failed_words = []

# Process all words
BATCH_SIZE = len(raw_words)
words_to_process = raw_words

print(f"\nProcessing {len(words_to_process)} words...")
print("This may take a while due to API rate limits.\n")

for i, word in enumerate(words_to_process):
    word_clean = word.strip()
    if not word_clean:
        continue

    print(f"[{i+1}/{len(words_to_process)}] Processing: {word_clean}")

    # Get definition from API
    api_data = get_definition_from_api(word_clean)

    word_entry = {
        'word': word_clean,
        'level': estimate_difficulty(word_clean),
        'definition': '',
        'tldr': '',
        'korean': '',
        'partOfSpeech': '',
        'example': ''
    }

    if api_data:
        word_entry['definition'] = api_data.get('definition', '')
        word_entry['partOfSpeech'] = api_data.get('partOfSpeech', '')
        word_entry['example'] = api_data.get('example', '')
        # Create TLDR (1-3 key words from definition)
        if word_entry['definition']:
            word_entry['tldr'] = generate_tldr(word_entry['definition'])
    else:
        failed_words.append(word_clean)

    processed_words.append(word_entry)

    # Rate limiting - be nice to the free API
    time.sleep(0.3)

# Save processed words
output_path = os.path.join(script_dir, 'data/words_processed.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(processed_words, f, ensure_ascii=False, indent=2)

print(f"\n\nProcessed {len(processed_words)} words")
print(f"Failed to get definitions for {len(failed_words)} words")
print(f"Saved to: {output_path}")

if failed_words:
    print(f"\nWords without definitions (will need manual entry):")
    for w in failed_words[:20]:
        print(f"  - {w}")
    if len(failed_words) > 20:
        print(f"  ... and {len(failed_words) - 20} more")

print(f"\nNext steps:")
print(f"1. Set up Firebase (see instructions)")
print(f"2. Run the import script to upload words to Firebase")
