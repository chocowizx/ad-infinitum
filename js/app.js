// App state
let currentWord = null;
let currentOptions = [];
let sessionCount = 0;
let sessionCorrect = 0;
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

let quizStudiedWords = []; // Track words studied this session
let quizAllWords = []; // All available words for current filter

async function loadQuizQuestion() {
    const filter = document.getElementById('level-select').value;

    // Load words based on filter
    if (filter === 'difficult') {
        // Load difficult words
        if (difficultWords.length === 0) {
            document.getElementById('quiz-card').innerHTML = `
                <div class="no-reviews">
                    <i class="fas fa-bookmark"></i>
                    <p>No difficult words marked yet.</p>
                    <p style="font-size: 0.875rem; margin-top: 8px;">Mark words as difficult in Flashcards to practice them here.</p>
                </div>
            `;
            return;
        }
        quizAllWords = [];
        for (const wordId of difficultWords) {
            const doc = await db.collection('words').doc(wordId).get();
            if (doc.exists) {
                quizAllWords.push({ id: doc.id, ...doc.data() });
            }
        }
    } else {
        const level = parseInt(filter);
        const wordsSnapshot = await db.collection('words')
            .where('level', '==', level)
            .get();

        quizAllWords = [];
        wordsSnapshot.forEach(doc => {
            const data = doc.data();
            // Include all words, even without examples
            quizAllWords.push({ id: doc.id, ...data });
        });
    }

    // Filter out already studied words this session
    let availableWords = quizAllWords.filter(w => !quizStudiedWords.includes(w.id));

    // If all words studied, offer to restart
    if (availableWords.length === 0 && quizAllWords.length > 0) {
        document.getElementById('quiz-card').innerHTML = `
            <div class="no-reviews">
                <i class="fas fa-trophy"></i>
                <p>You've studied all ${quizAllWords.length} words in this set!</p>
                <p style="font-size: 0.875rem; margin-top: 8px;">Great work on completing the full list.</p>
                <button class="btn primary" id="restart-quiz-btn" style="margin-top: 16px;">
                    <i class="fas fa-redo"></i> Start Over
                </button>
            </div>
        `;
        document.getElementById('restart-quiz-btn').addEventListener('click', () => {
            quizStudiedWords = [];
            loadQuizQuestion();
        });
        return;
    }

    if (quizAllWords.length < 4) {
        document.getElementById('quiz-card').innerHTML = `
            <div class="no-reviews">
                <i class="fas fa-info-circle"></i>
                <p>Not enough words available (need at least 4).</p>
                <p style="font-size: 0.875rem; margin-top: 8px;">Try a different level or mark more difficult words.</p>
            </div>
        `;
        return;
    }

    // Pick a random word as the correct answer
    currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    quizStudiedWords.push(currentWord.id);

    // Get distractors (same or higher level, non-synonyms)
    const distractorSnapshot = await db.collection('words')
        .where('level', '>=', level)
        .limit(50)
        .get();

    const potentialDistractors = [];
    distractorSnapshot.forEach(doc => {
        if (doc.id !== currentWord.id) {
            potentialDistractors.push({ id: doc.id, ...doc.data() });
        }
    });

    // Shuffle and pick 3 distractors
    const shuffled = potentialDistractors.sort(() => Math.random() - 0.5);
    const distractors = shuffled.slice(0, 3);

    // Create options array and shuffle
    currentOptions = [currentWord, ...distractors].sort(() => Math.random() - 0.5);

    displayQuizQuestion();
}

function displayQuizQuestion() {
    const filter = document.getElementById('level-select').value;
    const remaining = quizAllWords.length - quizStudiedWords.length;

    // Create sentence with blank - generate fallback if no example
    let sentence;
    if (currentWord.example && currentWord.example.trim()) {
        sentence = currentWord.example;
    } else if (currentWord.definition) {
        // Generate a fill-in-the-blank from the definition
        sentence = `Someone who is ${currentWord.word.toLowerCase()} can be described as: ${currentWord.definition}`;
    } else {
        sentence = `The word "${currentWord.word}" fits in this blank: _______`;
    }

    const wordRegex = new RegExp(`\\b${currentWord.word}\\b`, 'gi');
    sentence = sentence.replace(wordRegex, '<span class="blank">_______</span>');

    // Update UI
    const levelLabel = filter === 'difficult' ? 'Difficult Words' : `Level ${filter}`;
    document.querySelector('.quiz-level').innerHTML = `<i class="fas fa-layer-group"></i> ${levelLabel} (${remaining} remaining)`;
    document.getElementById('quiz-sentence-text').innerHTML = sentence;

    // Generate options
    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = currentOptions.map((opt, i) => `
        <button class="quiz-option" data-index="${i}" data-word-id="${opt.id}">
            ${String.fromCharCode(65 + i)}. ${opt.word}
        </button>
    `).join('');

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
    } else {
        selectedBtn.classList.add('incorrect');
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

// Level selector change - reset studied words when changing level
document.getElementById('level-select')?.addEventListener('change', () => {
    quizStudiedWords = [];
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

    for (const [wordId, progress] of Object.entries(userProgress)) {
        if (progress.nextReview && progress.nextReview.toDate() <= now) {
            const wordDoc = await db.collection('words').doc(wordId).get();
            if (wordDoc.exists) {
                reviewQueue.push({ id: wordId, ...wordDoc.data(), progress });
            }
        }
    }

    document.getElementById('due-count').textContent = `${reviewQueue.length} words due for review`;

    const reviewCard = document.getElementById('review-card');
    if (reviewQueue.length === 0) {
        reviewCard.innerHTML = `
            <div class="no-reviews">
                <i class="fas fa-check-circle"></i>
                <p>All caught up! No words due for review.</p>
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
    reviewCard.innerHTML = `
        <div class="card-inner">
            <div class="review-card-front">
                <span class="word-level"><i class="fas fa-redo"></i> Review (${currentReviewIndex + 1}/${reviewQueue.length})</span>
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
        .orderBy('wordsMastered', 'desc')
        .limit(50)
        .get();

    const rows = document.getElementById('leaderboard-rows');
    rows.innerHTML = '';

    let rank = 1;
    snapshot.forEach(doc => {
        const user = doc.data();
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
                <span>${user.wordsMastered || 0}</span>
                <span>${accuracy}%</span>
            </div>
        `;
        rank++;
    });
}
