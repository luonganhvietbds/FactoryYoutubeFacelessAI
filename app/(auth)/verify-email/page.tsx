"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

export default function VerifyEmailPage() {
    const [email, setEmail] = useState<string>('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { currentUser, resendVerificationEmail } = useAuth();

    useEffect(() => {
        // Get email from current user or session storage
        if (currentUser?.email) {
            setEmail(currentUser.email);
        } else {
            const storedEmail = sessionStorage.getItem('pendingVerificationEmail');
            if (storedEmail) {
                setEmail(storedEmail);
            }
        }
    }, [currentUser]);

    async function handleResend() {
        try {
            setError('');
            setMessage('');
            setLoading(true);
            await resendVerificationEmail();
            setMessage('Verification email sent! Check your inbox.');
        } catch {
            setError('Failed to send verification email. Please try again later.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20">
            {/* Icon */}
            <div className="text-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Verify Your Email</h1>
            </div>

            {/* Message */}
            <div className="text-center mb-6">
                <p className="text-white/80 leading-relaxed">
                    We have sent you a verification email to{' '}
                    <span className="text-purple-400 font-semibold">{email || 'your email'}</span>.
                </p>
                <p className="text-white/60 mt-2">
                    Please verify it and then sign in.
                </p>
            </div>

            {/* Success Message */}
            {message && (
                <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-lg mb-6 text-sm text-center">
                    {message}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6 text-sm text-center">
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="space-y-4">
                <button
                    onClick={handleResend}
                    disabled={loading || !currentUser}
                    className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Sending...
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Resend Verification Email
                        </>
                    )}
                </button>

                <Link
                    href="/login"
                    className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Back to Sign In
                </Link>
            </div>

            {/* Info */}
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-200 text-sm text-center">
                    💡 Check your spam folder if you don&apos;t see the email
                </p>
            </div>
        </div>
    );
}
