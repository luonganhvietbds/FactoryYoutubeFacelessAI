"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getFirebaseErrorMessage } from './firebase-auth-helper';
import { UserData, DEFAULT_MEMBER_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS } from './types';

interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface AuthContextType {
    currentUser: User | null;
    userData: UserData | null;
    loading: boolean;
    isAdmin: boolean;
    login: (email: string, password: string) => Promise<User>;
    register: (email: string, password: string, displayName: string) => Promise<User>;
    logout: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    resendVerificationEmail: () => Promise<void>;
    updateUserEmail: (newEmail: string) => Promise<void>;
    refreshUserData: () => Promise<void>;
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
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // Computed property: is current user an admin?
    const isAdmin = userData?.role === 'admin';

    function addToast(type: 'success' | 'error' | 'info', message: string) {
        const id = generateToastId();
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => removeToast(id), 5000);
    }

    function removeToast(id: string) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    /**
     * Fetch or auto-create user document in Firestore
     */
    const fetchOrCreateUserData = useCallback(async (user: User): Promise<UserData | null> => {
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                // User document exists
                const data = userSnap.data() as UserData;
                console.log("User data loaded:", data.email, "Role:", data.role);
                return data;
            } else {
                // Auto-migrate: Create new user document for existing Firebase Auth user
                console.log("Auto-migrating user:", user.email);
                const newUserData: UserData = {
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.displayName || '',
                    role: 'member',
                    credits: 100,
                    permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
                    createdAt: new Date().toISOString(),
                };
                await setDoc(userRef, newUserData);
                console.log("✅ User document auto-created for:", user.email);
                return newUserData;
            }
        } catch (error) {
            console.error("❌ Error fetching/creating user data:", error);
            return null;
        }
    }, []);

    /**
     * Refresh user data from Firestore
     */
    const refreshUserData = useCallback(async () => {
        if (currentUser) {
            const data = await fetchOrCreateUserData(currentUser);
            setUserData(data);
        }
    }, [currentUser, fetchOrCreateUserData]);

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

            // Update profile with display name
            await updateProfile(user, { displayName });

            // Create user document in Firestore
            const userRef = doc(db, "users", user.uid);
            const newUserData: UserData = {
                uid: user.uid,
                email: email,
                displayName: displayName,
                role: 'member',
                credits: 100,
                permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
                createdAt: new Date().toISOString(),
            };
            await setDoc(userRef, newUserData);
            console.log("✅ User document created for new registration:", email);

            // Send email verification
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
        setUserData(null);
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
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);

            if (user) {
                // Fetch or auto-create user data from Firestore
                const data = await fetchOrCreateUserData(user);
                setUserData(data);
            } else {
                setUserData(null);
            }

            setLoading(false);
        });

        return unsubscribe;
    }, [fetchOrCreateUserData]);

    const value: AuthContextType = {
        currentUser,
        userData,
        loading,
        isAdmin,
        login,
        register,
        logout,
        resetPassword,
        resendVerificationEmail,
        updateUserEmail,
        refreshUserData,
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
                    className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in ${toast.type === 'success'
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
