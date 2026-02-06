// App state
let currentWord = null;
let sessionCount = 0;
let wordsQueue = [];
let userProgress = {};

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
        if (targetScreen === 'progress') loadProgress();
        if (targetScreen === 'leaderboard') loadLeaderboard();
        if (targetScreen === 'review') loadReviewWords();
    });
});

// Initialize app
async function initApp() {
    await loadUserProgress();
    await loadNextWord();
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

// Load next word to learn
async function loadNextWord() {
    const level = document.getElementById('level-select').value;

    // Get words user hasn't learned yet at this level
    const wordsSnapshot = await db.collection('words')
        .where('level', '==', parseInt(level))
        .limit(50)
        .get();

    const unlearnedWords = [];
    wordsSnapshot.forEach(doc => {
        if (!userProgress[doc.id]) {
            unlearnedWords.push({ id: doc.id, ...doc.data() });
        }
    });

    if (unlearnedWords.length === 0) {
        showNoWords();
        return;
    }

    // Pick random word
    currentWord = unlearnedWords[Math.floor(Math.random() * unlearnedWords.length)];
    displayWord(currentWord);
}

// Display word on card
function displayWord(word) {
    const cardFront = document.querySelector('.card-front');
    const cardBack = document.querySelector('.card-back');

    // Front
    cardFront.querySelector('.word-level').textContent = `Level ${word.level}`;
    cardFront.querySelector('.word').textContent = word.word;
    cardFront.querySelector('.part-of-speech').textContent = word.partOfSpeech || '';

    // Back
    cardBack.querySelector('.word').textContent = word.word;
    cardBack.querySelector('.part-of-speech').textContent = word.partOfSpeech || '';
    cardBack.querySelector('.definition').textContent = word.definition || 'No definition available';
    cardBack.querySelector('.definition-simple span').textContent = word.tldr || word.definition || '';
    cardBack.querySelector('.korean').textContent = word.korean || '';
    cardBack.querySelector('.example em').textContent = word.example || '';

    // Show front, hide back
    cardFront.classList.remove('hidden');
    cardBack.classList.add('hidden');
}

function showNoWords() {
    const card = document.getElementById('word-card');
    card.innerHTML = `
        <div class="no-reviews">
            <p>No more new words at this level!</p>
            <p>Try a different level or review your learned words.</p>
        </div>
    `;
}

// Show answer button
document.querySelector('.show-answer')?.addEventListener('click', () => {
    document.querySelector('.card-front').classList.add('hidden');
    document.querySelector('.card-back').classList.remove('hidden');
});

// Rating buttons
document.querySelectorAll('.btn.rating').forEach(btn => {
    btn.addEventListener('click', async () => {
        const rating = parseInt(btn.dataset.rating);
        await recordProgress(currentWord.id, rating);
        sessionCount++;
        updateSessionStats();
        await loadNextWord();
    });
});

// Record word progress
async function recordProgress(wordId, rating) {
    const now = new Date();
    const isCorrect = rating >= 3;

    // Calculate next review date based on spaced repetition
    let intervalIndex = 0;
    if (userProgress[wordId]) {
        intervalIndex = userProgress[wordId].intervalIndex || 0;
        if (isCorrect) {
            intervalIndex = Math.min(intervalIndex + 1, SR_INTERVALS.length - 1);
        } else {
            intervalIndex = 0; // Reset on wrong answer
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
        mastered: intervalIndex >= 4 // Mastered after 4 successful reviews
    };

    // Save to user's progress
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
    document.getElementById('streak-count').textContent = userProfile.currentStreak || 0;
}

// Level selector change
document.getElementById('level-select')?.addEventListener('change', () => {
    loadNextWord();
});

// Review words queue
let reviewQueue = [];
let currentReviewIndex = 0;

// Load review words (spaced repetition)
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
                <p style="font-size: 0.875rem; margin-top: 8px;">Keep learning new words to build your review queue.</p>
            </div>
        `;
    } else {
        currentReviewIndex = 0;
        displayReviewWord();
    }
}

// Display current review word
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

    // Attach event listeners
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

// Load progress stats
async function loadProgress() {
    // Refresh user profile
    const doc = await db.collection('users').doc(currentUser.uid).get();
    userProfile = doc.data();

    document.getElementById('words-learned').textContent = userProfile.wordsLearned || 0;
    document.getElementById('words-mastered').textContent = userProfile.wordsMastered || 0;

    const accuracy = userProfile.totalAttempts > 0
        ? Math.round((userProfile.totalCorrect / userProfile.totalAttempts) * 100)
        : 0;
    document.getElementById('accuracy').textContent = `${accuracy}%`;
    document.getElementById('current-streak').textContent = `${userProfile.currentStreak || 0} days`;

    // Load level progress
    await loadLevelProgress();
}

async function loadLevelProgress() {
    const levelBars = document.getElementById('level-bars');
    levelBars.innerHTML = '';

    for (let level = 1; level <= 5; level++) {
        // Count total words at this level
        const totalSnapshot = await db.collection('words')
            .where('level', '==', level)
            .get();
        const totalWords = totalSnapshot.size;

        // Count learned words at this level
        let learnedCount = 0;
        for (const [wordId, progress] of Object.entries(userProgress)) {
            const wordDoc = await db.collection('words').doc(wordId).get();
            if (wordDoc.exists && wordDoc.data().level === level) {
                learnedCount++;
            }
        }

        const percentage = totalWords > 0 ? Math.round((learnedCount / totalWords) * 100) : 0;

        const levelNames = ['', 'Basic', 'Elementary', 'Intermediate', 'Advanced', 'Expert'];
        levelBars.innerHTML += `
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
}

// Load leaderboard
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
