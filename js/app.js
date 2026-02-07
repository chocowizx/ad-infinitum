// App state
let currentWord = null;
let currentOptions = [];
let sessionCount = 0;
let sessionCorrect = 0;
let currentStreak = 0; // Track consecutive correct answers
let wordsPool = [];
let userProgress = {};
let difficultWords = [];

// Spaced repetition intervals (in days)
const SR_INTERVALS = [1, 3, 7, 14, 30, 90];

// DOM Elements
const navLinks = document.querySelectorAll('#dashboard-screen .nav-link');
const sections = document.querySelectorAll('#dashboard-screen .section');

// Navigation
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetScreen = link.dataset.screen;

        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        sections.forEach(s => {
            s.classList.remove('active');
            if (s.id === `${targetScreen}-section`) {
                s.classList.add('active');
            }
        });

        // Load data for section
        if (targetScreen === 'learn') loadQuizQuestion();
        if (targetScreen === 'flashcards') loadFlashcard();
        if (targetScreen === 'progress') loadProgress();
        if (targetScreen === 'leaderboard') loadLeaderboard();
        if (targetScreen === 'review') loadReviewWords();
    });
});

// Initialize app
async function initApp() {
    await loadUserProgress();
    await loadDifficultWords();
    await loadQuizQuestion();
    updateSessionStats();
}

// Load user's word progress
async function loadUserProgress() {
    const snapshot = await db.collection('users').doc(currentUser.uid)
        .collection('wordProgress').get();

    userProgress = {};
    snapshot.forEach(doc => {
        userProgress[doc.id] = doc.data();
    });
}

// Load user's difficult words
async function loadDifficultWords() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    difficultWords = doc.data()?.difficultWords || [];
}

// ==================== QUIZ (LEARN) SECTION ====================

// Helper function to apply suffix to a word with proper spelling rules
function applySuffix(word, suffix) {
    if (!suffix) return word;

    const lowerWord = word.toLowerCase();

    // Handle -ing suffix
    if (suffix === 'ing') {
        if (lowerWord.endsWith('ie')) {
            return word.slice(0, -2) + 'ying';
        } else if (lowerWord.endsWith('e') && !lowerWord.endsWith('ee')) {
            return word.slice(0, -1) + 'ing';
        } else if (/[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(lowerWord) && lowerWord.length <= 6) {
            // Double final consonant for short words (run -> running)
            return word + word.slice(-1) + 'ing';
        }
        return word + 'ing';
    }

    // Handle -ed suffix
    if (suffix === 'ed') {
        if (lowerWord.endsWith('e')) {
            return word + 'd';
        } else if (lowerWord.endsWith('y') && !/[aeiou]y$/.test(lowerWord)) {
            return word.slice(0, -1) + 'ied';
        } else if (/[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(lowerWord) && lowerWord.length <= 6) {
            return word + word.slice(-1) + 'ed';
        }
        return word + 'ed';
    }

    // Handle -s suffix
    if (suffix === 's') {
        if (/[sxz]$/.test(lowerWord) || /[cs]h$/.test(lowerWord)) {
            return word + 'es';
        } else if (lowerWord.endsWith('y') && !/[aeiou]y$/.test(lowerWord)) {
            return word.slice(0, -1) + 'ies';
        }
        return word + 's';
    }

    // Handle -er, -est (comparatives)
    if (suffix === 'er' || suffix === 'est') {
        if (lowerWord.endsWith('e')) {
            return word + suffix.slice(1);
        } else if (lowerWord.endsWith('y') && !/[aeiou]y$/.test(lowerWord)) {
            return word.slice(0, -1) + 'i' + suffix;
        }
        return word + suffix;
    }

    // Handle -ly
    if (suffix === 'ly') {
        if (lowerWord.endsWith('le')) {
            return word.slice(0, -2) + 'ly';
        } else if (lowerWord.endsWith('y')) {
            return word.slice(0, -1) + 'ily';
        }
        return word + 'ly';
    }

    // Default: just append
    return word + suffix;
}

const QUESTIONS_PER_MODULE = 20;
const TOTAL_MODULES = 5;

let quizAllWords = []; // All available words for current filter
let allWordsCache = []; // Cache of all words for distractors
let moduleQueue = []; // Current module's question queue
let wrongAnswers = []; // Words answered incorrectly (to repeat)
let usedWordIds = new Set(); // Track words used across all modules in session
let practiceWrongAnswers = []; // Track all wrong answers this session for Review
let currentModule = 1;
let moduleProgress = 0;
let moduleCorrect = 0;

// Original quiz card HTML structure (restored when switching from message view)
const QUIZ_CARD_HTML = `
    <div class="quiz-header">
        <span class="quiz-level"><i class="fas fa-layer-group"></i> Level 1</span>
        <span class="quiz-progress">Question <span id="quiz-current">1</span></span>
    </div>
    <div class="quiz-sentence">
        <p id="quiz-sentence-text">Loading question...</p>
    </div>
    <div class="quiz-options" id="quiz-options"></div>
    <div id="quiz-feedback" class="quiz-feedback hidden">
        <div class="feedback-content">
            <div class="feedback-word">
                <h3 id="feedback-word"></h3>
                <span id="feedback-pos"></span>
            </div>
            <p id="feedback-definition" class="feedback-definition"></p>
            <button class="btn primary" id="next-question-btn">
                <i class="fas fa-arrow-right"></i> Next Question
            </button>
        </div>
    </div>
`;

function showQuizMessage(icon, title, subtitle) {
    document.getElementById('quiz-card').innerHTML = `
        <div class="no-reviews">
            <i class="fas fa-${icon}"></i>
            <p>${title}</p>
            <p style="font-size: 0.875rem; margin-top: 8px;">${subtitle}</p>
        </div>
    `;
}

function restoreQuizCard() {
    // Restore quiz structure if it was replaced with a message
    if (!document.getElementById('quiz-options')) {
        document.getElementById('quiz-card').innerHTML = QUIZ_CARD_HTML;
        // Re-attach next question button handler
        document.getElementById('next-question-btn')?.addEventListener('click', () => {
            loadQuizQuestion();
        });
    }
}

async function loadQuizQuestion() {
    const filter = document.getElementById('level-select').value;

    // Reload difficult words in case they were updated in flashcards
    await loadDifficultWords();

    // Load all words for distractor pool (cached)
    if (allWordsCache.length === 0) {
        const allSnapshot = await db.collection('words').get();
        allWordsCache = [];
        allSnapshot.forEach(doc => {
            allWordsCache.push({ id: doc.id, ...doc.data() });
        });
    }

    // Load words based on filter
    if (filter === 'difficult') {
        if (difficultWords.length === 0) {
            showQuizMessage('bookmark', 'No difficult words marked yet.', 'Mark words as difficult in Flashcards to practice them here.');
            return;
        }
        quizAllWords = allWordsCache.filter(w => difficultWords.includes(w.id));
    } else {
        const level = parseInt(filter);
        quizAllWords = allWordsCache.filter(w => w.level === level);
    }

    if (quizAllWords.length < 4) {
        showQuizMessage('info-circle', 'Not enough words available (need at least 4).', 'Try a different level or mark more difficult words.');
        return;
    }

    // Restore quiz card structure if it was replaced with a message
    restoreQuizCard();

    // Check if current module is complete (reached 20 questions)
    if (moduleProgress >= QUESTIONS_PER_MODULE) {
        showModuleComplete();
        return;
    }

    // Initialize module if queue is empty
    if (moduleQueue.length === 0) {
        initializeModule();
    }

    // Get next question from queue (shouldn't happen, but safety check)
    if (moduleQueue.length === 0) {
        showModuleComplete();
        return;
    }

    currentWord = moduleQueue.shift();
    await loadDistractors();
    displayQuizQuestion();
}

function initializeModule() {
    moduleProgress = 0;
    moduleCorrect = 0;

    // First add any wrong answers from previous attempts (these can repeat)
    moduleQueue = [...wrongAnswers];
    wrongAnswers = [];

    // Then fill remaining spots with NEW words (not used in previous modules)
    const shuffled = [...quizAllWords].sort(() => Math.random() - 0.5);
    const currentQueueIds = new Set(moduleQueue.map(w => w.id));

    for (const word of shuffled) {
        // Skip if already in queue or already used in previous modules
        if (!currentQueueIds.has(word.id) && !usedWordIds.has(word.id) && moduleQueue.length < QUESTIONS_PER_MODULE) {
            moduleQueue.push(word);
            currentQueueIds.add(word.id);
        }
    }

    // Mark all new words as used for future modules
    moduleQueue.forEach(w => usedWordIds.add(w.id));

    // Shuffle the final queue
    moduleQueue.sort(() => Math.random() - 0.5);

    console.log(`Module ${currentModule} initialized with ${moduleQueue.length} questions`);
}

async function loadDistractors() {
    const currentPOS = currentWord.partOfSpeech?.toLowerCase() || '';
    const currentLevel = currentWord.level || 1;

    // Get potential distractors - prioritize same part of speech and higher difficulty
    let potentialDistractors = allWordsCache.filter(w => {
        if (w.id === currentWord.id) return false;
        return true;
    });

    // Sort by: 1) same POS, 2) higher/same level, 3) random
    potentialDistractors.sort((a, b) => {
        const aPOS = a.partOfSpeech?.toLowerCase() || '';
        const bPOS = b.partOfSpeech?.toLowerCase() || '';

        // Prioritize same part of speech
        const aSamePOS = aPOS === currentPOS ? 1 : 0;
        const bSamePOS = bPOS === currentPOS ? 1 : 0;
        if (aSamePOS !== bSamePOS) return bSamePOS - aSamePOS;

        // Then prioritize same or higher level
        const aHigherLevel = a.level >= currentLevel ? 1 : 0;
        const bHigherLevel = b.level >= currentLevel ? 1 : 0;
        if (aHigherLevel !== bHigherLevel) return bHigherLevel - aHigherLevel;

        // Then random
        return Math.random() - 0.5;
    });

    // Take top 3 as distractors
    const distractors = potentialDistractors.slice(0, 3);

    // Create options array and shuffle
    currentOptions = [currentWord, ...distractors].sort(() => Math.random() - 0.5);
}

// Update streak fire effect on quiz card
function updateStreakEffect() {
    const quizCard = document.getElementById('quiz-card');

    // Remove existing streak indicator
    const existingIndicator = document.querySelector('.streak-indicator');
    if (existingIndicator) existingIndicator.remove();

    // Remove existing particles
    const existingParticles = document.querySelector('.fire-particles');
    if (existingParticles) existingParticles.remove();

    // Remove both effect classes
    quizCard.classList.remove('on-fire', 'on-plasma');
    delete quizCard.dataset.fireIntensity;

    if (currentStreak >= 10) {
        // Blue plasma effect for 10+ streak
        quizCard.classList.add('on-plasma');

        const intensity = Math.min(currentStreak - 9, 5);
        quizCard.dataset.fireIntensity = intensity;

        // Add streak indicator (plasma style)
        const indicator = document.createElement('div');
        indicator.className = 'streak-indicator plasma';
        indicator.innerHTML = `
            <span class="streak-flames">${'⚡'.repeat(Math.min(intensity + 2, 5))}</span>
            <span class="streak-count">${currentStreak}</span>
            <span class="streak-label">LEGENDARY!</span>
        `;
        quizCard.appendChild(indicator);

        // Add plasma particles
        const particles = document.createElement('div');
        particles.className = 'fire-particles plasma';
        for (let i = 0; i < 15 + intensity * 4; i++) {
            const particle = document.createElement('div');
            particle.className = 'fire-particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 2 + 's';
            particle.style.animationDuration = (0.8 + Math.random() * 1) + 's';
            particles.appendChild(particle);
        }
        quizCard.appendChild(particles);

    } else if (currentStreak >= 3) {
        // Fire effect for 3-9 streak
        quizCard.classList.add('on-fire');

        const intensity = Math.min(currentStreak - 2, 5);
        quizCard.dataset.fireIntensity = intensity;

        // Add streak indicator
        const indicator = document.createElement('div');
        indicator.className = 'streak-indicator';
        indicator.innerHTML = `
            <span class="streak-flames">${'🔥'.repeat(Math.min(intensity, 5))}</span>
            <span class="streak-count">${currentStreak}</span>
            <span class="streak-label">STREAK!</span>
        `;
        quizCard.appendChild(indicator);

        // Add floating fire particles
        const particles = document.createElement('div');
        particles.className = 'fire-particles';
        for (let i = 0; i < 12 + intensity * 3; i++) {
            const particle = document.createElement('div');
            particle.className = 'fire-particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 2 + 's';
            particle.style.animationDuration = (1 + Math.random() * 1.5) + 's';
            particles.appendChild(particle);
        }
        quizCard.appendChild(particles);
    }
}

// Create confetti effect
function createConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);

    const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        container.appendChild(confetti);
    }

    // Remove after animation
    setTimeout(() => container.remove(), 5000);
}

// Get encouraging message based on performance
function getEncouragement(accuracy, isPerfect) {
    if (isPerfect) {
        const perfectMessages = [
            "Perfect score! You're absolutely incredible! 🌟",
            "Flawless! Your dedication is truly inspiring! ✨",
            "100%! You're on fire! Keep that momentum going! 🔥",
            "Amazing! Every single one correct - you're a star! ⭐",
            "Perfect! Your hard work is really paying off! 💪"
        ];
        return perfectMessages[Math.floor(Math.random() * perfectMessages.length)];
    } else if (accuracy >= 80) {
        const greatMessages = [
            "Great job! You're doing wonderfully! 🎉",
            "So close to perfect! You've got this! 💫",
            "Impressive work! Keep pushing forward! 🚀",
            "You're making amazing progress! 🌈"
        ];
        return greatMessages[Math.floor(Math.random() * greatMessages.length)];
    } else if (accuracy >= 60) {
        const goodMessages = [
            "Nice effort! Every step counts! 💪",
            "You're learning and growing! Keep going! 🌱",
            "Good work! Practice makes perfect! 📚",
            "You've got potential! Let's keep building! 🏗️"
        ];
        return goodMessages[Math.floor(Math.random() * goodMessages.length)];
    } else {
        const encourageMessages = [
            "Don't give up! Every expert was once a beginner! 💖",
            "You're braver than you believe! Keep trying! 🦋",
            "Learning takes time - you're doing great! 🌻",
            "Mistakes help us grow! You've got this! 🌟"
        ];
        return encourageMessages[Math.floor(Math.random() * encourageMessages.length)];
    }
}

function showModuleComplete() {
    const accuracy = moduleProgress > 0 ? Math.round((moduleCorrect / moduleProgress) * 100) : 0;
    const hasWrongAnswers = wrongAnswers.length > 0;
    const isPerfect = moduleCorrect === moduleProgress;

    // Clear fire effect
    currentStreak = 0;
    updateStreakEffect();

    // Show confetti!
    createConfetti();

    const encouragement = getEncouragement(accuracy, isPerfect);

    document.getElementById('quiz-card').innerHTML = `
        <div class="no-reviews module-complete">
            <div class="trophy-icon">${isPerfect ? '👑' : '🏆'}</div>
            <h3>Module ${currentModule} Complete!</h3>
            <p class="encouragement">${encouragement}</p>
            <p style="font-size: 1.25rem; margin: 16px 0;">Score: ${moduleCorrect}/${moduleProgress} (${accuracy}%)</p>
            ${hasWrongAnswers ? `<p style="color: #ef4444;">You'll review ${wrongAnswers.length} missed word(s) in the next module.</p>` : '<p style="color: #10b981;">Perfect! No words to review.</p>'}
            ${currentModule < TOTAL_MODULES ? `
                <button class="btn primary" id="next-module-btn" style="margin-top: 16px;">
                    <i class="fas fa-arrow-right"></i> Start Module ${currentModule + 1}
                </button>
            ` : `
                <p style="margin-top: 16px; font-weight: bold;">🎊 All 5 modules completed! 🎊</p>
                <button class="btn primary" id="restart-modules-btn" style="margin-top: 16px;">
                    <i class="fas fa-redo"></i> Start Over
                </button>
            `}
        </div>
    `;

    if (currentModule < TOTAL_MODULES) {
        document.getElementById('next-module-btn').addEventListener('click', () => {
            currentModule++;
            initializeModule();
            loadQuizQuestion();
        });
    } else {
        document.getElementById('restart-modules-btn').addEventListener('click', () => {
            currentModule = 1;
            wrongAnswers = [];
            initializeModule();
            loadQuizQuestion();
        });
    }
}

function displayQuizQuestion() {
    const filter = document.getElementById('level-select').value;
    const remaining = moduleQueue.length;

    // Create passage with blank - use passage field (3-sentence reading), fallback to example
    let sentence;
    if (currentWord.passage && currentWord.passage.trim()) {
        sentence = currentWord.passage;
    } else if (currentWord.example && currentWord.example.trim()) {
        sentence = currentWord.example;
    } else if (currentWord.definition) {
        sentence = `A word meaning "${currentWord.definition}" is _______.`;
    } else {
        sentence = `The word "${currentWord.word}" fits in this blank: _______`;
    }

    // Replace the word with a blank and detect the suffix used
    // Only detect SIMPLE suffixes that can be applied to other words
    const baseWord = currentWord.word.replace(/e$/, ''); // handle words ending in 'e'
    const wordRegex = new RegExp(`\\b(${currentWord.word}|${baseWord})(s|ed|ing|ly|er|est|'s)?\\b`, 'gi');

    // Find the first match to detect the suffix
    let detectedSuffix = '';
    const match = sentence.match(wordRegex);
    if (match && match[0]) {
        const matchedWord = match[0].toLowerCase();
        const base = currentWord.word.toLowerCase();
        const baseNoE = baseWord.toLowerCase();
        if (matchedWord !== base && matchedWord !== baseNoE) {
            // Extract suffix - only simple ones
            const simpleSuffixes = ['s', 'ed', 'ing', 'ly', 'er', 'est'];
            if (matchedWord.startsWith(base)) {
                const suffix = matchedWord.slice(base.length);
                if (simpleSuffixes.includes(suffix)) {
                    detectedSuffix = suffix;
                }
            } else if (matchedWord.startsWith(baseNoE)) {
                const suffix = matchedWord.slice(baseNoE.length);
                if (simpleSuffixes.includes(suffix)) {
                    detectedSuffix = suffix;
                }
            }
        }
    }

    // Store suffix for answer options
    currentWord.detectedSuffix = detectedSuffix;

    // Replace only the FIRST occurrence (not global replace)
    let replaced = false;
    sentence = sentence.replace(wordRegex, (match) => {
        if (!replaced) {
            replaced = true;
            return '<span class="blank">_______</span>';
        }
        return match; // Keep subsequent occurrences as-is
    });

    // Update UI
    const levelLabel = filter === 'difficult' ? 'Difficult Words' : `Level ${filter}`;
    document.querySelector('.quiz-level').innerHTML = `
        <i class="fas fa-layer-group"></i> ${levelLabel} |
        <strong>Module ${currentModule}/${TOTAL_MODULES}</strong> |
        Q${moduleProgress + 1}/${QUESTIONS_PER_MODULE} (${remaining} left)
    `;
    document.getElementById('quiz-sentence-text').innerHTML = sentence;

    // Generate options with matching suffix/tense
    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = currentOptions.map((opt, i) => {
        let displayWord = opt.word;
        if (detectedSuffix) {
            displayWord = applySuffix(opt.word, detectedSuffix);
        }
        return `
            <button class="quiz-option" data-index="${i}" data-word-id="${opt.id}">
                ${String.fromCharCode(65 + i)}. ${displayWord}
            </button>
        `;
    }).join('');

    // Add click handlers
    document.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', () => handleQuizAnswer(btn));
    });

    // Hide feedback
    document.getElementById('quiz-feedback').classList.add('hidden');
}

async function handleQuizAnswer(selectedBtn) {
    const selectedId = selectedBtn.dataset.wordId;
    const isCorrect = selectedId === currentWord.id;

    // Update module progress
    moduleProgress++;

    // Disable all options
    document.querySelectorAll('.quiz-option').forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.wordId === currentWord.id) {
            btn.classList.add('correct-answer');
        }
    });

    // Mark selected
    if (isCorrect) {
        selectedBtn.classList.add('correct');
        sessionCorrect++;
        moduleCorrect++;
        currentStreak++;

        // Apply fire effect for 3+ streak
        updateStreakEffect();
    } else {
        selectedBtn.classList.add('incorrect');
        currentStreak = 0; // Reset streak
        updateStreakEffect();

        // Add to wrong answers for repetition in next module
        if (!wrongAnswers.find(w => w.id === currentWord.id)) {
            wrongAnswers.push(currentWord);
        }
        // Track for Review section
        if (!practiceWrongAnswers.find(w => w.id === currentWord.id)) {
            practiceWrongAnswers.push(currentWord);
        }
        // Save to Firebase for persistent wrong answers list
        saveWrongAnswer(currentWord.id);
    }

    sessionCount++;
    updateSessionStats();

    // Record progress
    await recordProgress(currentWord.id, isCorrect ? 5 : 1);

    // Show feedback
    const feedback = document.getElementById('quiz-feedback');
    document.getElementById('feedback-word').textContent = currentWord.word;
    document.getElementById('feedback-pos').textContent = currentWord.partOfSpeech || '';
    document.getElementById('feedback-definition').textContent = currentWord.definition || '';
    feedback.classList.remove('hidden');
}

// Next question button
document.getElementById('next-question-btn')?.addEventListener('click', () => {
    loadQuizQuestion();
});

// Level selector change - reset modules when changing level
document.getElementById('level-select')?.addEventListener('change', () => {
    currentModule = 1;
    moduleQueue = [];
    wrongAnswers = [];
    usedWordIds = new Set(); // Reset used words for new level
    moduleProgress = 0;
    moduleCorrect = 0;
    loadQuizQuestion();
});

// ==================== FLASHCARDS SECTION ====================

let currentFlashcard = null;
let flashcardPool = [];
let flashcardStudied = []; // Track studied cards this session

async function loadFlashcard() {
    const filter = document.getElementById('flashcard-level-select').value;

    if (filter === 'difficult') {
        // Load difficult words
        if (difficultWords.length === 0) {
            showNoFlashcards('No difficult words marked yet. Study some flashcards and mark words as difficult!');
            return;
        }
        // Get ALL difficult words from Firebase
        flashcardPool = [];
        for (const wordId of difficultWords) {
            const doc = await db.collection('words').doc(wordId).get();
            if (doc.exists) {
                flashcardPool.push({ id: doc.id, ...doc.data() });
            }
        }
    } else if (filter === 'all') {
        // Get ALL words (paginated fetch)
        const snapshot = await db.collection('words').get();
        flashcardPool = [];
        snapshot.forEach(doc => {
            flashcardPool.push({ id: doc.id, ...doc.data() });
        });
    } else {
        const level = parseInt(filter);
        // Get ALL words at this level
        const snapshot = await db.collection('words')
            .where('level', '==', level)
            .get();
        flashcardPool = [];
        snapshot.forEach(doc => {
            flashcardPool.push({ id: doc.id, ...doc.data() });
        });
    }

    if (flashcardPool.length === 0) {
        showNoFlashcards('No flashcards available for this selection.');
        return;
    }

    // Filter out already studied cards
    let availableCards = flashcardPool.filter(c => !flashcardStudied.includes(c.id));

    // If all cards studied, offer restart
    if (availableCards.length === 0) {
        showFlashcardComplete();
        return;
    }

    // Pick random card from remaining
    currentFlashcard = availableCards[Math.floor(Math.random() * availableCards.length)];
    flashcardStudied.push(currentFlashcard.id);
    displayFlashcard();
}

function showFlashcardComplete() {
    document.getElementById('flashcard-card').innerHTML = `
        <div class="no-reviews">
            <i class="fas fa-trophy"></i>
            <p>You've studied all ${flashcardPool.length} cards in this set!</p>
            <p style="font-size: 0.875rem; margin-top: 8px;">Great work completing the full list.</p>
            <button class="btn primary" id="restart-flashcards-btn" style="margin-top: 16px;">
                <i class="fas fa-redo"></i> Start Over
            </button>
        </div>
    `;
    document.getElementById('restart-flashcards-btn').addEventListener('click', () => {
        flashcardStudied = [];
        loadFlashcard();
    });
}

function showNoFlashcards(message) {
    document.getElementById('flashcard-card').innerHTML = `
        <div class="no-reviews">
            <i class="fas fa-clone"></i>
            <p>${message}</p>
        </div>
    `;
}

function displayFlashcard() {
    const card = document.getElementById('flashcard-card');
    const isDifficult = difficultWords.includes(currentFlashcard.id);
    const remaining = flashcardPool.length - flashcardStudied.length;
    const filter = document.getElementById('flashcard-level-select').value;
    const filterLabel = filter === 'difficult' ? 'Difficult' : (filter === 'all' ? 'All' : `Level ${filter}`);

    card.innerHTML = `
        <div class="card-inner">
            <div class="flashcard-front">
                <span class="word-level"><i class="fas fa-layer-group"></i> ${filterLabel} (${remaining} remaining)</span>
                <h3 class="flashcard-word">${currentFlashcard.word}</h3>
                <p class="flashcard-pos">${currentFlashcard.partOfSpeech || ''}</p>
                <button class="btn primary show-flashcard-answer">
                    <i class="fas fa-eye"></i> Reveal Answer
                </button>
            </div>
            <div class="flashcard-back hidden">
                <div class="answer-content">
                    <h3 class="flashcard-word-back" style="text-align: center; font-family: 'DM Serif Display', serif; font-size: 2rem; margin-bottom: 8px;">${currentFlashcard.word}</h3>
                    <span class="flashcard-pos-back" style="display: block; text-align: center; background: var(--gray-100); padding: 4px 12px; border-radius: 4px; font-size: 0.8125rem; margin: 0 auto 20px; width: fit-content;">${currentFlashcard.partOfSpeech || ''}</span>
                    <div class="definition-box">
                        <p class="flashcard-definition">${currentFlashcard.definition || 'No definition available'}</p>
                    </div>
                    <div class="tldr-box">
                        <span class="tldr-label">TL;DR</span>
                        <p class="flashcard-tldr" style="display: inline;">${currentFlashcard.tldr || currentFlashcard.definition || ''}</p>
                    </div>
                    ${currentFlashcard.korean ? `<p class="flashcard-korean" style="text-align: center; color: var(--primary); font-size: 1.125rem; font-weight: 600; margin: 16px 0;">${currentFlashcard.korean}</p>` : ''}
                    ${currentFlashcard.example ? `
                        <div class="example-box">
                            <i class="fas fa-quote-left"></i>
                            <p class="flashcard-example"><em>${currentFlashcard.example}</em></p>
                        </div>
                    ` : ''}
                </div>
                <div class="flashcard-actions">
                    <button class="btn mark-difficult ${isDifficult ? 'marked' : ''}" id="mark-difficult-btn">
                        <i class="fas fa-bookmark"></i> ${isDifficult ? 'Marked Difficult' : 'Mark Difficult'}
                    </button>
                    <button class="btn primary next-flashcard" id="next-flashcard-btn">
                        <i class="fas fa-arrow-right"></i> Next Card
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add event listeners
    card.querySelector('.show-flashcard-answer').addEventListener('click', () => {
        card.querySelector('.flashcard-front').classList.add('hidden');
        card.querySelector('.flashcard-back').classList.remove('hidden');
    });

    card.querySelector('#mark-difficult-btn').addEventListener('click', toggleDifficult);
    card.querySelector('#next-flashcard-btn').addEventListener('click', loadFlashcard);
}

async function toggleDifficult() {
    const btn = document.getElementById('mark-difficult-btn');
    const wordId = currentFlashcard.id;

    if (difficultWords.includes(wordId)) {
        // Remove from difficult
        difficultWords = difficultWords.filter(id => id !== wordId);
        btn.classList.remove('marked');
        btn.innerHTML = '<i class="fas fa-bookmark"></i> Mark Difficult';
    } else {
        // Add to difficult
        difficultWords.push(wordId);
        btn.classList.add('marked');
        btn.innerHTML = '<i class="fas fa-bookmark"></i> Marked Difficult';
    }

    // Save to Firebase
    await db.collection('users').doc(currentUser.uid).update({
        difficultWords: difficultWords
    });
}

// Flashcard level selector - reset studied cards when changing filter
document.getElementById('flashcard-level-select')?.addEventListener('change', () => {
    flashcardStudied = [];
    loadFlashcard();
});

// ==================== RECORD PROGRESS ====================

async function recordProgress(wordId, rating) {
    const now = new Date();
    const isCorrect = rating >= 3;

    let intervalIndex = 0;
    if (userProgress[wordId]) {
        intervalIndex = userProgress[wordId].intervalIndex || 0;
        if (isCorrect) {
            intervalIndex = Math.min(intervalIndex + 1, SR_INTERVALS.length - 1);
        } else {
            intervalIndex = 0;
        }
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + SR_INTERVALS[intervalIndex]);

    const progressData = {
        wordId: wordId,
        lastReview: firebase.firestore.FieldValue.serverTimestamp(),
        nextReview: firebase.firestore.Timestamp.fromDate(nextReview),
        intervalIndex: intervalIndex,
        timesReviewed: (userProgress[wordId]?.timesReviewed || 0) + 1,
        timesCorrect: (userProgress[wordId]?.timesCorrect || 0) + (isCorrect ? 1 : 0),
        mastered: intervalIndex >= 4
    };

    await db.collection('users').doc(currentUser.uid)
        .collection('wordProgress').doc(wordId).set(progressData);

    userProgress[wordId] = progressData;

    // Update user stats
    const isNewWord = !userProgress[wordId]?.timesReviewed || userProgress[wordId].timesReviewed === 1;
    const justMastered = progressData.mastered && !userProgress[wordId]?.mastered;

    const updates = {
        totalAttempts: firebase.firestore.FieldValue.increment(1),
        totalCorrect: firebase.firestore.FieldValue.increment(isCorrect ? 1 : 0)
    };

    if (isNewWord) {
        updates.wordsLearned = firebase.firestore.FieldValue.increment(1);
    }

    if (justMastered) {
        updates.wordsMastered = firebase.firestore.FieldValue.increment(1);
    }

    await db.collection('users').doc(currentUser.uid).update(updates);
}

// Save wrong answer to Firebase for Review section
async function saveWrongAnswer(wordId) {
    try {
        await db.collection('users').doc(currentUser.uid).update({
            wrongAnswers: firebase.firestore.FieldValue.arrayUnion({
                wordId: wordId,
                timestamp: new Date().toISOString()
            })
        });
    } catch (e) {
        // Field might not exist, create it
        await db.collection('users').doc(currentUser.uid).set({
            wrongAnswers: [{
                wordId: wordId,
                timestamp: new Date().toISOString()
            }]
        }, { merge: true });
    }
}

// Clear a wrong answer from Firebase (when user reviews it)
async function clearWrongAnswer(wordId) {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const wrongAnswers = userDoc.data()?.wrongAnswers || [];
    const filtered = wrongAnswers.filter(w => w.wordId !== wordId);
    await db.collection('users').doc(currentUser.uid).update({
        wrongAnswers: filtered
    });
}

// Update session stats display
function updateSessionStats() {
    document.getElementById('session-count').textContent = sessionCount;
    document.getElementById('session-correct').textContent = sessionCorrect;
    document.getElementById('streak-count').textContent = userProfile.currentStreak || 0;
}

// ==================== REVIEW SECTION ====================

let reviewQueue = [];
let currentReviewIndex = 0;

async function loadReviewWords() {
    const now = new Date();
    reviewQueue = [];
    const addedIds = new Set();

    // First, load wrong answers from practice (priority)
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const savedWrongAnswers = userDoc.data()?.wrongAnswers || [];

    for (const wrong of savedWrongAnswers) {
        if (!addedIds.has(wrong.wordId)) {
            const wordDoc = await db.collection('words').doc(wrong.wordId).get();
            if (wordDoc.exists) {
                reviewQueue.push({
                    id: wrong.wordId,
                    ...wordDoc.data(),
                    isWrongAnswer: true,
                    wrongTimestamp: wrong.timestamp
                });
                addedIds.add(wrong.wordId);
            }
        }
    }

    // Then add spaced repetition due words
    for (const [wordId, progress] of Object.entries(userProgress)) {
        if (!addedIds.has(wordId) && progress.nextReview && progress.nextReview.toDate() <= now) {
            const wordDoc = await db.collection('words').doc(wordId).get();
            if (wordDoc.exists) {
                reviewQueue.push({ id: wordId, ...wordDoc.data(), progress });
                addedIds.add(wordId);
            }
        }
    }

    const wrongCount = savedWrongAnswers.length;
    const dueCount = reviewQueue.length - wrongCount;
    document.getElementById('due-count').textContent = wrongCount > 0
        ? `${wrongCount} wrong answer${wrongCount > 1 ? 's' : ''} + ${dueCount} due for review`
        : `${reviewQueue.length} words due for review`;

    const reviewCard = document.getElementById('review-card');
    if (reviewQueue.length === 0) {
        reviewCard.innerHTML = `
            <div class="no-reviews">
                <i class="fas fa-check-circle"></i>
                <p>All caught up! No words to review.</p>
                <p style="font-size: 0.875rem; margin-top: 8px;">Keep practicing to build your review queue.</p>
            </div>
        `;
    } else {
        currentReviewIndex = 0;
        displayReviewWord();
    }
}

function displayReviewWord() {
    if (currentReviewIndex >= reviewQueue.length) {
        document.getElementById('review-card').innerHTML = `
            <div class="no-reviews">
                <i class="fas fa-trophy"></i>
                <p>Review session complete!</p>
                <p style="font-size: 0.875rem; margin-top: 8px;">You reviewed ${reviewQueue.length} words. Great work!</p>
            </div>
        `;
        document.getElementById('due-count').textContent = '0 words due for review';
        return;
    }

    const word = reviewQueue[currentReviewIndex];
    currentWord = word;

    const reviewCard = document.getElementById('review-card');
    const labelIcon = word.isWrongAnswer ? 'fa-exclamation-circle' : 'fa-redo';
    const labelText = word.isWrongAnswer ? 'Wrong Answer' : 'Review';
    const labelColor = word.isWrongAnswer ? 'color: #ef4444;' : '';

    reviewCard.innerHTML = `
        <div class="card-inner">
            <div class="review-card-front">
                <span class="word-level" style="${labelColor}"><i class="fas ${labelIcon}"></i> ${labelText} (${currentReviewIndex + 1}/${reviewQueue.length})</span>
                <h3 class="word">${word.word}</h3>
                <p class="part-of-speech">${word.partOfSpeech || ''}</p>
                <button class="btn primary show-review-answer">
                    <i class="fas fa-eye"></i> Reveal Answer
                </button>
            </div>
            <div class="review-card-back hidden">
                <div class="answer-content">
                    <h3 class="word" style="text-align: center;">${word.word}</h3>
                    <span class="part-of-speech" style="display: block; text-align: center; background: var(--gray-100); padding: 4px 12px; border-radius: 4px; font-style: normal; font-size: 0.8125rem; margin: 0 auto 20px; width: fit-content;">${word.partOfSpeech || ''}</span>
                    <div class="definition-box">
                        <p class="definition">${word.definition || 'No definition available'}</p>
                    </div>
                    <div class="tldr-box">
                        <span class="tldr-label">TL;DR</span>
                        <p class="definition-simple" style="display: inline;">${word.tldr || word.definition || ''}</p>
                    </div>
                    ${word.korean ? `<p class="korean" style="text-align: center; color: var(--primary); font-size: 1.125rem; font-weight: 600; margin-bottom: 16px;">${word.korean}</p>` : ''}
                    ${word.example ? `
                        <div class="example-box">
                            <i class="fas fa-quote-left"></i>
                            <p class="example"><em>${word.example}</em></p>
                        </div>
                    ` : ''}
                </div>
                <div class="rating-buttons">
                    <button class="btn rating wrong review-rating" data-rating="1">
                        <i class="fas fa-times"></i> Didn't Know
                    </button>
                    <button class="btn rating okay review-rating" data-rating="3">
                        <i class="fas fa-check"></i> Got It
                    </button>
                    <button class="btn rating easy review-rating" data-rating="5">
                        <i class="fas fa-bolt"></i> Easy!
                    </button>
                </div>
            </div>
        </div>
    `;

    reviewCard.querySelector('.show-review-answer').addEventListener('click', () => {
        reviewCard.querySelector('.review-card-front').classList.add('hidden');
        reviewCard.querySelector('.review-card-back').classList.remove('hidden');
    });

    reviewCard.querySelectorAll('.review-rating').forEach(btn => {
        btn.addEventListener('click', async () => {
            const rating = parseInt(btn.dataset.rating);
            await recordProgress(currentWord.id, rating);

            // Clear from wrong answers list if it was a wrong answer
            if (currentWord.isWrongAnswer) {
                await clearWrongAnswer(currentWord.id);
            }

            sessionCount++;
            updateSessionStats();
            currentReviewIndex++;
            displayReviewWord();
        });
    });
}

// ==================== PROGRESS SECTION ====================

async function loadProgress() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    userProfile = doc.data();

    document.getElementById('words-learned').textContent = userProfile.wordsLearned || 0;
    document.getElementById('words-mastered').textContent = userProfile.wordsMastered || 0;

    const accuracy = userProfile.totalAttempts > 0
        ? Math.round((userProfile.totalCorrect / userProfile.totalAttempts) * 100)
        : 0;
    document.getElementById('accuracy').textContent = `${accuracy}%`;
    document.getElementById('current-streak').textContent = `${userProfile.currentStreak || 0} days`;

    await loadLevelProgress();
}

async function loadLevelProgress() {
    const levelBars = document.getElementById('level-bars');
    levelBars.innerHTML = '<p style="color: var(--gray-500); text-align: center;">Loading...</p>';

    let html = '';
    for (let level = 1; level <= 5; level++) {
        const totalSnapshot = await db.collection('words')
            .where('level', '==', level)
            .get();
        const totalWords = totalSnapshot.size;

        let learnedCount = 0;
        for (const [wordId, progress] of Object.entries(userProgress)) {
            const wordDoc = await db.collection('words').doc(wordId).get();
            if (wordDoc.exists && wordDoc.data().level === level) {
                learnedCount++;
            }
        }

        const percentage = totalWords > 0 ? Math.round((learnedCount / totalWords) * 100) : 0;
        const levelNames = ['', 'Basic', 'Elementary', 'Intermediate', 'Advanced', 'Expert'];

        html += `
            <div class="level-bar">
                <div class="level-bar-label">
                    <span>Level ${level} - ${levelNames[level]}</span>
                    <span>${learnedCount}/${totalWords} (${percentage}%)</span>
                </div>
                <div class="level-bar-track">
                    <div class="level-bar-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }
    levelBars.innerHTML = html;
}

// ==================== LEADERBOARD SECTION ====================

async function loadLeaderboard() {
    const snapshot = await db.collection('users')
        .orderBy('totalCorrect', 'desc')
        .limit(50)
        .get();

    const rows = document.getElementById('leaderboard-rows');
    rows.innerHTML = '';

    let rank = 1;
    snapshot.forEach(doc => {
        const user = doc.data();
        if (user.isAdmin) return; // Skip admins

        const isCurrentUser = doc.id === currentUser.uid;
        const accuracy = user.totalAttempts > 0
            ? Math.round((user.totalCorrect / user.totalAttempts) * 100)
            : 0;

        let rankBadge = '';
        if (rank === 1) rankBadge = 'gold';
        else if (rank === 2) rankBadge = 'silver';
        else if (rank === 3) rankBadge = 'bronze';

        rows.innerHTML += `
            <div class="leaderboard-row ${isCurrentUser ? 'current-user' : ''}">
                <span><span class="rank-badge ${rankBadge}">${rank}</span></span>
                <span>${user.displayName}${isCurrentUser ? ' (You)' : ''}</span>
                <span>${user.totalCorrect || 0}</span>
                <span>${accuracy}%</span>
            </div>
        `;
        rank++;
    });
}
