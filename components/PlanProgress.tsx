'use client';

import React from 'react';
import { PlanProgress } from '@/lib/types';

interface PlanProgressDisplayProps {
    progress: PlanProgress;
}

const PlanProgressDisplay: React.FC<PlanProgressDisplayProps> = ({ progress }) => {
    const percentage = Math.round((progress.current / progress.total) * 100);

    return (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">
                    🔄 Đang xử lý...
                </span>
                <span className="text-sm text-slate-400">
                    {progress.current}/{progress.total}
                </span>
            </div>

            <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden mb-4">
                <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className="space-y-3">
                <div className="bg-slate-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                        <span className="text-amber-400 animate-pulse">▶️</span>
                        <span className="text-white font-medium">Đang xử lý:</span>
                        <span className="text-slate-300">{progress.currentKeyword}</span>
                    </div>
                    <div className="mt-2 flex gap-2 text-xs">
                        <span className="bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                            Step 1: Tìm kiếm thông tin...
                        </span>
                    </div>
                </div>

                {progress.completedIdeas && progress.completedIdeas.length > 0 && (
                    <div>
                        <div className="text-xs text-slate-500 mb-2">
                            ✅ Đã hoàn thành ({progress.completedIdeas.length}):
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                            {progress.completedIdeas.slice(-5).map((idea, idx) => (
                                <div
                                    key={idea.id || idx}
                                    className="flex items-center gap-2 bg-slate-800/50 px-2 py-1 rounded text-xs"
                                >
                                    <span className="text-green-400">✓</span>
                                    <span className="text-slate-300 truncate">{idea.keyword}</span>
                                </div>
                            ))}
                            {progress.completedIdeas.length > 5 && (
                                <div className="text-xs text-slate-500 text-center py-1">
                                    ...và {progress.completedIdeas.length - 5} ideas khác
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {progress.lastError && (
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                            <span>⚠️</span>
                            <span>Lỗi: {progress.lastError}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlanProgressDisplay;
