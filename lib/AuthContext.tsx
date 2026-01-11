"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    User,
    onAuthStateChanged,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    updateProfile
} from 'firebase/auth';
import { auth } from './firebase';

interface AuthContextType {
    currentUser: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<User>;
    register: (email: string, password: string, displayName: string) => Promise<User>;
    logout: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    resendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Login function
    async function login(email: string, password: string): Promise<User> {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    }

    // Register function
    async function register(email: string, password: string, displayName: string): Promise<User> {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update display name
        await updateProfile(user, { displayName });

        // Send verification email
        await sendEmailVerification(user);

        // Sign out immediately (don't auto-login)
        await signOut(auth);

        return user;
    }

    // Logout function
    async function logout(): Promise<void> {
        await signOut(auth);
    }

    // Reset password function
    async function resetPassword(email: string): Promise<void> {
        await sendPasswordResetEmail(auth, email);
    }

    // Resend verification email
    async function resendVerificationEmail(): Promise<void> {
        if (auth.currentUser) {
            await sendEmailVerification(auth.currentUser);
        }
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const value: AuthContextType = {
        currentUser,
        loading,
        login,
        register,
        logout,
        resetPassword,
        resendVerificationEmail
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
