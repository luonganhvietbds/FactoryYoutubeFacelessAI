'use client';

import React, { useState, useEffect } from 'react';
import { PromptPackManifest, SystemPromptData } from '@/lib/types';
import { RegistryService } from '@/lib/prompt-registry/client-registry';
import EditIcon from './icons/EditIcon';
import SaveIcon from './icons/SaveIcon';
import TrashIcon from './icons/TrashIcon';
import CheckIcon from './icons/CheckIcon';
import LoadingSpinnerIcon from './icons/LoadingSpinnerIcon';

interface AdminPanelProps {
    prompts: SystemPromptData[];
    onUpdatePrompts: (prompts: SystemPromptData[]) => void;
    onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ prompts, onUpdatePrompts, onClose }) => {
    const [packs, setPacks] = useState<PromptPackManifest[]>([]);
    const [isLoadingPacks, setIsLoadingPacks] = useState(true);
    const [activeTab, setActiveTab] = useState<'packs' | 'prompts'>('packs');
    const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

    // Edit State
    const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<SystemPromptData>>({});

    // Fetch Packs on Mount
    useEffect(() => {
        const load = async () => {
            setIsLoadingPacks(true);
            const data = await RegistryService.fetchFullRegistry();
            setPacks(data.packs);
            setIsLoadingPacks(false);
        };
        load();
    }, []);

    // --- ACTIONS ---
    const handleActivatePack = (packId: string) => {
        const pack = packs.find(p => p.id === packId);
        if (!pack) return;

        // Logic: Với mỗi bước có trong pack, tìm prompt ID tương ứng đã được load vào library
        // Tuy nhiên, prompt ID trong library có thể là prompt CUSTOM (nếu user đã edit).
        // Ta cần tìm prompt trong library mà có `packId === packId` HOẶC `id === manifest.prompt.id`.

        // Vì 'prompts' prop đã chứa merged prompts.
        // Ta chỉ cần thông báo cho user biết các ID tương ứng để họ chọn?
        // AdminPanel không control `selectedPromptIds` của Parent.
        // Update: AdminPanel chỉ quản lý Library Content (CRUD).
        // Việc "Activate" (Chọn dùng) thuộc về main UI (Select dropdown).

        // Tuy nhiên user muốn "Quản lý chuỗi 1-6".
        alert("Tính năng 'Kích hoạt nhanh' sẽ được cập nhật ở giao diện chính. Tại đây bạn có thể chỉnh sửa nội dung của Pack.");
    };

    const handleEditPrompt = (prompt: SystemPromptData) => {
        setEditingPromptId(prompt.id);
        setEditForm({ ...prompt });
    };

    const handleSavePrompt = () => {
        if (!editingPromptId) return;
        const updatedPrompts = prompts.map(p =>
            p.id === editingPromptId ? { ...p, ...editForm } as SystemPromptData : p
        );
        onUpdatePrompts(updatedPrompts);
        setEditingPromptId(null);
    };

    const handleAddCustom = () => {
        const newId = `CUSTOM_${Date.now()}`;
        const newPrompt: SystemPromptData = {
            id: newId, name: 'New Custom Prompt', content: '', stepId: 1
        };
        onUpdatePrompts([...prompts, newPrompt]);
        setEditingPromptId(newId);
        setEditForm(newPrompt);
    };

    // Helper to get prompt for a specific pack/step
    const getPromptForPackStep = (packId: string, stepId: number) => {
        // Tìm trong library hiện tại
        return prompts.find(p => p.packId === packId && p.stepId === stepId)
            || prompts.find(p => p.id.startsWith(`S${stepId}_`) && p.packId === packId); // Fallback logic
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 w-full max-w-7xl h-[95vh] rounded-2xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center px-8 py-5 border-b border-slate-800 bg-slate-800/50">
                    <div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                            AI Workforce Admin
                        </h2>
                        <p className="text-slate-400 text-xs mt-1">Quản lý và Tùy chỉnh các bộ Prompt (Packs)</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white px-4 py-2 hover:bg-slate-800 rounded transition-colors">✕ Đóng</button>
                </div>

                {/* Sidebar + Content */}
                <div className="flex flex-grow overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
                        <div className="p-4 space-y-2">
                            <button
                                onClick={() => { setActiveTab('packs'); setSelectedPackId(null); }}
                                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all ${activeTab === 'packs' && !selectedPackId ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                📦 Installed Packs
                            </button>
                            <button
                                onClick={() => setActiveTab('prompts')}
                                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all ${activeTab === 'prompts' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                📝 All Prompts (Flat)
                            </button>
                        </div>

                        <div className="mt-auto p-4 border-t border-slate-800">
                            <p className="text-xs text-slate-500 text-center">Version 2.0 (Marketplace Ready)</p>
                        </div>
                    </div>

                    {/* Main View */}
                    <div className="flex-grow bg-slate-950 overflow-auto custom-scrollbar relative">
                        {/* EDIT MODAL OVERLAY */}
                        {editingPromptId && (
                            <div className="absolute inset-0 z-10 bg-black/80 flex items-center justify-center p-8">
                                <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-full flex flex-col rounded-xl shadow-2xl">
                                    <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                                        <h3 className="font-bold text-sky-400">Chỉnh sửa Prompt: <span className="text-white">{editForm.name}</span></h3>
                                        <div className="flex gap-2">
                                            <button onClick={handleSavePrompt} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-bold flex items-center gap-2"><SaveIcon className="w-4 h-4" /> Lưu</button>
                                            <button onClick={() => setEditingPromptId(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded">Hủy</button>
                                        </div>
                                    </div>
                                    <div className="flex-grow p-4 overflow-hidden flex flex-col gap-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-slate-500 block mb-1">Tên Prompt</label>
                                                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-sky-500 outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500 block mb-1">Step ID</label>
                                                <select value={editForm.stepId} onChange={e => setEditForm({ ...editForm, stepId: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white">
                                                    {[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>Bước {i}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex-grow flex flex-col">
                                            <label className="text-xs text-slate-500 block mb-1">Nội dung Prompt (System Instruction)</label>
                                            <textarea value={editForm.content} onChange={e => setEditForm({ ...editForm, content: e.target.value })} className="flex-grow w-full bg-slate-800 border border-slate-700 rounded p-4 font-mono text-sm text-slate-300 leading-relaxed custom-scrollbar focus:border-sky-500 outline-none resize-none"></textarea>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-8">
                            {/* TAB: PACKS */}
                            {activeTab === 'packs' && (
                                <>
                                    {!selectedPackId ? (
                                        // LIST PACKS
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {isLoadingPacks && <div className="col-span-3 text-center py-20 text-slate-500"><LoadingSpinnerIcon className="inline animate-spin mr-2" /> Đang tải dữ liệu...</div>}
                                            {packs.map(pack => (
                                                <div key={pack.id} onClick={() => setSelectedPackId(pack.id)} className="group bg-slate-900 border border-slate-800 hover:border-sky-500/50 rounded-xl p-6 cursor-pointer transition-all hover:shadow-2xl hover:shadow-sky-900/20 relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                                                        <span className="text-9xl font-black text-white">P</span>
                                                    </div>
                                                    <div className="relative z-10">
                                                        <div className="flex justify-between items-start mb-4">
                                                            <span className="text-xs font-mono text-sky-500 bg-sky-900/20 px-2 py-1 rounded border border-sky-900/50">v{pack.version}</span>
                                                            <span className="text-xs text-slate-500">{pack.author}</span>
                                                        </div>
                                                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-sky-400 transition-colors">{pack.name}</h3>
                                                        <p className="text-sm text-slate-400 line-clamp-3 mb-6 h-10">{pack.description || "Không có mô tả."}</p>
                                                        <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-800 pt-4">
                                                            <span>{pack.prompts?.length || 0} Steps</span>
                                                            <span>•</span>
                                                            <span>Click để quản lý</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Create New Pack Placeholder */}
                                            <div className="border border-dashed border-slate-800 hover:border-slate-600 rounded-xl p-6 flex flex-col items-center justify-center text-slate-500 hover:text-slate-300 transition-colors cursor-not-allowed bg-slate-900/30">
                                                <span className="text-4xl mb-4 text-slate-700">+</span>
                                                <span className="font-bold">Tạo Pack Mới</span>
                                                <span className="text-xs mt-2 text-slate-600">(Comming Soon)</span>
                                            </div>
                                        </div>
                                    ) : (
                                        // PACK DETAIL
                                        <div className="animate-in slide-in-from-right-4 duration-300">
                                            <button onClick={() => setSelectedPackId(null)} className="mb-6 text-sm text-slate-400 hover:text-white flex items-center gap-2">← Quay lại danh sách</button>

                                            {(() => {
                                                const pack = packs.find(p => p.id === selectedPackId);
                                                if (!pack) return null;
                                                return (
                                                    <>
                                                        <div className="flex justify-between items-end mb-8 border-b border-slate-800 pb-6">
                                                            <div>
                                                                <h1 className="text-3xl font-bold text-white mb-2">{pack.name}</h1>
                                                                <p className="text-slate-400">{pack.description}</p>
                                                            </div>
                                                            <div className="flex gap-3">
                                                                <button onClick={() => handleActivatePack(pack.id)} className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow-lg shadow-sky-900/20">
                                                                    Áp dụng (Active)
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* 6 Steps Grid */}
                                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                                            {[1, 2, 3, 4, 5, 6].map(stepId => {
                                                                // Find prompt from prompts library (merged) that corresponds to this pack step
                                                                // Logic: 
                                                                // 1. From manifest, find the 'id' of the prompt for this step.
                                                                // 2. Find prompt in 'state.prompts' matching that 'id'.
                                                                const manifestItem = pack.prompts?.find(p => p.stepId === stepId);
                                                                const promptData = manifestItem ? prompts.find(p => p.id === manifestItem.id) : null;

                                                                return (
                                                                    <div key={stepId} className={`relative p-5 rounded-xl border ${promptData ? 'border-slate-700 bg-slate-900' : 'border-slate-800 bg-slate-900/50 opacity-60'}`}>
                                                                        <div className="absolute top-4 right-4 text-6xl font-black text-slate-800 select-none z-0">{stepId}</div>
                                                                        <div className="relative z-10">
                                                                            <h4 className="text-xs uppercase font-bold text-slate-500 mb-2">Bước {stepId}</h4>
                                                                            {promptData ? (
                                                                                <>
                                                                                    <h3 className="font-bold text-white mb-1 line-clamp-1" title={promptData.name}>{promptData.name}</h3>
                                                                                    <p className="text-xs text-slate-500 font-mono mb-4">{promptData.id}</p>
                                                                                    <button onClick={() => handleEditPrompt(promptData)} className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-sky-400 font-medium transition-colors flex items-center justify-center gap-2">
                                                                                        <EditIcon className="w-4 h-4" /> Chỉnh sửa
                                                                                    </button>
                                                                                </>
                                                                            ) : (
                                                                                <div className="h-24 flex items-center justify-center text-slate-600 text-sm">
                                                                                    Không có prompt cho bước này
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* TAB: FLAT PROMPTS */}
                            {activeTab === 'prompts' && (
                                <div>
                                    <div className="flex justify-between mb-6">
                                        <h2 className="text-xl font-bold text-white">Tất cả Prompts</h2>
                                        <button onClick={handleAddCustom} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-bold">+ Thêm Prompt Mới</button>
                                    </div>
                                    <div className="space-y-4">
                                        {prompts.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-600">
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-700">STEP {p.stepId}</span>
                                                        <span className="font-bold text-slate-200">{p.name}</span>
                                                    </div>
                                                    <span className="text-xs text-slate-600 font-mono mt-1 block">{p.id}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEditPrompt(p)} className="p-2 text-slate-400 hover:text-sky-400"><EditIcon className="w-4 h-4" /></button>
                                                    <button onClick={() => { if (confirm('Xóa?')) { /* Not implemented prop yet */ } }} className="p-2 text-slate-400 hover:text-red-400"><TrashIcon className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
