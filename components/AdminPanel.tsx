'use client';

import React, { useState, useEffect } from 'react';
import { PromptPackManifest, SystemPromptData } from '@/lib/types';
import { RegistryService } from '@/lib/prompt-registry/client-registry';
// Icons
import EditIcon from './icons/EditIcon';
import SaveIcon from './icons/SaveIcon';
import TrashIcon from './icons/TrashIcon';
import CheckIcon from './icons/CheckIcon';
import LoadingSpinnerIcon from './icons/LoadingSpinnerIcon';
import LogOutIcon from './icons/LogOutIcon';

interface AdminPanelProps {
    prompts: SystemPromptData[]; // Currently loaded prompts (merged)
    onUpdatePrompts: (prompts: SystemPromptData[]) => void;
    onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ prompts, onUpdatePrompts, onClose }) => {
    // --- STATE ---
    const [packs, setPacks] = useState<PromptPackManifest[]>([]);
    const [isLoadingPacks, setIsLoadingPacks] = useState(true);
    const [activeTab, setActiveTab] = useState<'packs' | 'prompts'>('packs');
    const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

    // Edit State
    const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<SystemPromptData>>({});
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    // Stats
    const totalEditablePrompts = prompts.length;
    const totalPacks = packs.length;

    // --- EFFECTS ---
    useEffect(() => {
        const load = async () => {
            setIsLoadingPacks(true);
            try {
                const data = await RegistryService.fetchFullRegistry();
                setPacks(data.packs);
            } catch (e) { console.error(e); }
            finally { setIsLoadingPacks(false); }
        };
        load();
    }, []);

    // --- ACTIONS ---
    const handleActivatePack = (packId: string) => {
        const pack = packs.find(p => p.id === packId);
        if (pack && pack.isValid === false) {
            alert(`CẢNH BÁO: Bộ Prompt này thiếu các bước quan trọng (${pack.missingSteps?.join(', ')}). Vui lòng bổ sung đầy đủ 6 bước trước khi kích hoạt.`);
            return;
        }
        alert("Vui lòng sử dụng 'Workforce Selector' ở trang chủ để kích hoạt Pack này cho toàn bộ hệ thống.");
    };

    const handleEditPrompt = (prompt: SystemPromptData) => {
        setEditingPromptId(prompt.id);
        setEditForm({ ...prompt });
        setSaveStatus('idle');
    };

    const handleCreatePromptForStep = (packId: string, stepId: number) => {
        const dummyId = `NEW_${Date.now()}`;
        setEditingPromptId(dummyId);
        setEditForm({
            id: dummyId,
            packId: packId,
            stepId: stepId,
            name: `Step ${stepId} Prompt`,
            content: ''
        });
        setSaveStatus('idle');
    };

    const handleSavePrompt = async () => {
        if (!editingPromptId) return;
        setSaveStatus('saving');

        try {
            // Check if Creating NEW (for a Pack)
            if (editingPromptId.startsWith('NEW_') && editForm.packId) {
                const res = await fetch('/api/registry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        packId: editForm.packId,
                        stepId: editForm.stepId,
                        name: editForm.name,
                        content: editForm.content
                    })
                });
                if (!res.ok) throw new Error("Failed to create prompt file");

                // Refresh Data
                const data = await RegistryService.fetchFullRegistry();
                setPacks(data.packs);
                onUpdatePrompts(data.prompts); // Force update page state with server data
                setSaveStatus('saved');
                setTimeout(() => { setEditingPromptId(null); setSaveStatus('idle'); }, 500);

            } else {
                // EDITING EXISTING (Local Override logic)
                // Simulate network delay for UX
                setTimeout(() => {
                    const updatedPrompts = prompts.map(p =>
                        p.id === editingPromptId ? { ...p, ...editForm } as SystemPromptData : p
                    );
                    onUpdatePrompts(updatedPrompts);
                    setSaveStatus('saved');
                    setTimeout(() => {
                        setEditingPromptId(null);
                        setSaveStatus('idle');
                    }, 500);
                }, 600);
            }
        } catch (e) {
            console.error(e);
            alert("Error saving prompt: " + e);
            setSaveStatus('idle');
        }
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

    // --- RENDERERS ---

    const SidebarItem = ({ id, label, icon, isActive, onClick }: any) => (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 group relative
            ${isActive
                    ? 'bg-gradient-to-r from-sky-600/90 to-indigo-600/90 text-white shadow-lg shadow-sky-900/20'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
        >
            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white/30 rounded-r-full"></div>}
            <span className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</span>
            <span>{label}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300">
            <div className="bg-slate-900 w-full max-w-[1400px] h-[90vh] rounded-3xl border border-slate-700/50 shadow-2xl shadow-sky-900/10 flex flex-col overflow-hidden ring-1 ring-white/5">

                {/* --- HEADER --- */}
                <div className="flex justify-between items-center px-8 py-5 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl z-10">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
                            A
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">
                                Admin Dashboard
                            </h2>
                            <p className="text-slate-400 text-xs">Prompt Marketplace & System Configuration</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-xs text-slate-400 font-mono">
                            v2.2.0-IntegrityCheck
                        </div>
                        <button onClick={onClose} className="group p-2 hover:bg-red-500/10 rounded-full transition-colors" title="Thoát">
                            <LogOutIcon className="w-5 h-5 text-slate-500 group-hover:text-red-400" />
                        </button>
                    </div>
                </div>

                {/* --- MAIN LAYOUT --- */}
                <div className="flex flex-grow overflow-hidden">

                    {/* SIDEBAR */}
                    <div className="w-72 border-r border-slate-800/50 bg-slate-900/30 flex flex-col p-6 gap-2 backdrop-blur-sm">
                        <div className="mb-2 px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Management</div>

                        <SidebarItem
                            id="packs"
                            label="Prompt Packs"
                            icon="📦"
                            isActive={activeTab === 'packs'}
                            onClick={() => { setActiveTab('packs'); setSelectedPackId(null); }}
                        />
                        <SidebarItem
                            id="prompts"
                            label="All Prompts"
                            icon="📝"
                            isActive={activeTab === 'prompts'}
                            onClick={() => setActiveTab('prompts')}
                        />

                        <div className="border-t border-slate-800/50 my-4 mx-2"></div>

                        <div className="mb-2 px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">System Stats</div>
                        <div className="grid grid-cols-2 gap-3 px-2">
                            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-2xl font-bold text-sky-400">{totalPacks}</div>
                                <div className="text-[10px] text-slate-500">Installed Packs</div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-2xl font-bold text-indigo-400">{totalEditablePrompts}</div>
                                <div className="text-[10px] text-slate-500">Active Prompts</div>
                            </div>
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    <div className="flex-grow bg-slate-950 relative overflow-hidden">

                        {/* DECORATIVE BACKGROUND */}
                        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-sky-900/10 to-transparent pointer-events-none"></div>

                        {/* --- EDIT MODAL (Overlay) --- */}
                        {editingPromptId && (
                            <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                                <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[85%] flex flex-col rounded-2xl shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-200">
                                    {/* Modal Header */}
                                    <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900 rounded-t-2xl">
                                        <div>
                                            <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                                <span className="text-sky-500">EDIT:</span> {editForm.name}
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1 font-mono">{editingPromptId}</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={handleSavePrompt}
                                                disabled={saveStatus === 'saving'}
                                                className={`px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all transform active:scale-95
                                                    ${saveStatus === 'saved' ? 'bg-green-600 text-white' : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/20'}`}
                                            >
                                                {saveStatus === 'saving' ? <LoadingSpinnerIcon className="animate-spin w-4 h-4" /> : saveStatus === 'saved' ? <CheckIcon className="w-4 h-4" /> : <SaveIcon className="w-4 h-4" />}
                                                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
                                            </button>
                                            <button onClick={() => setEditingPromptId(null)} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700">Cancel</button>
                                        </div>
                                    </div>

                                    {/* Modal Body */}
                                    <div className="flex-grow p-6 flex flex-col gap-6 overflow-hidden">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase">Interactive Name</label>
                                                <input
                                                    value={editForm.name}
                                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600"
                                                    placeholder="Enter prompt friendly name..."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase">Target Step (Logic)</label>
                                                <div className="relative">
                                                    <select
                                                        value={editForm.stepId}
                                                        onChange={e => setEditForm({ ...editForm, stepId: Number(e.target.value) })}
                                                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white appearance-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all cursor-pointer"
                                                    >
                                                        {[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>Step {i}: {i === 1 ? 'News' : i === 2 ? 'Outline' : i === 3 ? 'Script' : i === 4 ? 'Visuals' : i === 5 ? 'Voice' : 'Metadata'}</option>)}
                                                    </select>
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-grow flex flex-col space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                                <span>System Instruction (Prompt Content)</span>
                                                <span className="text-xs text-sky-500 cursor-pointer hover:underline">Copy Template</span>
                                            </label>
                                            <div className="relative flex-grow group">
                                                <textarea
                                                    value={editForm.content}
                                                    onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                                                    className="w-full h-full bg-slate-950 border border-slate-800 rounded-lg p-5 font-mono text-sm text-slate-300 leading-relaxed custom-scrollbar focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 outline-none resize-none shadow-inner"
                                                    padding-left="2"
                                                    spellCheck={false}
                                                ></textarea>
                                                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-400 text-[10px] px-2 py-1 rounded border border-slate-700 pointer-events-none">
                                                    {editForm.content?.length} characters
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="h-full overflow-y-auto custom-scrollbar p-8">

                            {/* --- TAB: PACKS --- */}
                            {activeTab === 'packs' && (
                                <>
                                    {!selectedPackId ? (
                                        <div className="animate-in slide-in-from-bottom-4 duration-500">
                                            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-indigo-400">Installed Workforce Packs</span>
                                                <span className="bg-slate-800 text-slate-400 text-sm px-2 py-1 rounded-full">{packs.length}</span>
                                            </h2>

                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                                {/* Loading State */}
                                                {isLoadingPacks && [1, 2, 3].map(i => (
                                                    <div key={i} className="bg-slate-900/50 rounded-2xl h-48 animate-pulse border border-slate-800"></div>
                                                ))}

                                                {/* Pack Cards */}
                                                {packs.map(pack => (
                                                    <div
                                                        key={pack.id}
                                                        onClick={() => setSelectedPackId(pack.id)}
                                                        className={`group bg-slate-900/80 border hover:border-sky-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-sky-900/20 hover:-translate-y-1 relative overflow-hidden backdrop-blur-sm
                                                        ${pack.isValid === false ? 'border-red-900/50 hover:border-red-500/50' : 'border-slate-800'}`}
                                                    >
                                                        {/* Decorative Gradient Blob */}
                                                        {pack.isValid !== false ? (
                                                            <div className="absolute -right-10 -top-10 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all"></div>
                                                        ) : (
                                                            <div className="absolute -right-10 -top-10 w-32 h-32 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all"></div>
                                                        )}

                                                        <div className="relative z-10">
                                                            <div className="flex justify-between items-start mb-4">
                                                                <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/50 px-2 py-1 rounded border border-sky-900/50">v{pack.version}</span>
                                                                {pack.isValid === false && (
                                                                    <span className="text-[10px] font-bold text-white bg-red-600 px-2 py-1 rounded flex items-center gap-1 animate-pulse">
                                                                        ⚠️ INCOMPLETE
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-sky-400 transition-colors">{pack.name}</h3>

                                                            {pack.isValid === false ? (
                                                                <div className="mb-4 bg-red-900/20 border border-red-900/50 rounded p-2 text-xs text-red-300">
                                                                    Missing Steps: <b>{pack.missingSteps?.join(', ')}</b>. <br />Pack cannot be deployed safely.
                                                                </div>
                                                            ) : (
                                                                <p className="text-sm text-slate-400 line-clamp-2 h-10 mb-6 group-hover:text-slate-300 transition-colors">{pack.description || "No description provided."}</p>
                                                            )}

                                                            <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                    {pack.isValid !== false ? (
                                                                        <span className="flex items-center gap-1 text-green-500"><span className="w-2 h-2 rounded-full bg-green-500"></span> Verified</span>
                                                                    ) : (
                                                                        <span className="flex items-center gap-1 text-red-500"><span className="w-2 h-2 rounded-full bg-red-500"></span> Error</span>
                                                                    )}
                                                                    <span>•</span>
                                                                    <span>{pack.prompts?.length || 0}/6</span>
                                                                </div>
                                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0">
                                                                    <span className="text-xs font-bold text-sky-400">View Details →</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Create New Pack (Placeholder) */}
                                                <div className="border border-dashed border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-600 hover:text-slate-400 transition-colors cursor-not-allowed bg-slate-900/20">
                                                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                                                        <span className="text-2xl font-light">+</span>
                                                    </div>
                                                    <span className="font-medium text-sm">Create New Pack</span>
                                                    <span className="text-[10px] mt-1 opacity-50 text-center">Import JSON or<br />Create from Scratch</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        // DETAILS VIEW
                                        <div className="animate-in slide-in-from-right-8 duration-300">
                                            <button onClick={() => setSelectedPackId(null)} className="mb-8 text-sm text-slate-400 hover:text-white flex items-center gap-2 group transition-colors">
                                                <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to Gallery
                                            </button>

                                            {(() => {
                                                const pack = packs.find(p => p.id === selectedPackId);
                                                if (!pack) return null;
                                                return (
                                                    <>
                                                        <div className="flex flex-col md:flex-row justify-between items-end mb-10 border-b border-slate-800 pb-8 gap-6">
                                                            <div>
                                                                <div className="flex items-center gap-3 mb-2">
                                                                    <h1 className="text-4xl font-bold text-white tracking-tight">{pack.name}</h1>
                                                                    {pack.isValid === false && <span className="text-red-500 bg-red-950/30 border border-red-900/50 px-2 py-1 rounded text-sm font-bold animate-pulse">⚠️ MISSING DATA</span>}
                                                                </div>
                                                                <p className="text-slate-400 text-lg max-w-2xl">{pack.description}</p>
                                                            </div>
                                                            <button
                                                                onClick={() => handleActivatePack(pack.id)}
                                                                disabled={pack.isValid === false}
                                                                className={`px-6 py-3 rounded-xl font-bold shadow-lg transition-all whitespace-nowrap hidden md:block
                                                                    ${pack.isValid === false
                                                                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                                                        : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white hover:scale-105 active:scale-95 shadow-indigo-900/30'}`}
                                                            >
                                                                {pack.isValid === false ? 'Cannot Deploy (Incomplete)' : 'Deploy this Workforce'}
                                                            </button>
                                                        </div>

                                                        {/* STEPS GRID */}
                                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                            {[1, 2, 3, 4, 5, 6].map(stepId => {
                                                                const manifestItem = pack.prompts?.find(p => p.stepId === stepId);
                                                                const promptData = manifestItem ? prompts.find(p => p.id === manifestItem.id) : null;
                                                                const isMissing = !promptData;

                                                                return (
                                                                    <div key={stepId} className="relative group">
                                                                        {/* Step Number Background */}
                                                                        <div className={`absolute -top-4 -right-2 text-8xl font-black select-none z-0 transition-colors pointer-events-none ${isMissing && pack.isValid === false ? 'text-red-900/30' : 'text-slate-800/20 group-hover:text-slate-800/40'}`}>{stepId}</div>

                                                                        <div className={`relative z-10 h-full p-6 rounded-2xl border transition-all duration-300 flex flex-col
                                                                            ${promptData
                                                                                ? 'bg-slate-900/50 border-slate-700/50 hover:bg-slate-800 hover:border-sky-500/30 hover:shadow-xl'
                                                                                : 'bg-slate-900/20 border-slate-800/50 border-dashed hover:bg-slate-900/40'}`}>

                                                                            <div className="mb-4">
                                                                                <div className="text-[10px] font-bold text-sky-500/80 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                                                    {stepId === 1 ? 'Input & Research' : stepId === 2 ? 'Structure' : stepId === 3 ? 'Screenplay' : stepId === 4 ? 'Visual Generation' : stepId === 5 ? 'Audio/TTS' : 'SEO & Meta'}
                                                                                </div>
                                                                                {promptData ? (
                                                                                    <>
                                                                                        <h3 className="font-bold text-white text-lg mb-1 truncate" title={promptData.name}>{promptData.name}</h3>
                                                                                        <code className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded block w-fit mb-4">{promptData.id}</code>
                                                                                    </>
                                                                                ) : (
                                                                                    <div className="flex flex-col items-start gap-2 mb-4 h-12 justify-center">
                                                                                        <span className="text-slate-500 italic text-sm">No prompt assigned.</span>
                                                                                        {pack.isValid === false && <span className="text-red-400 text-xs font-bold bg-red-900/20 px-2 py-1 rounded border border-red-900/50">⚠️ REQUIRED</span>}
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {promptData ? (
                                                                                <div className="mt-auto">
                                                                                    <button
                                                                                        onClick={() => handleEditPrompt(promptData)}
                                                                                        className="w-full py-2.5 bg-slate-800 hover:bg-sky-600/20 hover:text-sky-400 border border-slate-700 hover:border-sky-500/30 rounded-lg text-sm text-slate-300 font-medium transition-all flex items-center justify-center gap-2"
                                                                                    >
                                                                                        <EditIcon className="w-4 h-4" /> Edit Content
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="mt-auto">
                                                                                    <button
                                                                                        onClick={() => handleCreatePromptForStep(pack.id, stepId)}
                                                                                        className="w-full py-2.5 bg-slate-800 hover:bg-green-600/20 hover:text-green-400 border border-slate-700 hover:border-green-500/30 rounded-lg text-sm text-slate-300 font-medium transition-all flex items-center justify-center gap-2 group-hover:bg-green-900/10"
                                                                                    >
                                                                                        <span>+</span> Add Prompt
                                                                                    </button>
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

                            {/* --- TAB: PROMPTS --- */}
                            {activeTab === 'prompts' && (
                                <div className="animate-in fade-in duration-500">
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="text-2xl font-bold text-white">Result Registry (Flat View)</h2>
                                        <button onClick={handleAddCustom} className="px-5 py-2.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-green-900/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                                            <span>+</span> Create Custom Prompt
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {prompts.map(p => (
                                            <div key={p.id} className="group flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:bg-slate-800 hover:border-slate-700 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-700">
                                                        {p.stepId}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-200 group-hover:text-white transition-colors">{p.name}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <code className="text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">{p.id}</code>
                                                            {p.packId && <span className="text-[10px] text-sky-600 bg-sky-950/30 px-1.5 py-0.5 rounded border border-sky-900/30">{p.packId}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-200">
                                                    <button onClick={() => handleEditPrompt(p)} className="p-2 bg-slate-800 hover:bg-sky-600 text-slate-400 hover:text-white rounded-lg transition-colors shadow-sm"><EditIcon className="w-4 h-4" /></button>
                                                    <button onClick={() => { if (confirm('Delete?')) { /* TODO */ } }} className="p-2 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg transition-colors shadow-sm"><TrashIcon className="w-4 h-4" /></button>
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
