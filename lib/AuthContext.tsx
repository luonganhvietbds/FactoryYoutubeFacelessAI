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
    updateProfile,
    verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { auth } from './firebase';
import { getFirebaseErrorMessage } from './firebase-auth-helper';

interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface AuthContextType {
    currentUser: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<User>;
    register: (email: string, password: string, displayName: string) => Promise<User>;
    logout: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    resendVerificationEmail: () => Promise<void>;
    updateUserEmail: (newEmail: string) => Promise<void>;
    addToast: (type: 'success' | 'error' | 'info', message: string) => void;
    toasts: ToastMessage[];
    removeToast: (id: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

function generateToastId(): string {
    return Math.random().toString(36).substring(2, 15);
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    function addToast(type: 'success' | 'error' | 'info', message: string) {
        const id = generateToastId();
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => removeToast(id), 5000);
    }

    function removeToast(id: string) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    async function login(email: string, password: string): Promise<User> {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return userCredential.user;
        } catch (error: unknown) {
            const err = error as { code?: string };
            throw new Error(getFirebaseErrorMessage(err.code || 'auth/unknown'));
        }
    }

    async function register(email: string, password: string, displayName: string): Promise<User> {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await updateProfile(user, { displayName });
            await sendEmailVerification(user);
            await signOut(auth);

            return user;
        } catch (error: unknown) {
            const err = error as { code?: string };
            throw new Error(getFirebaseErrorMessage(err.code || 'auth/unknown'));
        }
    }

    async function logout(): Promise<void> {
        await signOut(auth);
    }

    async function resetPassword(email: string): Promise<void> {
        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error: unknown) {
            const err = error as { code?: string };
            throw new Error(getFirebaseErrorMessage(err.code || 'auth/unknown'));
        }
    }

    async function resendVerificationEmail(): Promise<void> {
        if (!auth.currentUser) {
            throw new Error('No user is currently signed in');
        }
        try {
            await sendEmailVerification(auth.currentUser);
        } catch (error: unknown) {
            const err = error as { code?: string };
            throw new Error(getFirebaseErrorMessage(err.code || 'auth/unknown'));
        }
    }

    async function updateUserEmail(newEmail: string): Promise<void> {
        if (!auth.currentUser) {
            throw new Error('No user is currently signed in');
        }
        try {
            await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
        } catch (error: unknown) {
            const err = error as { code?: string };
            throw new Error(getFirebaseErrorMessage(err.code || 'auth/unknown'));
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
        resendVerificationEmail,
        updateUserEmail,
        addToast,
        toasts,
        removeToast,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </AuthContext.Provider>
    );
}

function ToastContainer({ toasts, onRemove }: { toasts: ToastMessage[]; onRemove: (id: string) => void }) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in ${
                        toast.type === 'success'
                            ? 'bg-green-600 text-white'
                            : toast.type === 'error'
                            ? 'bg-red-600 text-white'
                            : 'bg-blue-600 text-white'
                    }`}
                >
                    <span className="flex-1">{toast.message}</span>
                    <button
                        onClick={() => onRemove(toast.id)}
                        className="text-white/80 hover:text-white"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
