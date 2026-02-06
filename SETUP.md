# Ad Infinitum - Setup Guide

## Step 1: Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Name it "ad-infinitum" (or any name)
4. Disable Google Analytics (optional, not needed)
5. Click **Create project**

## Step 2: Enable Authentication

1. In Firebase console, click **Authentication** (left sidebar)
2. Click **Get started**
3. Click **Email/Password**
4. Enable **Email/Password** (first toggle)
5. Click **Save**

## Step 3: Create Firestore Database

1. Click **Firestore Database** (left sidebar)
2. Click **Create database**
3. Select **Start in test mode** (we'll add security rules later)
4. Choose a location close to you (e.g., asia-northeast3 for Korea)
5. Click **Enable**

## Step 4: Get Firebase Config

1. Click the gear icon (Project settings) next to "Project Overview"
2. Scroll down to "Your apps"
3. Click the web icon **</>**
4. Register app name: "ad-infinitum-web"
5. Copy the `firebaseConfig` object

## Step 5: Update Config

Open `js/config.js` and replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
    apiKey: "AIza...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};
```

Also update `ADMIN_EMAILS` with your email to access the admin dashboard:

```javascript
const ADMIN_EMAILS = ['your-email@example.com'];
```

## Step 6: Process Vocabulary

Run the vocabulary processor to generate definitions:

```bash
cd C:\Users\jh7sh\ad-infinitum
py process_vocab.py
```

This will create `data/words_processed.json` with definitions.

## Step 7: Import Words to Firebase

1. Open the app in a browser (just open index.html)
2. Sign up with your admin email
3. Open browser console (F12 > Console)
4. Run:

```javascript
// Load words from file (copy-paste the JSON content)
const words = [/* paste content of data/words_processed.json here */];
await importWords(words);
```

Or use the Python import script (see import_to_firebase.py).

## Step 8: Deploy (Optional)

### GitHub Pages (Free)
1. Create a GitHub repository
2. Push all files to the repo
3. Go to Settings > Pages
4. Select "main" branch and save
5. Your app will be live at `https://yourusername.github.io/ad-infinitum`

### Firestore Security Rules (Important for production)

Go to Firestore > Rules and add:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /wordProgress/{wordId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    // Anyone authenticated can read words
    match /words/{wordId} {
      allow read: if request.auth != null;
      // Only admins can write (check in app logic)
      allow write: if request.auth != null;
    }

    // Leaderboard - users can read all, write own
    match /users/{userId} {
      allow read: if request.auth != null;
    }
  }
}
```

## Done!

Your vocabulary learning app is ready. Students can:
- Create accounts
- Learn words with spaced repetition
- Track their progress
- See their ranking on the leaderboard

You (admin) can:
- Add/edit vocabulary
- View all students' progress
- See overall statistics
