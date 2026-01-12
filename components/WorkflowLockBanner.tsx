"use client";

import React from 'react';
import { getWorkflowProgress } from '@/lib/workflow-constants';

interface WorkflowLockBannerProps {
    isLocked: boolean;
    hasPackAccess: boolean;
    selectedPackId: string | null;
    selectedPackName: string | null;
    completedSteps: number[];
    totalSteps?: number;
    onSelectPack: () => void;
}

const WorkflowLockBanner: React.FC<WorkflowLockBannerProps> = ({
    isLocked,
    hasPackAccess,
    selectedPackId,
    selectedPackName,
    completedSteps,
    totalSteps = 6,
    onSelectPack
}) => {
    const progress = getWorkflowProgress(completedSteps, totalSteps);

    if (!hasPackAccess) {
        return (
            <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-5 mb-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">🔒</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-red-400 font-bold text-lg">Chưa có quyền truy cập Pack nào</span>
                        </div>
                        <p className="text-red-300/70 text-sm">
                            Liên hệ Admin để được cấp quyền truy cập Packs trước khi sử dụng workflow.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (isLocked && selectedPackId === null) {
        return (
            <div className="bg-amber-900/20 border border-amber-500/50 rounded-xl p-5 mb-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">📦</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-amber-400 font-bold text-lg">Vui lòng chọn Pack để bắt đầu</span>
                        </div>
                        <p className="text-amber-300/70 text-sm mb-3">
                            Chọn một Pack từ danh sách bên dưới để kích hoạt workflow.
                            Bạn sẽ cần hoàn thành tất cả các bước theo thứ tự.
                        </p>
                        <button
                            onClick={onSelectPack}
                            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-amber-500/25"
                        >
                            Chọn Pack Ngay
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isLocked && selectedPackId !== null) {
        return (
            <div className="bg-amber-900/20 border border-amber-500/50 rounded-xl p-5 mb-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-amber-400 text-xl">⏳</span>
                    <span className="text-amber-400 font-bold">Đang tải...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-green-900/20 border border-green-500/50 rounded-xl p-5 mb-6 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">✅</span>
                    <span className="text-green-400 font-bold text-lg">Workflow đang chạy</span>
                </div>
                <div className="text-right">
                    <span className="text-green-300/70 text-sm">
                        {progress.completed}/{totalSteps} steps hoàn thành
                    </span>
                    <div className="text-green-400 font-bold text-xl">
                        {progress.percentage}%
                    </div>
                </div>
            </div>
            
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div 
                    className="h-full bg-gradient-to-r from-green-600 to-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${progress.percentage}%` }}
                />
            </div>
            
            <div className="flex items-center gap-2 text-sm">
                <span className="text-green-300/70">Pack:</span>
                <span className="text-green-400 font-medium px-2 py-0.5 bg-green-900/30 rounded">
                    {selectedPackName || selectedPackId}
                </span>
                {progress.remaining > 0 && (
                    <span className="text-green-300/50 ml-auto">
                        Còn {progress.remaining} step{progress.remaining > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </div>
    );
};

export default WorkflowLockBanner;
