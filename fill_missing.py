"""
Fill Missing Definitions for Ad Infinitum
Adds placeholder definitions and example sentences for words that failed API lookup.
"""

import json
import os
import sys

# Fix Unicode encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

script_dir = os.path.dirname(os.path.abspath(__file__))
input_path = os.path.join(script_dir, 'data/words_processed.json')
output_path = os.path.join(script_dir, 'data/words_processed.json')

# Load processed words
with open(input_path, 'r', encoding='utf-8') as f:
    words = json.load(f)

print(f"Loaded {len(words)} words")

# Count missing
missing_def = 0
missing_example = 0
filled_def = 0
filled_example = 0

# Common word patterns for generating basic definitions
def generate_basic_definition(word):
    """Generate a basic placeholder definition based on word patterns"""
    w = word.lower()

    # Common suffix patterns
    if w.endswith('ness'):
        base = w[:-4]
        return f"The state or quality of being {base}"
    elif w.endswith('ment'):
        base = w[:-4]
        return f"The act or process of {base}ing"
    elif w.endswith('tion') or w.endswith('sion'):
        return f"The act or state related to {word}"
    elif w.endswith('able') or w.endswith('ible'):
        base = w[:-4] if w.endswith('able') else w[:-4]
        return f"Capable of being {base}ed"
    elif w.endswith('ful'):
        base = w[:-3]
        return f"Full of {base}"
    elif w.endswith('less'):
        base = w[:-4]
        return f"Without {base}"
    elif w.endswith('ly'):
        base = w[:-2]
        return f"In a {base} manner"
    elif w.endswith('ous') or w.endswith('ious'):
        return f"Having the quality of being {word.replace('ous', '').replace('ious', '')}"
    elif w.endswith('ive'):
        return f"Tending to or having the quality of {word}"
    elif w.endswith('er') or w.endswith('or'):
        return f"One who performs the action of {word}"
    elif w.endswith('ist'):
        return f"A person who practices or is concerned with {w[:-3]}"
    elif w.endswith('ism'):
        return f"A belief, practice, or system related to {w[:-3]}"
    elif w.endswith('ity'):
        return f"The quality or state of being {w[:-3]}"
    elif w.endswith('ize'):
        return f"To make or become {w[:-3]}"
    else:
        return f"(Definition needed for: {word})"

def generate_basic_example(word, definition):
    """Generate a basic example sentence"""
    w = word.lower()

    # Try to create a natural sentence
    templates = [
        f"The student demonstrated {w} in their approach.",
        f"It is important to understand {w} in this context.",
        f"Many scholars consider {w} to be significant.",
        f"The concept of {w} was central to the discussion.",
        f"She showed great {w} during the presentation.",
    ]

    # Pick based on hash of word for consistency
    idx = sum(ord(c) for c in word) % len(templates)
    return templates[idx]

# Process each word
for word_entry in words:
    word = word_entry.get('word', '')

    # Fill missing definition
    if not word_entry.get('definition') or word_entry['definition'].strip() == '':
        missing_def += 1
        word_entry['definition'] = generate_basic_definition(word)
        word_entry['tldr'] = word.capitalize()  # Simple TL;DR is just the word
        filled_def += 1

    # Fill missing example
    if not word_entry.get('example') or word_entry['example'].strip() == '':
        missing_example += 1
        word_entry['example'] = generate_basic_example(word, word_entry.get('definition', ''))
        filled_example += 1

# Save updated words
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(words, f, ensure_ascii=False, indent=2)

print(f"\nResults:")
print(f"  Words missing definitions: {missing_def}")
print(f"  Words missing examples: {missing_example}")
print(f"  Filled definitions: {filled_def}")
print(f"  Filled examples: {filled_example}")
print(f"\nSaved to: {output_path}")
print(f"\nNote: Words with '(Definition needed for: ...)' should be manually reviewed.")
print(f"After running this, re-import via import.html to update Firebase.")
