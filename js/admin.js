// Admin functionality
let allWords = [];
let allStudents = [];
let currentPage = 0;
let wordsPerPage = 200;
let totalWordsCount = 0;
let lastDoc = null;
let duplicateWords = [];

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
    await loadAllWords();
    setupWordSearch();
    setupModal();
    await checkDuplicates();
}

// Load ALL words for admin (with pagination display)
async function loadAllWords() {
    const snapshot = await db.collection('words').orderBy('word').get();

    allWords = [];
    snapshot.forEach(doc => {
        allWords.push({ id: doc.id, ...doc.data() });
    });

    totalWordsCount = allWords.length;
    currentPage = 0;
    renderWordsTable();
}

// Check for duplicate words
async function checkDuplicates() {
    const wordMap = {};
    duplicateWords = [];

    allWords.forEach(w => {
        const key = w.word.toLowerCase().trim();
        if (wordMap[key]) {
            wordMap[key].push(w);
        } else {
            wordMap[key] = [w];
        }
    });

    for (const [word, items] of Object.entries(wordMap)) {
        if (items.length > 1) {
            duplicateWords.push({ word, items });
        }
    }

    if (duplicateWords.length > 0) {
        showDuplicateWarning();
    }
}

function showDuplicateWarning() {
    const container = document.getElementById('words-table');
    const warning = document.createElement('div');
    warning.className = 'duplicate-warning';
    warning.style.cssText = 'background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 8px; margin-bottom: 16px; color: #92400e;';
    warning.innerHTML = `
        <strong><i class="fas fa-exclamation-triangle"></i> ${duplicateWords.length} duplicate word(s) found!</strong>
        <button class="btn small" onclick="showDuplicates()" style="margin-left: 10px;">View Duplicates</button>
    `;
    container.parentNode.insertBefore(warning, container);
}

function showDuplicates() {
    let html = '<h3>Duplicate Words</h3><p>These words appear multiple times:</p><ul>';
    duplicateWords.forEach(d => {
        html += `<li><strong>${d.word}</strong> (${d.items.length} times) - IDs: ${d.items.map(i => i.id.substring(0,8)).join(', ')}</li>`;
    });
    html += '</ul>';
    alert(html.replace(/<[^>]*>/g, '\n'));
}

// Filter and search words
function filterWords(searchTerm = '', filterLevel = '') {
    let filtered = [...allWords];

    if (filterLevel) {
        filtered = filtered.filter(w => w.level === parseInt(filterLevel));
    }

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(w =>
            w.word.toLowerCase().includes(term) ||
            (w.definition && w.definition.toLowerCase().includes(term))
        );
    }

    return filtered;
}

// Render words table with pagination
function renderWordsTable() {
    const searchTerm = document.getElementById('word-search')?.value || '';
    const filterLevel = document.getElementById('filter-level')?.value || '';
    const filtered = filterWords(searchTerm, filterLevel);

    const table = document.getElementById('words-table');
    const startIdx = currentPage * wordsPerPage;
    const endIdx = Math.min(startIdx + wordsPerPage, filtered.length);
    const pageWords = filtered.slice(startIdx, endIdx);
    const totalPages = Math.ceil(filtered.length / wordsPerPage);

    table.innerHTML = `
        <div class="table-info" style="display: flex; justify-content: space-between; padding: 10px 0; color: var(--gray-500);">
            <span>Showing ${startIdx + 1}-${endIdx} of ${filtered.length} words (${totalWordsCount} total)</span>
            <div class="pagination">
                <button class="btn small" onclick="prevPage()" ${currentPage === 0 ? 'disabled' : ''}>Prev</button>
                <span style="margin: 0 10px;">Page ${currentPage + 1} of ${totalPages || 1}</span>
                <button class="btn small" onclick="nextPage()" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
            </div>
        </div>
        <div class="table-header" style="grid-template-columns: 1fr 60px 80px 2fr 140px;">
            <span>Word</span>
            <span>POS</span>
            <span>Level</span>
            <span>Definition</span>
            <span>Actions</span>
        </div>
    `;

    if (pageWords.length === 0) {
        table.innerHTML += '<div class="table-row"><span>No words found</span></div>';
        return;
    }

    pageWords.forEach(word => {
        const isDuplicate = duplicateWords.some(d => d.items.some(i => i.id === word.id));
        const row = document.createElement('div');
        row.className = 'table-row' + (isDuplicate ? ' duplicate' : '');
        row.style.gridTemplateColumns = '1fr 60px 80px 2fr 140px';
        if (isDuplicate) row.style.background = '#fef3c7';
        row.innerHTML = `
            <span><strong>${word.word}</strong>${isDuplicate ? ' <i class="fas fa-exclamation-triangle" style="color:#f59e0b" title="Duplicate"></i>' : ''}</span>
            <span style="font-size: 0.75rem; color: var(--gray-500);">${word.partOfSpeech || '-'}</span>
            <span>Level ${word.level || '?'}</span>
            <span style="font-size: 0.875rem;">${(word.definition || 'No definition').substring(0, 80)}${word.definition?.length > 80 ? '...' : ''}</span>
            <span>
                <button class="btn small edit-word" data-id="${word.id}" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn small delete-word" data-id="${word.id}" data-word="${word.word}" title="Delete" style="background:#ef4444;"><i class="fas fa-trash"></i></button>
            </span>
        `;
        table.appendChild(row);
    });

    // Add edit listeners
    document.querySelectorAll('.edit-word').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    // Add delete listeners
    document.querySelectorAll('.delete-word').forEach(btn => {
        btn.addEventListener('click', () => deleteWord(btn.dataset.id, btn.dataset.word));
    });
}

function prevPage() {
    if (currentPage > 0) {
        currentPage--;
        renderWordsTable();
    }
}

function nextPage() {
    const searchTerm = document.getElementById('word-search')?.value || '';
    const filterLevel = document.getElementById('filter-level')?.value || '';
    const filtered = filterWords(searchTerm, filterLevel);
    const totalPages = Math.ceil(filtered.length / wordsPerPage);

    if (currentPage < totalPages - 1) {
        currentPage++;
        renderWordsTable();
    }
}

async function deleteWord(wordId, wordText) {
    if (!confirm(`Are you sure you want to delete "${wordText}"?`)) {
        return;
    }

    try {
        await db.collection('words').doc(wordId).delete();
        allWords = allWords.filter(w => w.id !== wordId);
        totalWordsCount--;
        await checkDuplicates();
        renderWordsTable();
    } catch (error) {
        alert('Error deleting word: ' + error.message);
    }
}

// Search and filter
function setupWordSearch() {
    const searchInput = document.getElementById('word-search');
    const filterSelect = document.getElementById('filter-level');

    let debounceTimer;
    searchInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentPage = 0;
            renderWordsTable();
        }, 300);
    });

    filterSelect?.addEventListener('change', () => {
        currentPage = 0;
        renderWordsTable();
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
        loadAllWords();
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
        <div class="table-header" style="grid-template-columns: 1.5fr 1fr 80px 80px 100px 120px;">
            <span>Name (Email)</span>
            <span>Display Name</span>
            <span>Correct</span>
            <span>Total</span>
            <span>Accuracy</span>
            <span>Last Active</span>
        </div>
    `;

    if (allStudents.length === 0) {
        table.innerHTML += '<div class="table-row"><span>No students yet</span></div>';
        return;
    }

    // Sort by total correct answers
    allStudents.sort((a, b) => (b.totalCorrect || 0) - (a.totalCorrect || 0));

    allStudents.forEach(student => {
        const accuracy = student.totalAttempts > 0
            ? Math.round((student.totalCorrect / student.totalAttempts) * 100)
            : 0;

        let lastActive = '-';
        if (student.lastStudyDate) {
            const date = student.lastStudyDate.toDate ? student.lastStudyDate.toDate() : new Date(student.lastStudyDate);
            lastActive = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        const row = document.createElement('div');
        row.className = 'table-row';
        row.style.gridTemplateColumns = '1.5fr 1fr 80px 80px 100px 120px';
        row.innerHTML = `
            <span title="${student.email || ''}">${student.realName || student.email || '-'}</span>
            <span>${student.displayName || '-'}</span>
            <span><strong>${student.totalCorrect || 0}</strong></span>
            <span>${student.totalAttempts || 0}</span>
            <span>${accuracy}%</span>
            <span style="font-size: 0.75rem;">${lastActive}</span>
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
