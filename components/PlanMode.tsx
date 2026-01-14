'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getPromptContentById } from '@/lib/prompt-utils';
import { PlanSession, PlanProgress, PlanConfig, SystemPromptData } from '@/lib/types';
import { createPlanService } from '@/services/planService';
import PlanProgressDisplay from './PlanProgress';
import PlanResults from './PlanResults';

interface PlanModeProps {
    promptsLibrary: SystemPromptData[];
    selectedPromptIds: Record<number, string>;
    selectedPackId: string | null;
}

const PlanMode: React.FC<PlanModeProps> = ({
    promptsLibrary,
    selectedPromptIds,
    selectedPackId
}) => {
    const { userData, addToast } = useAuth();
    const [keywords, setKeywords] = useState('');
    const [config, setConfig] = useState<PlanConfig>({
        targetWords: 20,
        tolerance: 3,
        delayBetweenKeywords: 2000
    });
    const [progress, setProgress] = useState<PlanProgress | null>(null);
    const [session, setSession] = useState<PlanSession | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const planServiceRef = useRef<ReturnType<typeof createPlanService> | null>(null);

    const hasPermission = userData?.permissions?.multiIdeaEnabled === true;
    const keywordList = keywords.split('\n').filter(k => k.trim());
    const validKeywordCount = keywordList.length;

    // Filter prompts by selected pack
    const promptsForStep1 = useMemo(() => {
        if (!selectedPackId) return promptsLibrary.filter(p => p.stepId === 1);
        return promptsLibrary.filter(p => p.stepId === 1 && p.packId === selectedPackId);
    }, [promptsLibrary, selectedPackId]);

    // Get selected prompt ID for step 1
    const selectedPromptId = selectedPromptIds[1] || '';

    const handleGenerate = useCallback(async () => {
        if (!userData) {
            addToast('error', 'Vui lòng đăng nhập');
            return;
        }

        if (!hasPermission) {
            addToast('error', 'Bạn không có quyền sử dụng Multi-Idea Plan Mode');
            return;
        }

        if (!selectedPackId) {
            addToast('error', 'Vui lòng chọn và kích hoạt Pack để sử dụng Plan Mode');
            return;
        }

        if (!keywords.trim()) {
            addToast('error', 'Vui lòng nhập ít nhất 1 từ khóa');
            return;
        }

        if (validKeywordCount > 100) {
            addToast('error', 'Tối đa 100 từ khóa');
            return;
        }

        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            addToast('error', 'Vui lòng nhập API Key');
            return;
        }

        // Get prompt from selected pack
        const promptContent = getPromptContentById(selectedPromptId, promptsForStep1);
        if (!promptContent) {
            addToast('error', 'Không tìm thấy prompt cho Step 1 trong Pack đã chọn');
            return;
        }

        setIsRunning(true);
        setProgress(null);
        setSession(null);

        const service = createPlanService(apiKey, promptContent, config);
        planServiceRef.current = service;

        try {
            const result = await service.generateIdeas(
                keywordList,
                (prog: PlanProgress) => {
                    setProgress(prog);
                }
            );

            setSession(result);
            addToast('success', `Hoàn thành! ${result.completedCount}/${result.totalKeywords} ideas`);
        } catch (error: any) {
            console.error('Plan generation failed:', error);
            addToast('error', `Lỗi: ${error.message}`);
        } finally {
            setIsRunning(false);
        }
    }, [keywords, config, userData, hasPermission, selectedPackId, selectedPromptId, promptsForStep1, addToast]);

    const handleCancel = useCallback(() => {
        if (planServiceRef.current) {
            planServiceRef.current.cancel();
            addToast('info', 'Đã hủy quá trình');
        }
        setIsRunning(false);
    }, [addToast]);

    const handleExport = useCallback(() => {
        if (session && planServiceRef.current) {
            planServiceRef.current.downloadAsFile(session);
            addToast('success', 'Đã tải file text');
        }
    }, [session, addToast]);

    const handleReset = useCallback(() => {
        setKeywords('');
        setProgress(null);
        setSession(null);
        setIsRunning(false);
    }, []);

    if (!hasPermission) {
        return (
            <div className="p-6 bg-slate-900 rounded-xl border border-slate-800">
                <div className="text-center py-12">
                    <div className="text-4xl mb-4">🔒</div>
                    <h3 className="text-xl font-bold text-slate-300 mb-2">
                        Không có quyền truy cập
                    </h3>
                    <p className="text-slate-500">
                        Bạn cần được cấp quyền Multi-Idea Plan Mode để sử dụng tính năng này.
                    </p>
                    <p className="text-slate-600 text-sm mt-4">
                        Liên hệ admin để được cấp quyền.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Pack Info */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">💡 Multi-Idea Plan Mode</h2>
                    <p className="text-slate-400 text-sm">
                        Tạo hàng loạt ý tưởng kịch bản từ danh sách từ khóa
                    </p>
                </div>
                {selectedPackId ? (
                    <div className="flex items-center gap-2 bg-purple-900/30 px-3 py-1.5 rounded-lg border border-purple-500/30">
                        <span className="text-purple-400 text-sm">📦</span>
                        <span className="text-purple-300 text-sm font-medium">Pack đã chọn</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 bg-red-900/30 px-3 py-1.5 rounded-lg border border-red-500/30">
                        <span className="text-red-400 text-sm">⚠️</span>
                        <span className="text-red-300 text-sm">Chưa chọn Pack</span>
                    </div>
                )}
            </div>

            {/* Prompt Selection for Step 1 */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-300">
                        🤖 AI Persona (Step 1)
                    </label>
                    {!selectedPackId && (
                        <span className="text-xs text-amber-400">Cần chọn Pack để sử dụng</span>
                    )}
                </div>
                <select
                    value={selectedPromptId}
                    onChange={(e) => {
                        // Update selected prompt - parent will handle state update via selectedPromptIds
                        const newSelected = { ...selectedPromptIds, [1]: e.target.value };
                        // Trigger custom event for parent to update
                        window.dispatchEvent(new CustomEvent('planModePromptChange', { detail: { stepId: 1, promptId: e.target.value } }));
                    }}
                    disabled={!selectedPackId || isRunning}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {promptsForStep1.length === 0 ? (
                        <option value="">Không có prompt cho Step 1 trong Pack này</option>
                    ) : (
                        promptsForStep1.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))
                    )}
                </select>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Input */}
                <div className="space-y-4">
                    {/* Keywords Input */}
                    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Nhập Keywords (mỗi dòng 1 từ khóa)
                        </label>
                        <textarea
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            disabled={isRunning}
                            placeholder={`Tên phim 1\nTên phim 2\nTên phim 3\n...`}
                            className="w-full h-64 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:border-purple-500 outline-none resize-none disabled:opacity-50"
                        />
                        <div className="flex justify-between items-center mt-2">
                            <span className={`text-sm ${validKeywordCount > 100 ? 'text-red-400' : 'text-slate-500'}`}>
                                📊 {validKeywordCount}/100 keywords
                            </span>
                            {validKeywordCount > 0 && (
                                <button
                                    onClick={() => setKeywords('')}
                                    className="text-xs text-slate-400 hover:text-white"
                                    disabled={isRunning}
                                >
                                    Xóa tất cả
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Config */}
                    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                        <h3 className="text-sm font-medium text-slate-300 mb-3">⚙️ Cấu hình</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Target Words</label>
                                <input
                                    type="number"
                                    value={config.targetWords}
                                    onChange={(e) => setConfig({ ...config, targetWords: parseInt(e.target.value) || 20 })}
                                    disabled={isRunning}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-center disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Tolerance</label>
                                <input
                                    type="number"
                                    value={config.tolerance}
                                    onChange={(e) => setConfig({ ...config, tolerance: parseInt(e.target.value) || 3 })}
                                    disabled={isRunning}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-center disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Delay (ms)</label>
                                <input
                                    type="number"
                                    value={config.delayBetweenKeywords}
                                    onChange={(e) => setConfig({ ...config, delayBetweenKeywords: parseInt(e.target.value) || 2000 })}
                                    disabled={isRunning}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-center disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        {!isRunning ? (
                            <button
                                onClick={handleGenerate}
                                disabled={validKeywordCount === 0 || validKeywordCount > 100}
                                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
                            >
                                🚀 Generate Ideas
                            </button>
                        ) : (
                            <button
                                onClick={handleCancel}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                            >
                                ⏹️ Hủy
                            </button>
                        )}
                        {session && !isRunning && (
                            <>
                                <button
                                    onClick={handleExport}
                                    className="flex-1 bg-green-600 hover:bg-green-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                                >
                                    💾 Export Text
                                </button>
                                <button
                                    onClick={handleReset}
                                    className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                                >
                                    🔄
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Progress & Results */}
                <div className="space-y-4">
                    {isRunning && progress && (
                        <PlanProgressDisplay progress={progress} />
                    )}

                    {session && !isRunning && (
                        <PlanResults session={session} />
                    )}

                    {!isRunning && !session && (
                        <div className="bg-slate-900 rounded-xl border border-slate-800 p-8">
                            <div className="text-center text-slate-500">
                                <div className="text-4xl mb-4">💡</div>
                                <p>Nhập keywords và nhấn Generate</p>
                                <p className="text-sm mt-2">Kết quả sẽ hiển thị ở đây</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlanMode;
