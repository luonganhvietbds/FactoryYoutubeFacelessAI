"use client";

import React from 'react';
import { StepConfig } from '@/lib/types';
import { getStepLockMessage } from '@/lib/workflow-constants';

interface StepCardProps {
    stepId: number;
    stepConfig: StepConfig;
    isLocked: boolean;
    isCompleted: boolean;
    canRun: boolean;
    output?: string;
    onRun: () => void;
    onView: () => void;
}

const StepCard: React.FC<StepCardProps> = ({
    stepId,
    stepConfig,
    isLocked,
    isCompleted,
    canRun,
    output,
    onRun,
    onView
}) => {
    const lockMessage = getStepLockMessage(stepId, isLocked ? null : 'selected', []);
    const isAvailable = !isLocked && (stepId === 1 || canRun);
    
    const getStatusStyles = () => {
        if (isCompleted) {
            return {
                border: 'border-green-500/50',
                bg: 'bg-green-900/10',
                badge: 'bg-green-900/50 text-green-400',
                icon: 'text-green-400'
            };
        }
        if (isAvailable) {
            return {
                border: 'border-sky-500/50',
                bg: 'bg-slate-800',
                badge: 'bg-sky-900/50 text-sky-400',
                icon: 'text-sky-400'
            };
        }
        if (isLocked) {
            return {
                border: 'border-slate-700',
                bg: 'bg-slate-800/50',
                badge: 'bg-slate-700 text-slate-500',
                icon: 'text-slate-500'
            };
        }
        return {
            border: 'border-slate-700',
            bg: 'bg-slate-800',
            badge: 'bg-slate-700 text-slate-500',
            icon: 'text-slate-500'
        };
    };

    const styles = getStatusStyles();

    return (
        <div 
            className={`border ${styles.border} ${styles.bg} rounded-xl p-5 transition-all duration-300 ${
                isAvailable && !isCompleted ? 'hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10' : ''
            } ${!isAvailable && !isLocked ? 'opacity-75' : ''}`}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                        isCompleted 
                            ? 'bg-green-500/20 text-green-400' 
                            : isAvailable 
                                ? 'bg-sky-500/20 text-sky-400'
                                : 'bg-slate-700 text-slate-500'
                    }`}>
                        {isCompleted ? '✓' : stepId}
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">{stepConfig.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${styles.badge}`}>
                            {stepConfig.buttonText}
                        </span>
                    </div>
                </div>
                {isCompleted && (
                    <div className="flex items-center gap-1 text-green-400 text-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Hoàn thành
                    </div>
                )}
            </div>

            <p className="text-slate-400 text-xs mb-4 line-clamp-2">
                {stepConfig.description}
            </p>

            <div className={`text-xs mb-4 p-2 rounded-lg ${
                isLocked 
                    ? 'bg-amber-900/20 text-amber-400' 
                    : isCompleted
                        ? 'bg-green-900/20 text-green-400'
                        : 'bg-slate-700/50 text-slate-400'
            }`}>
                {isLocked && '🔒 Vui lòng chọn Pack để bắt đầu'}
                {!isLocked && stepId === 1 && '✅ Sẵn sàng chạy - Nhấn nút để bắt đầu'}
                {!isLocked && stepId > 1 && !isCompleted && !canRun && `🔒 Hoàn thành Step ${stepId - 1} để mở khóa`}
                {!isLocked && !isCompleted && canRun && '✅ Sẵn sàng chạy'}
                {isCompleted && '✓ Step đã hoàn thành'}
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onRun}
                    disabled={!isAvailable}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
                        isAvailable && !isCompleted
                            ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg hover:shadow-sky-500/25'
                            : isCompleted
                                ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                >
                    {isCompleted ? 'Chạy Lại' : stepConfig.buttonText}
                </button>
                
                {isCompleted && output && (
                    <button
                        onClick={onView}
                        className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium text-sm transition-all border border-slate-600"
                    >
                        Xem
                    </button>
                )}
            </div>

            {isCompleted && output && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>{output.length} ký tự</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StepCard;
