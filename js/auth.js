// Auth state
let currentUser = null;
let userProfile = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const adminScreen = document.getElementById('admin-screen');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const authError = document.getElementById('auth-error');

// Auth event listeners
document.getElementById('show-signup').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showAuthError('Please fill in all fields');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        showAuthError(error.message);
    }
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const satScore = document.getElementById('signup-sat').value;

    if (!email || !password) {
        showAuthError('Please fill in email and password');
        return;
    }

    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);

        // Create user profile
        await db.collection('users').doc(userCredential.user.uid).set({
            email: email,
            displayName: generateDisplayName(),
            satScore: satScore ? parseInt(satScore) : null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            wordsLearned: 0,
            wordsMastered: 0,
            totalCorrect: 0,
            totalAttempts: 0,
            currentStreak: 0,
            lastStudyDate: null,
            isAdmin: ADMIN_EMAILS.includes(email)
        });
    } catch (error) {
        showAuthError(error.message);
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
});

document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
    auth.signOut();
});

// Auth state observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;

        // Get user profile
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();

            // Update last study date for streak
            await updateStreak();

            // Show appropriate screen
            if (userProfile.isAdmin || ADMIN_EMAILS.includes(user.email)) {
                showAdminScreen();
            } else {
                showDashboard();
            }
        } else {
            // Create profile if doesn't exist (for existing users)
            userProfile = {
                email: user.email,
                displayName: generateDisplayName(),
                satScore: null,
                wordsLearned: 0,
                wordsMastered: 0,
                totalCorrect: 0,
                totalAttempts: 0,
                currentStreak: 0,
                lastStudyDate: null,
                isAdmin: ADMIN_EMAILS.includes(user.email)
            };
            await db.collection('users').doc(user.uid).set(userProfile);
            showDashboard();
        }
    } else {
        currentUser = null;
        userProfile = null;
        showAuthScreen();
    }
});

async function updateStreak() {
    const today = new Date().toDateString();
    const lastStudy = userProfile.lastStudyDate?.toDate?.()?.toDateString?.() || null;

    if (lastStudy !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        let newStreak = 1;
        if (lastStudy === yesterday.toDateString()) {
            newStreak = (userProfile.currentStreak || 0) + 1;
        }

        await db.collection('users').doc(currentUser.uid).update({
            currentStreak: newStreak,
            lastStudyDate: firebase.firestore.FieldValue.serverTimestamp()
        });

        userProfile.currentStreak = newStreak;
    }
}

function showAuthScreen() {
    authScreen.classList.add('active');
    dashboardScreen.classList.add('hidden');
    dashboardScreen.classList.remove('active');
    adminScreen.classList.add('hidden');
    adminScreen.classList.remove('active');
}

function showDashboard() {
    authScreen.classList.remove('active');
    dashboardScreen.classList.remove('hidden');
    dashboardScreen.classList.add('active');
    adminScreen.classList.add('hidden');
    adminScreen.classList.remove('active');

    // Scroll to top
    window.scrollTo(0, 0);

    document.getElementById('display-name').textContent = userProfile.displayName;

    // Show admin switch button if user is admin
    const adminBtn = document.getElementById('switch-to-admin-btn');
    if (userProfile.isAdmin || ADMIN_EMAILS.includes(currentUser.email)) {
        adminBtn.classList.remove('hidden');
    } else {
        adminBtn.classList.add('hidden');
    }

    // Initialize app
    initApp();
}

function showAdminScreen() {
    authScreen.classList.remove('active');
    dashboardScreen.classList.add('hidden');
    dashboardScreen.classList.remove('active');
    adminScreen.classList.remove('hidden');
    adminScreen.classList.add('active');

    // Scroll to top
    window.scrollTo(0, 0);

    // Initialize admin
    initAdmin();
}

// Toggle between admin and student view
function toggleAdminStudentView() {
    if (adminScreen.classList.contains('active')) {
        // Switch to student view
        adminScreen.classList.add('hidden');
        adminScreen.classList.remove('active');
        dashboardScreen.classList.remove('hidden');
        dashboardScreen.classList.add('active');
        document.getElementById('display-name').textContent = userProfile.displayName;
        window.scrollTo(0, 0);
        initApp();
    } else {
        // Switch to admin view
        dashboardScreen.classList.add('hidden');
        dashboardScreen.classList.remove('active');
        adminScreen.classList.remove('hidden');
        adminScreen.classList.add('active');
        window.scrollTo(0, 0);
        initAdmin();
    }
}

// Make it globally available
window.toggleAdminStudentView = toggleAdminStudentView;

function showAuthError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
    setTimeout(() => {
        authError.classList.add('hidden');
    }, 5000);
}
