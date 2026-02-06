// Admin functionality
let allWords = [];
let allStudents = [];

// Admin navigation
document.querySelectorAll('#admin-screen .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetScreen = link.dataset.screen;

        document.querySelectorAll('#admin-screen .nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        document.querySelectorAll('#admin-screen .section').forEach(s => {
            s.classList.remove('active');
            if (s.id === `${targetScreen}-section`) {
                s.classList.add('active');
            }
        });

        if (targetScreen === 'admin-students') loadStudents();
        if (targetScreen === 'admin-stats') loadAdminStats();
    });
});

// Initialize admin
async function initAdmin() {
    await loadWords();
    setupWordSearch();
    setupModal();
}

// Load all words
async function loadWords(searchTerm = '', filterLevel = '') {
    let query = db.collection('words').orderBy('word');

    if (filterLevel) {
        query = db.collection('words')
            .where('level', '==', parseInt(filterLevel))
            .orderBy('word');
    }

    const snapshot = await query.limit(100).get();

    allWords = [];
    snapshot.forEach(doc => {
        allWords.push({ id: doc.id, ...doc.data() });
    });

    // Filter by search term if provided
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        allWords = allWords.filter(w =>
            w.word.toLowerCase().includes(term) ||
            (w.definition && w.definition.toLowerCase().includes(term))
        );
    }

    renderWordsTable();
}

// Render words table
function renderWordsTable() {
    const table = document.getElementById('words-table');
    table.innerHTML = `
        <div class="table-header" style="grid-template-columns: 1fr 80px 2fr 100px;">
            <span>Word</span>
            <span>Level</span>
            <span>Definition</span>
            <span>Actions</span>
        </div>
    `;

    if (allWords.length === 0) {
        table.innerHTML += '<div class="table-row"><span>No words found</span></div>';
        return;
    }

    allWords.forEach(word => {
        const row = document.createElement('div');
        row.className = 'table-row';
        row.style.gridTemplateColumns = '1fr 80px 2fr 100px';
        row.innerHTML = `
            <span><strong>${word.word}</strong></span>
            <span>Level ${word.level || '?'}</span>
            <span>${(word.definition || 'No definition').substring(0, 100)}${word.definition?.length > 100 ? '...' : ''}</span>
            <span>
                <button class="btn small edit-word" data-id="${word.id}">Edit</button>
            </span>
        `;
        table.appendChild(row);
    });

    // Add edit listeners
    document.querySelectorAll('.edit-word').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
}

// Search and filter
function setupWordSearch() {
    const searchInput = document.getElementById('word-search');
    const filterSelect = document.getElementById('filter-level');

    let debounceTimer;
    searchInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadWords(searchInput.value, filterSelect.value);
        }, 300);
    });

    filterSelect?.addEventListener('change', () => {
        loadWords(searchInput.value, filterSelect.value);
    });
}

// Modal functionality
function setupModal() {
    const modal = document.getElementById('word-modal');
    const form = document.getElementById('word-form');

    document.getElementById('add-word-btn')?.addEventListener('click', () => {
        openAddModal();
    });

    document.getElementById('cancel-edit')?.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveWord();
    });

    // Close modal on outside click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

function openAddModal() {
    document.getElementById('modal-title').textContent = 'Add New Word';
    document.getElementById('word-id').value = '';
    document.getElementById('edit-word').value = '';
    document.getElementById('edit-pos').value = '';
    document.getElementById('edit-definition').value = '';
    document.getElementById('edit-tldr').value = '';
    document.getElementById('edit-korean').value = '';
    document.getElementById('edit-example').value = '';
    document.getElementById('edit-level').value = '1';
    document.getElementById('word-modal').classList.remove('hidden');
}

async function openEditModal(wordId) {
    const word = allWords.find(w => w.id === wordId);
    if (!word) return;

    document.getElementById('modal-title').textContent = 'Edit Word';
    document.getElementById('word-id').value = wordId;
    document.getElementById('edit-word').value = word.word || '';
    document.getElementById('edit-pos').value = word.partOfSpeech || '';
    document.getElementById('edit-definition').value = word.definition || '';
    document.getElementById('edit-tldr').value = word.tldr || '';
    document.getElementById('edit-korean').value = word.korean || '';
    document.getElementById('edit-example').value = word.example || '';
    document.getElementById('edit-level').value = word.level || 1;
    document.getElementById('word-modal').classList.remove('hidden');
}

async function saveWord() {
    const wordId = document.getElementById('word-id').value;
    const wordData = {
        word: document.getElementById('edit-word').value,
        partOfSpeech: document.getElementById('edit-pos').value,
        definition: document.getElementById('edit-definition').value,
        tldr: document.getElementById('edit-tldr').value,
        korean: document.getElementById('edit-korean').value,
        example: document.getElementById('edit-example').value,
        level: parseInt(document.getElementById('edit-level').value),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (wordId) {
            await db.collection('words').doc(wordId).update(wordData);
        } else {
            wordData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('words').add(wordData);
        }

        document.getElementById('word-modal').classList.add('hidden');
        loadWords();
    } catch (error) {
        alert('Error saving word: ' + error.message);
    }
}

// Load students
async function loadStudents() {
    const snapshot = await db.collection('users')
        .orderBy('wordsLearned', 'desc')
        .get();

    allStudents = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.isAdmin) {
            allStudents.push({ id: doc.id, ...data });
        }
    });

    renderStudentsTable();
}

function renderStudentsTable() {
    const table = document.getElementById('students-table');
    table.innerHTML = `
        <div class="table-header" style="grid-template-columns: 1fr 100px 100px 100px 100px;">
            <span>Display Name</span>
            <span>SAT Score</span>
            <span>Learned</span>
            <span>Mastered</span>
            <span>Accuracy</span>
        </div>
    `;

    if (allStudents.length === 0) {
        table.innerHTML += '<div class="table-row"><span>No students yet</span></div>';
        return;
    }

    allStudents.forEach(student => {
        const accuracy = student.totalAttempts > 0
            ? Math.round((student.totalCorrect / student.totalAttempts) * 100)
            : 0;

        const row = document.createElement('div');
        row.className = 'table-row';
        row.style.gridTemplateColumns = '1fr 100px 100px 100px 100px';
        row.innerHTML = `
            <span>${student.displayName}</span>
            <span>${student.satScore || '-'}</span>
            <span>${student.wordsLearned || 0}</span>
            <span>${student.wordsMastered || 0}</span>
            <span>${accuracy}%</span>
        `;
        table.appendChild(row);
    });
}

// Load admin stats
async function loadAdminStats() {
    // Total students
    const studentsSnapshot = await db.collection('users')
        .where('isAdmin', '==', false)
        .get();
    document.getElementById('total-students').textContent = studentsSnapshot.size;

    // Total words
    const wordsSnapshot = await db.collection('words').get();
    document.getElementById('total-words').textContent = wordsSnapshot.size;

    // Average words per student
    let totalLearned = 0;
    studentsSnapshot.forEach(doc => {
        totalLearned += doc.data().wordsLearned || 0;
    });
    const avg = studentsSnapshot.size > 0 ? Math.round(totalLearned / studentsSnapshot.size) : 0;
    document.getElementById('avg-words').textContent = avg;

    // Active today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let activeCount = 0;
    studentsSnapshot.forEach(doc => {
        const lastStudy = doc.data().lastStudyDate?.toDate();
        if (lastStudy && lastStudy >= today) {
            activeCount++;
        }
    });
    document.getElementById('active-today').textContent = activeCount;
}

// Bulk import words (utility function)
async function importWords(wordsArray) {
    const batch = db.batch();
    let count = 0;

    for (const word of wordsArray) {
        if (count >= 500) {
            await batch.commit();
            count = 0;
        }

        const docRef = db.collection('words').doc();
        batch.set(docRef, {
            word: word.word,
            definition: word.definition || '',
            tldr: word.tldr || '',
            korean: word.korean || '',
            partOfSpeech: word.partOfSpeech || '',
            example: word.example || '',
            level: word.level || 1,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        count++;
    }

    if (count > 0) {
        await batch.commit();
    }

    console.log('Import complete!');
}

// Export for console use
window.importWords = importWords;
