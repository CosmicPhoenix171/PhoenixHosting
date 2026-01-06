/**
 * Phoenix Hosting - Firebase Configuration
 * 
 * This file contains the Firebase configuration for the Phoenix Panel.
 * Replace the placeholder values with your actual Firebase project settings.
 * 
 * IMPORTANT: These values are client-side and safe to expose.
 * Security is enforced through Firebase Security Rules on the server side.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// =============================================================================
// FIREBASE CONFIGURATION - REPLACE WITH YOUR VALUES
// =============================================================================
// Get these values from Firebase Console:
// 1. Go to https://console.firebase.google.com
// 2. Select your project
// 3. Click the gear icon → Project settings
// 4. Scroll down to "Your apps" → Web app
// 5. Copy the config values below
// =============================================================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// =============================================================================
// Validate Configuration
// =============================================================================

function validateConfig() {
    const requiredFields = ['apiKey', 'authDomain', 'databaseURL', 'projectId'];
    const missingFields = [];
    
    for (const field of requiredFields) {
        if (!firebaseConfig[field] || firebaseConfig[field].includes('YOUR_')) {
            missingFields.push(field);
        }
    }
    
    if (missingFields.length > 0) {
        console.error('⚠️ Firebase Configuration Error');
        console.error('The following fields need to be configured in firebase-config.js:');
        console.error(missingFields.join(', '));
        console.error('\nPlease update the configuration with your Firebase project settings.');
        console.error('See docs/SETUP.md for instructions.');
        return false;
    }
    
    return true;
}

// =============================================================================
// Initialize Firebase
// =============================================================================

let app = null;
let auth = null;
let database = null;
let googleProvider = null;

const isConfigValid = validateConfig();

if (isConfigValid) {
    try {
        // Initialize Firebase App
        app = initializeApp(firebaseConfig);
        
        // Initialize Firebase Auth
        auth = getAuth(app);
        
        // Initialize Google Auth Provider
        googleProvider = new GoogleAuthProvider();
        googleProvider.addScope('profile');
        googleProvider.addScope('email');
        
        // Initialize Realtime Database
        database = getDatabase(app);
        
        console.log('✅ Firebase initialized successfully');
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
    }
} else {
    console.warn('⚠️ Firebase not initialized due to configuration errors');
}

// =============================================================================
// Exports
// =============================================================================

export { app, auth, database, googleProvider, isConfigValid, firebaseConfig };
