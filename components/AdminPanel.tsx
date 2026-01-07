
'use client';

import React, { useState } from 'react';
import { SystemPromptData, UserProfile } from '@/lib/types';
import EditIcon from './icons/EditIcon';
import SaveIcon from './icons/SaveIcon';
import TrashIcon from './icons/TrashIcon';

interface AdminPanelProps {
    prompts: SystemPromptData[];
    onUpdatePrompts: (prompts: SystemPromptData[]) => void;
    onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ prompts, onUpdatePrompts, onClose }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<SystemPromptData>>({});
    const [activeTab, setActiveTab] = useState<'prompts' | 'users'>('prompts');

    // --- LOGIC QUẢN LÝ PROMPT ---
    const handleEdit = (prompt: SystemPromptData) => {
        setEditingId(prompt.id);
        setEditForm({ ...prompt });
    };

    const handleSave = () => {
        if (!editingId) return;

        const updatedPrompts = prompts.map(p =>
            p.id === editingId ? { ...p, ...editForm } as SystemPromptData : p
        );
        onUpdatePrompts(updatedPrompts);
        setEditingId(null);
    };

    const handleDelete = (id: string) => {
        if (confirm('Bạn có chắc chắn muốn xóa Prompt này? Việc này có thể ảnh hưởng đến các bước đang sử dụng nó.')) {
            const updatedPrompts = prompts.filter(p => p.id !== id);
            onUpdatePrompts(updatedPrompts);
        }
    };

    const handleAddNew = () => {
        const newId = `NEW_PROMPT_${Date.now()}`;
        const newPrompt: SystemPromptData = {
            id: newId,
            name: 'New Custom Prompt',
            content: 'Nhập nội dung system prompt vào đây...',
            stepId: 1
        };
        onUpdatePrompts([...prompts, newPrompt]);
        setEditingId(newId);
        setEditForm(newPrompt);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-6xl h-[90vh] rounded-xl border border-slate-600 shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-700 bg-slate-900/50 rounded-t-xl">
                    <h2 className="text-2xl font-bold text-sky-400">Admin Dashboard - Factory Control</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        ✕ Đóng
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700">
                    <button
                        className={`px-6 py-3 font-medium transition-colors ${activeTab === 'prompts' ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-700/30' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setActiveTab('prompts')}
                    >
                        Quản lý System Prompts
                    </button>
                    <button
                        className={`px-6 py-3 font-medium transition-colors ${activeTab === 'users' ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-700/30' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setActiveTab('users')}
                    >
                        Quản lý User & Phân Quyền (Demo)
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-grow overflow-auto p-6 bg-slate-800">

                    {/* --- PROMPT MANAGER TAB --- */}
                    {activeTab === 'prompts' && (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <p className="text-slate-400 text-sm">Chỉnh sửa nội dung các "nhân viên AI" (System Prompt) cho từng bước.</p>
                                <button onClick={handleAddNew} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md shadow flex items-center gap-2 text-sm font-bold">
                                    + Thêm Prompt Mới
                                </button>
                            </div>

                            <div className="space-y-4">
                                {prompts.map(prompt => (
                                    <div key={prompt.id} className={`p-4 rounded-lg border ${editingId === prompt.id ? 'border-sky-500 bg-slate-900' : 'border-slate-600 bg-slate-700/30 hover:bg-slate-700/50'}`}>
                                        {editingId === prompt.id ? (
                                            <div className="grid grid-cols-1 gap-4 animate-in fade-in duration-200">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="block text-xs text-slate-400 mb-1">ID (Không thể sửa)</label>
                                                        <input disabled value={editForm.id} className="w-full bg-slate-800 p-2 rounded text-slate-500 text-sm cursor-not-allowed border border-slate-700" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-slate-400 mb-1">Tên Hiển Thị</label>
                                                        <input
                                                            value={editForm.name}
                                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                            className="w-full bg-slate-800 p-2 rounded text-white border border-slate-600 focus:border-sky-500 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-slate-400 mb-1">Thuộc Bước (Step ID)</label>
                                                        <select
                                                            value={editForm.stepId}
                                                            onChange={e => setEditForm({ ...editForm, stepId: parseInt(e.target.value) })}
                                                            className="w-full bg-slate-800 p-2 rounded text-white border border-slate-600 focus:border-sky-500 text-sm"
                                                        >
                                                            {[1, 2, 3, 4, 5, 6].map(s => <option key={s} value={s}>Bước {s}</option>)}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs text-slate-400 mb-1">Nội dung System Prompt</label>
                                                    <textarea
                                                        value={editForm.content}
                                                        onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                                                        className="w-full bg-slate-800 p-3 rounded text-slate-200 border border-slate-600 focus:border-sky-500 h-64 font-mono text-sm leading-relaxed"
                                                    />
                                                </div>

                                                <div className="flex gap-2 justify-end mt-2">
                                                    <button onClick={handleSave} className="bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded text-white text-sm font-medium flex items-center gap-1">
                                                        <SaveIcon className="h-4 w-4" /> Lưu Thay Đổi
                                                    </button>
                                                    <button onClick={() => setEditingId(null)} className="bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded text-white text-sm font-medium">Hủy</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between items-start">
                                                <div className="flex-grow">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className="bg-slate-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">BƯỚC {prompt.stepId}</span>
                                                        <h3 className="font-bold text-sky-300 text-base">{prompt.name}</h3>
                                                        <span className="text-xs text-slate-500 font-mono">ID: {prompt.id}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-400 line-clamp-2 mt-2 font-mono bg-slate-800/50 p-2 rounded border border-slate-700/50">
                                                        {prompt.content}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 ml-4 shrink-0">
                                                    <button onClick={() => handleEdit(prompt)} className="p-2 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors" title="Sửa">
                                                        <EditIcon className="h-5 w-5" />
                                                    </button>
                                                    <button onClick={() => handleDelete(prompt.id)} className="p-2 hover:bg-red-900/50 rounded text-slate-500 hover:text-red-400 transition-colors" title="Xóa">
                                                        <TrashIcon className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* --- USER MANAGER TAB (MOCK UI) --- */}
                    {activeTab === 'users' && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <div className="bg-slate-700/30 p-8 rounded-lg border border-slate-600 max-w-2xl text-center">
                                <h3 className="text-xl font-bold text-white mb-4">Tính năng Quản lý User</h3>
                                <p className="mb-6">
                                    Hiện tại hệ thống đang chạy ở chế độ Client-side (Local).
                                    Tính năng này cần có Backend (Database) để lưu trữ tài khoản và phân quyền thực tế.
                                </p>
                                <div className="text-left bg-slate-900 p-4 rounded border border-slate-700 text-sm font-mono mb-6">
                                    <p className="text-green-400">// Mock Structure Plan:</p>
                                    <p>interface User &#123;</p>
                                    <p>  id: "user_01";</p>
                                    <p>  role: "editor";</p>
                                    <p>  allowedPromptIds: ["S1_CRIME_DOC", "S2_OUTLINE_BASIC"];</p>
                                    <p>&#125;</p>
                                </div>
                                <button disabled className="bg-slate-600 text-slate-400 px-6 py-2 rounded cursor-not-allowed">
                                    Chức năng đang phát triển...
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
