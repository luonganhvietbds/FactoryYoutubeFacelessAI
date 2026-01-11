"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { currentUser, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!currentUser) {
                // Not logged in - redirect to login
                router.push('/login');
            } else if (!currentUser.emailVerified) {
                // Logged in but email not verified - redirect to verify-email
                router.push('/verify-email');
            }
        }
    }, [currentUser, loading, router]);

    // Show loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-white/70">Loading...</p>
                </div>
            </div>
        );
    }

    // Don't render children if not authenticated or not verified
    if (!currentUser || !currentUser.emailVerified) {
        return null;
    }

    return <>{children}</>;
}
