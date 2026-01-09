'use client';

import React from 'react';
import { SceneWarning, JobQualityScore } from '@/lib/types';

interface QualityReportProps {
    jobId: string;
    warnings: SceneWarning[];
    qualityScore: JobQualityScore;
    onClose: () => void;
    onDownload?: () => void;
}

const QualityReport: React.FC<QualityReportProps> = ({
    jobId,
    warnings,
    qualityScore,
    onClose,
    onDownload
}) => {
    // Get score color
    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-green-400';
        if (score >= 70) return 'text-yellow-400';
        return 'text-red-400';
    };

    // Copy warnings to clipboard
    const handleCopy = () => {
        const text = warnings.map(w =>
            `Scene ${w.sceneNum}: ${w.actual} từ (target: ${w.target - w.tolerance}-${w.target + w.tolerance}, diff: ${w.diff > 0 ? '+' : ''}${w.diff})`
        ).join('\n');
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-700">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white">
                            ✅ {jobId} Hoàn Thành
                        </h3>
                        <span className={`text-2xl font-bold ${getScoreColor(qualityScore.score)}`}>
                            ⭐ {qualityScore.score}%
                        </span>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-center">
                        <div className="bg-green-900/30 p-2 rounded">
                            <div className="text-green-400 font-bold">{qualityScore.withinTarget}</div>
                            <div className="text-green-600">Đúng target</div>
                        </div>
                        <div className="bg-amber-900/30 p-2 rounded">
                            <div className="text-amber-400 font-bold">{qualityScore.withinTolerance}</div>
                            <div className="text-amber-600">Trong tolerance</div>
                        </div>
                        <div className="bg-red-900/30 p-2 rounded">
                            <div className="text-red-400 font-bold">{qualityScore.outOfTolerance}</div>
                            <div className="text-red-600">Vượt tolerance</div>
                        </div>
                    </div>
                </div>

                {/* Warnings list */}
                <div className="flex-1 overflow-y-auto p-4">
                    {warnings.length === 0 ? (
                        <div className="text-center text-slate-500 py-8">
                            🎉 Tất cả scenes đều trong target!
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="text-sm text-slate-400 mb-2">
                                ⚠️ {warnings.length} scenes vượt tolerance:
                            </div>
                            {warnings.slice(0, 50).map((w, idx) => (
                                <div key={idx} className="text-xs bg-slate-800 p-2 rounded flex justify-between">
                                    <span className="text-slate-300">Scene {w.sceneNum}</span>
                                    <span className="text-slate-400">
                                        {w.actual} từ
                                        <span className={w.diff > 0 ? 'text-red-400 ml-2' : 'text-amber-400 ml-2'}>
                                            ({w.diff > 0 ? '+' : ''}{w.diff})
                                        </span>
                                    </span>
                                </div>
                            ))}
                            {warnings.length > 50 && (
                                <div className="text-xs text-slate-500 text-center py-2">
                                    ... và {warnings.length - 50} scenes khác
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-slate-700 flex gap-2">
                    <button
                        onClick={handleCopy}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded text-sm transition-colors"
                    >
                        📋 Copy
                    </button>
                    {onDownload && (
                        <button
                            onClick={onDownload}
                            className="flex-1 bg-sky-600 hover:bg-sky-500 text-white py-2 px-4 rounded text-sm transition-colors"
                        >
                            ⬇️ Download
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded text-sm transition-colors"
                    >
                        ✓ Đóng
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QualityReport;
