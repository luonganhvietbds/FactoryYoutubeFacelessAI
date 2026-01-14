'use client';

import React, { useState } from 'react';
import { PlanSession, PlanIdea } from '@/lib/types';

interface PlanResultsProps {
    session: PlanSession;
}

const PlanResults: React.FC<PlanResultsProps> = ({ session }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all');

    const filteredIdeas = session.ideas.filter(idea => {
        if (filter === 'all') return true;
        return idea.status === filter;
    });

    const completedCount = session.ideas.filter(i => i.status === 'completed').length;
    const failedCount = session.ideas.filter(i => i.status === 'failed').length;

    const formatTime = (isoString?: string) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const truncateText = (text: string, maxLength: number = 150) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    return (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-bold text-white">✅ Kết quả</h3>
                    <p className="text-xs text-slate-500">
                        Hoàn thành lúc {formatTime(session.completedAt)}
                    </p>
                </div>
                <div className="flex gap-2 text-xs">
                    <span className="bg-green-900/30 text-green-400 px-2 py-1 rounded">
                        ✅ {completedCount}
                    </span>
                    <span className="bg-red-900/30 text-red-400 px-2 py-1 rounded">
                        ❌ {failedCount}
                    </span>
                </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                        filter === 'all'
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                >
                    Tất cả ({session.ideas.length})
                </button>
                <button
                    onClick={() => setFilter('completed')}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                        filter === 'completed'
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                >
                    Thành công ({completedCount})
                </button>
                <button
                    onClick={() => setFilter('failed')}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                        filter === 'failed'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                >
                    Thất bại ({failedCount})
                </button>
            </div>

            {/* Ideas List */}
            <div className="max-h-96 overflow-y-auto space-y-2 custom-scrollbar">
                {filteredIdeas.length === 0 ? (
                    <div className="text-center text-slate-500 py-8">
                        <p>Không có ideas nào</p>
                    </div>
                ) : (
                    filteredIdeas.map((idea) => (
                        <IdeaCard
                            key={idea.id}
                            idea={idea}
                            isExpanded={expandedId === idea.id}
                            onToggle={() => setExpandedId(expandedId === idea.id ? null : idea.id)}
                            truncateText={truncateText}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

interface IdeaCardProps {
    idea: PlanIdea;
    isExpanded: boolean;
    onToggle: () => void;
    truncateText: (text: string, maxLength?: number) => string;
}

const IdeaCard: React.FC<IdeaCardProps> = ({
    idea,
    isExpanded,
    onToggle,
    truncateText
}) => {
    return (
        <div
            className={`rounded-lg border overflow-hidden transition-colors ${
                idea.status === 'completed'
                    ? 'bg-slate-800/50 border-slate-700'
                    : 'bg-red-900/10 border-red-800/50'
            }`}
        >
            <button
                onClick={onToggle}
                className="w-full px-3 py-2 flex items-center gap-3 text-left"
            >
                <span className={`text-lg ${idea.status === 'completed' ? 'text-green-400' : 'text-red-400'}`}>
                    {idea.status === 'completed' ? '✓' : '✗'}
                </span>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                        {idea.keyword}
                    </div>
                    {idea.status === 'completed' && idea.topic && (
                        <div className="text-xs text-slate-500 truncate">
                            {truncateText(idea.topic, 80)}
                        </div>
                    )}
                    {idea.status === 'failed' && idea.error && (
                        <div className="text-xs text-red-400 truncate">
                            {idea.error}
                        </div>
                    )}
                </div>
                <span className={`text-slate-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 pt-0">
                    <div className="border-t border-slate-700 my-2" />
                    {idea.status === 'completed' ? (
                        <div className="space-y-2">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">📋 Topic/Outline:</div>
                                <div className="text-xs text-slate-300 bg-slate-800 p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">
                                    {idea.topic}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                            ❌ Lỗi: {idea.error || 'Unknown error'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PlanResults;
