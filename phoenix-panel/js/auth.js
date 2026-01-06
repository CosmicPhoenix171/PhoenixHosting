/**
 * Phoenix Hosting - Authentication Module
 * 
 * Handles all authentication-related functionality including:
 * - Google Sign-In
 * - Sign Out
 * - Auth State Management
 * - User Profile Management
 */

import { 
    signInWithPopup, 
    signOut as firebaseSignOut,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { ref, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { auth, database, googleProvider, isConfigValid } from './firebase-config.js';

// =============================================================================
// Auth State
// =============================================================================

let currentUser = null;
const authStateCallbacks = [];

/**
 * Get the current authenticated user
 * @returns {Object|null} The current user or null if not authenticated
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if user is authenticated
 */
export function isAuthenticated() {
    return currentUser !== null;
}

/**
 * Register a callback for auth state changes
 * @param {Function} callback - Function to call when auth state changes
 */
export function onAuthChange(callback) {
    authStateCallbacks.push(callback);
    
    // Call immediately with current state
    if (currentUser !== undefined) {
        callback(currentUser);
    }
}

// =============================================================================
// Sign In / Sign Out
// =============================================================================

/**
 * Sign in with Google
 * @returns {Promise<Object>} The signed-in user
 * @throws {Error} If sign-in fails
 */
export async function signInWithGoogle() {
    if (!isConfigValid) {
        throw new Error('Firebase is not configured. Please check firebase-config.js');
    }
    
    if (!auth || !googleProvider) {
        throw new Error('Authentication not initialized');
    }
    
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        // Update user profile in database
        await updateUserProfile(user);
        
        console.log('✅ Signed in as:', user.email);
        return user;
    } catch (error) {
        console.error('❌ Sign-in error:', error);
        
        // Handle specific error codes
        switch (error.code) {
            case 'auth/popup-closed-by-user':
                throw new Error('Sign-in cancelled. Please try again.');
            case 'auth/popup-blocked':
                throw new Error('Popup blocked. Please allow popups for this site.');
            case 'auth/cancelled-popup-request':
                throw new Error('Only one sign-in popup can be open at a time.');
            case 'auth/network-request-failed':
                throw new Error('Network error. Please check your connection.');
            case 'auth/unauthorized-domain':
                throw new Error('This domain is not authorized. Please contact administrator.');
            default:
                throw new Error(`Sign-in failed: ${error.message}`);
        }
    }
}

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
export async function signOut() {
    if (!auth) {
        throw new Error('Authentication not initialized');
    }
    
    try {
        await firebaseSignOut(auth);
        console.log('✅ Signed out successfully');
    } catch (error) {
        console.error('❌ Sign-out error:', error);
        throw new Error(`Sign-out failed: ${error.message}`);
    }
}

// =============================================================================
// User Profile Management
// =============================================================================

/**
 * Update user profile in the database
 * @param {Object} user - The Firebase user object
 */
async function updateUserProfile(user) {
    if (!database) return;
    
    try {
        const userRef = ref(database, `users/${user.uid}`);
        await set(userRef, {
            email: user.email,
            displayName: user.displayName || 'Unknown User',
            photoURL: user.photoURL || null,
            lastLogin: serverTimestamp()
        });
    } catch (error) {
        // Non-critical error - log but don't throw
        console.warn('Could not update user profile:', error.message);
    }
}

/**
 * Format user object for display
 * @param {Object} user - The Firebase user object
 * @returns {Object} Formatted user object
 */
export function formatUser(user) {
    if (!user) return null;
    
    return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Unknown User',
        photoURL: user.photoURL || 'assets/default-avatar.svg',
        firstName: user.displayName ? user.displayName.split(' ')[0] : 'User'
    };
}

// =============================================================================
// Auth State Listener
// =============================================================================

/**
 * Initialize the auth state listener
 */
export function initAuthListener() {
    if (!auth) {
        console.warn('Auth not available, cannot initialize listener');
        // Notify callbacks with null user
        authStateCallbacks.forEach(cb => cb(null));
        return;
    }
    
    onAuthStateChanged(auth, (user) => {
        currentUser = user ? formatUser(user) : null;
        
        // Notify all registered callbacks
        authStateCallbacks.forEach(callback => {
            try {
                callback(currentUser);
            } catch (error) {
                console.error('Auth callback error:', error);
            }
        });
        
        if (user) {
            console.log('🔐 Auth state: Signed in as', user.email);
        } else {
            console.log('🔓 Auth state: Signed out');
        }
    });
}

// =============================================================================
// Exports
// =============================================================================

export default {
    getCurrentUser,
    isAuthenticated,
    onAuthChange,
    signInWithGoogle,
    signOut,
    formatUser,
    initAuthListener
};
