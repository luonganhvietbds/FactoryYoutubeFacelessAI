"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
    const { currentUser, userData, isAdmin, loading } = useAuth();
    const router = useRouter();
    const [redirectReason, setRedirectReason] = useState<string | null>(null);

    useEffect(() => {
        if (loading) return;

        if (!currentUser) {
            setRedirectReason('login');
            router.push('/login');
            return;
        }

        if (!currentUser.emailVerified) {
            setRedirectReason('verify');
            router.push('/verify-email');
            return;
        }

        if (requireAdmin && !isAdmin) {
            setRedirectReason('admin');
            router.push('/?error=unauthorized');
            return;
        }
    }, [currentUser, userData, loading, router, requireAdmin, isAdmin]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-white/70">Đang xác thực...</p>
                </div>
            </div>
        );
    }

    if (!currentUser || !currentUser.emailVerified) {
        return null;
    }

    if (requireAdmin && !isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.694-1.333-3.464 0.333-2L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Truy cập bị từ chối</h1>
                    <p className="text-white/60 mb-6">
                        Bạn không có quyền truy cập trang này. Vui lòng liên hệ quản trị viên để được cấp quyền.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg transition-all"
                    >
                        Quay về trang chủ
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
