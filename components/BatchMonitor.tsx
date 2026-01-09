'use client';

import React from 'react';
import { estimateProcessingTime, validateWorkload } from '@/lib/batchOptimizer';

interface BatchMonitorProps {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    currentJobIndex: number;
    currentStep: number;
    currentBatch?: string;
    sceneCount: number;
    activeKeyCount: number;
    totalApiCalls: number;
    startTime?: number;
}

const BatchMonitor: React.FC<BatchMonitorProps> = ({
    totalJobs,
    completedJobs,
    failedJobs,
    currentJobIndex,
    currentStep,
    currentBatch,
    sceneCount,
    activeKeyCount,
    totalApiCalls,
    startTime
}) => {
    // Calculate ETA
    const { formattedTime: eta } = estimateProcessingTime(
        totalJobs - completedJobs,
        sceneCount,
        activeKeyCount
    );

    // Calculate elapsed time
    const getElapsedTime = (): string => {
        if (!startTime) return '--';
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    };

    // Calculate progress percentage
    const progressPercent = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

    // Get warnings
    const { warnings } = validateWorkload(totalJobs, sceneCount, activeKeyCount);

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    📊 Batch Monitor
                </h3>
                <span className="text-xs text-slate-500">
                    {activeKeyCount} API Keys hoạt động
                </span>
            </div>

            {/* Main Progress */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Tiến độ tổng thể</span>
                    <span className="text-white font-bold">
                        {completedJobs}/{totalJobs} kịch bản ({progressPercent}%)
                    </span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {/* Current Job Status */}
            {currentJobIndex > 0 && (
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-800 p-2 rounded">
                        <div className="text-amber-400 font-bold text-lg">{currentJobIndex}</div>
                        <div className="text-xs text-slate-500">Job hiện tại</div>
                    </div>
                    <div className="bg-slate-800 p-2 rounded">
                        <div className="text-sky-400 font-bold text-lg">Step {currentStep}</div>
                        <div className="text-xs text-slate-500">{currentBatch || '--'}</div>
                    </div>
                    <div className="bg-slate-800 p-2 rounded">
                        <div className="text-purple-400 font-bold text-lg">{sceneCount}</div>
                        <div className="text-xs text-slate-500">Scenes/script</div>
                    </div>
                </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-green-900/30 p-2 rounded border border-green-800">
                    <div className="text-green-400 font-bold">{completedJobs}</div>
                    <div className="text-green-600">Thành công</div>
                </div>
                <div className="bg-red-900/30 p-2 rounded border border-red-800">
                    <div className="text-red-400 font-bold">{failedJobs}</div>
                    <div className="text-red-600">Thất bại</div>
                </div>
                <div className="bg-blue-900/30 p-2 rounded border border-blue-800">
                    <div className="text-blue-400 font-bold">{totalApiCalls}</div>
                    <div className="text-blue-600">API Calls</div>
                </div>
                <div className="bg-purple-900/30 p-2 rounded border border-purple-800">
                    <div className="text-purple-400 font-bold">{getElapsedTime()}</div>
                    <div className="text-purple-600">Đã chạy</div>
                </div>
            </div>

            {/* ETA */}
            <div className="flex justify-between items-center bg-slate-800 p-2 rounded">
                <span className="text-sm text-slate-400">⏱️ Thời gian còn lại (ước tính)</span>
                <span className="text-amber-400 font-bold">{eta}</span>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="space-y-1">
                    {warnings.map((warning, idx) => (
                        <div key={idx} className="text-xs text-amber-300 bg-amber-900/20 p-2 rounded">
                            {warning}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BatchMonitor;
