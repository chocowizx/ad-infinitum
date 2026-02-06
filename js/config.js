// Firebase Configuration
// IMPORTANT: Replace these values with your own Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCilWbme84ANKVKc2clsO5Zl1zzd9f0OEw",
    authDomain: "ad-infinitum-2eac8.firebaseapp.com",
    projectId: "ad-infinitum-2eac8",
    storageBucket: "ad-infinitum-2eac8.firebasestorage.app",
    messagingSenderId: "1033641733165",
    appId: "1:1033641733165:web:f6b7518efaeebfa8085ca4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Admin email(s) - add your email to access admin dashboard
const ADMIN_EMAILS = ['chocowizx@gmail.com'];

// Display name generator
const adjectives = ['Swift', 'Bright', 'Bold', 'Clever', 'Eager', 'Fierce', 'Gentle', 'Happy', 'Keen', 'Lucky', 'Noble', 'Proud', 'Quick', 'Sharp', 'Wise', 'Brave', 'Calm', 'Daring', 'Elite', 'Grand'];
const animals = ['Tiger', 'Eagle', 'Wolf', 'Bear', 'Hawk', 'Lion', 'Fox', 'Owl', 'Deer', 'Lynx', 'Falcon', 'Raven', 'Phoenix', 'Dragon', 'Panda', 'Shark', 'Dolphin', 'Panther', 'Jaguar', 'Cobra'];

function generateDisplayName() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const num = Math.floor(Math.random() * 9000) + 1000;
    return `${adj}${animal}_${num}`;
}
