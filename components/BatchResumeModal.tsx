'use client';

import React from 'react';

interface BatchResumeModalProps {
    age: string;
    jobCount: number;
    onResume: () => void;
    onDiscard: () => void;
}

const BatchResumeModal: React.FC<BatchResumeModalProps> = ({
    age,
    jobCount,
    onResume,
    onDiscard
}) => {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-amber-500/50 rounded-xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
                {/* Background Accent */}
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor" className="text-amber-500">
                        <path d="M12 4V2C6.48 2 2 6.48 2 12H4C4 7.58 7.58 4 12 4ZM12 22C17.52 22 22 17.52 22 12H20C20 16.42 16.42 20 12 20V22ZM20 9.06L21.41 7.65C21.79 8.28 22 9 22 9.06H20ZM12 18C8.69 18 6 15.31 6 12C6 9.8 7.12 7.84 8.87 6.72L10.3 8.15C9.5 8.83 9 9.85 9 11C9 13.21 10.79 15 13 15C13.88 15 14.68 14.67 15.31 14.13L16.71 15.53C15.68 16.45 14.4 17 13 17V19C15.76 19 18 16.76 18 14H16C16 15.66 14.66 17 13 17V18ZM4.98 10C4.34 10 3.75 10.15 3.21 10.42L4.62 11.83C4.84 11.26 5.31 10.79 5.88 10.57L4.98 10Z" />
                    </svg>
                </div>

                <div className="relative z-10">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <span className="text-2xl">🔄</span> Khôi Phục Phiên Làm Việc
                    </h3>
                    <p className="text-slate-300 text-sm mb-4">
                        Hệ thống phát hiện một phiên làm việc chưa hoàn tất từ <b>{age}</b> với <b>{jobCount} công việc</b>.
                    </p>

                    <div className="bg-slate-800/50 rounded-lg p-3 mb-6 border border-slate-700">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>Trạng thái:</span>
                            <span className="text-amber-400 font-bold">Đang chờ xử lý</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 w-1/2 animate-pulse" />
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onDiscard}
                            className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                        >
                            Huỷ bỏ & Tạo mới
                        </button>
                        <button
                            onClick={onResume}
                            className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-amber-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Tiếp tục chạy ✅
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BatchResumeModal;
