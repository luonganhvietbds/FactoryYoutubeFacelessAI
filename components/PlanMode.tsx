'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getPromptContentById } from '@/lib/prompt-utils';
import { PlanSession, PlanProgress, PlanConfig, SystemPromptData, ApiKeyInfo } from '@/lib/types';
import { apiKeyManager, KeyStatus } from '@/lib/apiKeyManager';
import { createPlanService, PlanService } from '@/services/planService';
import PlanProgressDisplay from './PlanProgress';
import PlanResults from './PlanResults';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

interface PlanModeProps {
    promptsLibrary: SystemPromptData[];
    selectedPromptIds: Record<number, string>;
    selectedPackId: string | null;
}

const DEFAULT_CONFIG: PlanConfig = {
    targetWords: 20,
    tolerance: 3,
    delayBetweenKeywords: 10000
};

const MAX_CONCURRENT_DEFAULT = 5;

const PlanMode: React.FC<PlanModeProps> = ({
    promptsLibrary,
    selectedPromptIds,
    selectedPackId
}) => {
    const { userData, addToast } = useAuth();
    const [keywords, setKeywords] = useState('');
    const [config, setConfig] = useState<PlanConfig>(DEFAULT_CONFIG);
    const [progress, setProgress] = useState<PlanProgress | null>(null);
    const [session, setSession] = useState<PlanSession | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [maxConcurrent, setMaxConcurrent] = useState(MAX_CONCURRENT_DEFAULT);
    const [exportFormat, setExportFormat] = useState<'single' | 'multiple'>('single');
    const planServiceRef = useRef<PlanService | null>(null);
    const [apiKeyStats, setApiKeyStats] = useState<{ total: number; active: number; dead: number; rateLimited: number }>({ total: 0, active: 0, dead: 0, rateLimited: 0 });

    const hasPermission = userData?.permissions?.multiIdeaEnabled === true;
    const keywordList = keywords.split('\n').filter(k => k.trim());
    const validKeywordCount = keywordList.length;

    // Filter prompts by selected pack
    const promptsForStep1 = useMemo(() => {
        if (!selectedPackId) return promptsLibrary.filter(p => p.stepId === 1);
        return promptsLibrary.filter(p => p.stepId === 1 && p.packId === selectedPackId);
    }, [promptsLibrary, selectedPackId]);

    const selectedPromptId = selectedPromptIds[1] || '';

    // Update API key stats
    useEffect(() => {
        const updateStats = () => {
            setApiKeyStats(apiKeyManager.getStats());
        };
        updateStats();
        const unsubscribe = apiKeyManager.subscribe(updateStats);
        return unsubscribe;
    }, []);

    const handleAddApiKeys = useCallback(() => {
        if (!apiKeyInput.trim()) {
            addToast('error', 'Vui lòng nhập ít nhất 1 API Key');
            return;
        }
        const added = apiKeyManager.addKeysFromInput(apiKeyInput);
        if (added > 0) {
            setApiKeyInput('');
            addToast('success', `Đã thêm ${added} API Key(s)`);
        } else {
            addToast('error', 'Không có API Key mới được thêm');
        }
    }, [apiKeyInput, addToast]);

    const handleClearApiKeys = useCallback(() => {
        apiKeyManager.clearKeys();
        addToast('info', 'Đã xóa tất cả API Keys');
    }, [addToast]);

    const handleCheckAllKeys = useCallback(async () => {
        addToast('info', 'Đang kiểm tra API Keys...');
        const results = await apiKeyManager.checkAllKeys();
        addToast('success', `Hoàn thành! Active: ${results.active}, Dead: ${results.dead}, Rate Limited: ${results.rateLimited}`);
    }, [addToast]);

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

        // Check for available API keys
        if (!apiKeyManager.hasAvailableKey()) {
            addToast('error', 'Cần ít nhất 1 API Key hoạt động');
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

        const service = createPlanService(promptContent, config);
        planServiceRef.current = service;

        try {
            const result = await service.generateIdeasConcurrent(
                keywordList,
                maxConcurrent,
                config.delayBetweenKeywords,
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
    }, [keywords, config, userData, hasPermission, selectedPackId, selectedPromptId, promptsForStep1, maxConcurrent, keywordList, addToast]);

    const handleCancel = useCallback(() => {
        if (planServiceRef.current) {
            planServiceRef.current.cancel();
            addToast('info', 'Đã hủy quá trình');
        }
        setIsRunning(false);
    }, [addToast]);

    const handleExportSingle = useCallback(() => {
        if (!session || !planServiceRef.current) return;
        const text = planServiceRef.current.exportToText(session);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, `plan-ideas-${new Date().toISOString().split('T')[0]}.txt`);
        addToast('success', 'Đã tải file text');
    }, [session, addToast]);

    const handleExportMultiple = useCallback(() => {
        if (!session || !planServiceRef.current) return;
        const zip = new JSZip();
        const completedIdeas = session.ideas.filter(i => i.status === 'completed');

        completedIdeas.forEach((idea, idx) => {
            const filename = `idea_${idx + 1}_${idea.keyword.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
            const content = `=== ${idea.keyword} ===\n\n📋 Topic/Outline:\n${idea.topic}\n`;
            zip.file(filename, content);
        });

        // Add summary file
        const summary = planServiceRef.current.exportToText(session);
        zip.file('summary.txt', summary);

        zip.generateAsync({ type: 'blob' }).then((content) => {
            saveAs(content, `plan-ideas-${new Date().toISOString().split('T')[0]}.zip`);
            addToast('success', 'Đã tải file ZIP');
        });
    }, [session, addToast]);

    const handleExport = useCallback(() => {
        if (exportFormat === 'single') {
            handleExportSingle();
        } else {
            handleExportMultiple();
        }
    }, [exportFormat, handleExportSingle, handleExportMultiple]);

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

            {/* API Keys Section */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-slate-300">🔑 API Keys</h3>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCheckAllKeys}
                            className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
                        >
                            Kiểm tra
                        </button>
                        <button
                            onClick={handleClearApiKeys}
                            className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
                        >
                            Xóa tất cả
                        </button>
                    </div>
                </div>
                <textarea
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Nhập API Keys (mỗi dòng 1 key)..."
                    disabled={isRunning}
                    className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 text-sm font-mono focus:border-purple-500 outline-none resize-none disabled:opacity-50"
                />
                <div className="flex justify-between items-center mt-2">
                    <button
                        onClick={handleAddApiKeys}
                        disabled={isRunning || !apiKeyInput.trim()}
                        className="text-sm bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors"
                    >
                        Thêm Keys
                    </button>
                    <div className="flex gap-3 text-xs">
                        <span className="flex items-center gap-1 text-green-400">
                            <span className="w-2 h-2 rounded-full bg-green-400"></span>
                            {apiKeyStats.active} Active
                        </span>
                        <span className="flex items-center gap-1 text-amber-400">
                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            {apiKeyStats.rateLimited} Rate Limited
                        </span>
                        <span className="flex items-center gap-1 text-red-400">
                            <span className="w-2 h-2 rounded-full bg-red-400"></span>
                            {apiKeyStats.dead} Dead
                        </span>
                    </div>
                </div>
            </div>

            {/* Settings Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Concurrent Setting */}
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        ⚡ Concurrent Jobs
                    </label>
                    <select
                        value={maxConcurrent}
                        onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                        disabled={isRunning}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none disabled:opacity-50"
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Số keywords xử lý song song</p>
                </div>

                {/* Delay Setting */}
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        ⏱️ Delay (ms)
                    </label>
                    <input
                        type="number"
                        value={config.delayBetweenKeywords}
                        onChange={(e) => setConfig({ ...config, delayBetweenKeywords: Math.max(0, parseInt(e.target.value) || 0) })}
                        disabled={isRunning}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center focus:border-purple-500 outline-none disabled:opacity-50"
                    />
                    <p className="text-xs text-slate-500 mt-1">Delay giữa các requests (10s = 10000ms)</p>
                </div>

                {/* Export Format */}
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        💾 Export Format
                    </label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="exportFormat"
                                value="single"
                                checked={exportFormat === 'single'}
                                onChange={() => setExportFormat('single')}
                                disabled={isRunning}
                                className="text-purple-500"
                            />
                            <span className="text-sm text-slate-300">1 file .txt</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="exportFormat"
                                value="multiple"
                                checked={exportFormat === 'multiple'}
                                onChange={() => setExportFormat('multiple')}
                                disabled={isRunning}
                                className="text-purple-500"
                            />
                            <span className="text-sm text-slate-300">ZIP nhiều file</span>
                        </label>
                    </div>
                </div>
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

                    {/* Actions */}
                    <div className="flex gap-3">
                        {!isRunning ? (
                            <button
                                onClick={handleGenerate}
                                disabled={validKeywordCount === 0 || validKeywordCount > 100 || !apiKeyManager.hasAvailableKey()}
                                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
                            >
                                🚀 Generate Ideas ({validKeywordCount})
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
                                    💾 Export
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
