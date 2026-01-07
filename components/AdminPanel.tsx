'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PromptPackManifest, SystemPromptData } from '@/lib/types';
import { RegistryService } from '@/lib/prompt-registry/client-registry';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, collection, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Icons
import EditIcon from './icons/EditIcon';
import SaveIcon from './icons/SaveIcon';
import TrashIcon from './icons/TrashIcon';
import CheckIcon from './icons/CheckIcon';
import LoadingSpinnerIcon from './icons/LoadingSpinnerIcon';
import LogOutIcon from './icons/LogOutIcon';

interface AdminPanelProps {
    prompts: SystemPromptData[];
    onUpdatePrompts: (prompts: SystemPromptData[]) => void;
    onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ prompts, onUpdatePrompts, onClose }) => {
    // --- STATE ---
    const [packs, setPacks] = useState<PromptPackManifest[]>([]);
    const [isLoadingPacks, setIsLoadingPacks] = useState(true);
    const [activeTab, setActiveTab] = useState<'packs' | 'prompts' | 'cloud'>('packs');
    const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

    // Edit State
    const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<SystemPromptData>>({});
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    // Sync State
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncLog, setSyncLog] = useState<string[]>([]);

    // Auto-Init State
    const [showInitModal, setShowInitModal] = useState(false);
    const [initStatus, setInitStatus] = useState<'checking' | 'not_init' | 'initializing' | 'done' | 'error'>('checking');
    const [initLog, setInitLog] = useState<string[]>([]);

    // Create Pack State
    const [showCreatePackModal, setShowCreatePackModal] = useState(false);
    const [newPackForm, setNewPackForm] = useState({ id: '', name: '', description: '', author: '' });

    // Stats
    const totalEditablePrompts = prompts.length;
    const totalPacks = packs.length;

    // --- EFFECTS ---
    // Check System Initialization on Mount
    useEffect(() => {
        const checkAndInitSystem = async () => {
            setInitStatus('checking');
            try {
                const configRef = doc(db, "system_settings", "config");
                const configSnap = await getDoc(configRef);

                if (!configSnap.exists() || configSnap.data()?.isInitialized !== true) {
                    setInitStatus('not_init');
                    setShowInitModal(true);
                } else {
                    setInitStatus('done');
                }
            } catch (e) {
                console.error("Error checking system init:", e);
                setInitStatus('error');
            }
        };
        checkAndInitSystem();
    }, []);

    // Load Packs
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

    // --- AUTO-INIT FUNCTION ---
    const handleAutoInitSystem = async () => {
        setInitStatus('initializing');
        setInitLog(['🚀 Bắt đầu khởi tạo hệ thống...']);

        try {
            // 1. Fetch all local data
            setInitLog(prev => [...prev, '📥 Đang tải dữ liệu từ Local...']);
            const fullRegistry = await RegistryService.fetchFullRegistry();
            const allPrompts = fullRegistry.prompts;
            const allPacks = fullRegistry.packs;

            // 2. Push to Firestore
            setInitLog(prev => [...prev, `📦 Tìm thấy ${allPacks.length} bộ Prompt.`]);
            const batch = writeBatch(db);
            let validCount = 0;

            for (const p of allPacks) {
                if (p.isValid === false) {
                    setInitLog(prev => [...prev, `⚠️ Bỏ qua: ${p.name} (thiếu dữ liệu)`]);
                    continue;
                }

                const pRef = doc(db, "prompt_packs", p.id);
                const pMap: Record<string, any> = {};

                p.prompts.forEach(promptMeta => {
                    const contentObj = allPrompts.find(ap => ap.id === promptMeta.id);
                    if (contentObj) {
                        pMap[`step${promptMeta.stepId}`] = {
                            id: promptMeta.id,
                            name: promptMeta.name,
                            content: contentObj.content
                        };
                    }
                });

                const packPayload = {
                    name: p.name,
                    description: p.description || "",
                    version: p.version,
                    author: p.author,
                    isPublic: true,
                    prompts: pMap,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                batch.set(pRef, packPayload);
                setInitLog(prev => [...prev, `✅ Đã thêm: ${p.name}`]);
                validCount++;
            }

            await batch.commit();
            setInitLog(prev => [...prev, `🔥 Đã tải ${validCount} bộ Prompt lên Cloud.`]);

            // 3. Set system as initialized
            const configRef = doc(db, "system_settings", "config");
            await setDoc(configRef, {
                isInitialized: true,
                defaultPackId: allPacks.length > 0 ? allPacks[0].id : null,
                maintenanceMode: false,
                initializedAt: new Date().toISOString()
            });
            setInitLog(prev => [...prev, '🎉 Khởi tạo thành công! Hệ thống đã sẵn sàng.']);
            setInitStatus('done');

            // Refresh packs (now from Cloud)
            setTimeout(async () => {
                const data = await RegistryService.fetchFullRegistry();
                setPacks(data.packs);
                onUpdatePrompts(data.prompts);
            }, 1000);

        } catch (e: any) {
            console.error(e);
            setInitLog(prev => [...prev, `❌ Lỗi: ${e.message}`]);
            setInitStatus('error');
        }
    };

    // --- CRUD ACTIONS ---
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

    // SAVE PROMPT -> FIRESTORE
    const handleSavePrompt = async () => {
        if (!editingPromptId || !editForm.packId) return;
        setSaveStatus('saving');

        try {
            const packRef = doc(db, "prompt_packs", editForm.packId);
            const stepKey = `step${editForm.stepId}`;

            // Update ONLY the specific step in the prompts map
            await updateDoc(packRef, {
                [`prompts.${stepKey}`]: {
                    id: editingPromptId.startsWith('NEW_') ? `${editForm.packId}-step-${editForm.stepId}` : editingPromptId,
                    name: editForm.name,
                    content: editForm.content
                },
                updatedAt: new Date().toISOString()
            });

            setSaveStatus('saved');
            setInitLog(prev => [...prev, `💾 Đã lưu prompt: ${editForm.name}`]);

            // Refresh data
            setTimeout(async () => {
                const data = await RegistryService.fetchFullRegistry();
                setPacks(data.packs);
                onUpdatePrompts(data.prompts);
                setEditingPromptId(null);
                setSaveStatus('idle');
            }, 500);

        } catch (e: any) {
            console.error(e);
            alert("Lỗi lưu Prompt: " + e.message);
            setSaveStatus('idle');
        }
    };

    // CREATE NEW PACK -> FIRESTORE
    const handleCreatePack = async () => {
        if (!newPackForm.id || !newPackForm.name) {
            alert("Vui lòng nhập ID và Tên cho Pack mới.");
            return;
        }

        try {
            const packId = newPackForm.id.toLowerCase().replace(/\s+/g, '-');
            const packRef = doc(db, "prompt_packs", packId);

            // Create empty pack structure
            const emptyPrompts: Record<string, any> = {};
            for (let i = 1; i <= 6; i++) {
                emptyPrompts[`step${i}`] = {
                    id: `${packId}-step-${i}`,
                    name: `Step ${i} Prompt`,
                    content: `// Prompt cho Bước ${i} - Vui lòng chỉnh sửa nội dung này.`
                };
            }

            await setDoc(packRef, {
                name: newPackForm.name,
                description: newPackForm.description || "",
                author: newPackForm.author || "Admin",
                version: "1.0.0",
                isPublic: true,
                prompts: emptyPrompts,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            alert(`✅ Pack "${newPackForm.name}" đã được tạo!`);
            setShowCreatePackModal(false);
            setNewPackForm({ id: '', name: '', description: '', author: '' });

            // Refresh
            const data = await RegistryService.fetchFullRegistry();
            setPacks(data.packs);
            onUpdatePrompts(data.prompts);

        } catch (e: any) {
            console.error(e);
            alert("Lỗi tạo Pack: " + e.message);
        }
    };

    // DELETE PACK -> FIRESTORE
    const handleDeletePack = async (packId: string, packName: string) => {
        if (!confirm(`🚨 XÁC NHẬN XÓA\n\nBạn có chắc chắn muốn xóa "${packName}"?\n\nHành động này KHÔNG THỂ HOÀN TÁC.`)) return;

        try {
            await deleteDoc(doc(db, "prompt_packs", packId));
            alert(`🗑️ Đã xóa Pack "${packName}".`);

            // Refresh
            const data = await RegistryService.fetchFullRegistry();
            setPacks(data.packs);
            onUpdatePrompts(data.prompts);
            setSelectedPackId(null);

        } catch (e: any) {
            console.error(e);
            alert("Lỗi xóa Pack: " + e.message);
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

            {/* === AUTO-INIT MODAL === */}
            {showInitModal && initStatus !== 'done' && (
                <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-lg flex items-center justify-center p-8">
                    <div className="bg-slate-900 border border-sky-500/30 w-full max-w-xl rounded-2xl shadow-2xl ring-1 ring-white/10 overflow-hidden animate-in zoom-in-95">
                        <div className="bg-gradient-to-r from-sky-600 to-indigo-600 p-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <span className="text-3xl">🚀</span> Khởi tạo Hệ thống Dữ liệu
                            </h2>
                            <p className="text-sky-100/80 text-sm mt-2">Hệ thống chưa được cấu hình. Nhấn nút bên dưới để tự động đẩy toàn bộ dữ liệu Prompt lên Cloud.</p>
                        </div>

                        <div className="p-6">
                            <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs h-48 overflow-y-auto border border-slate-800 custom-scrollbar mb-6">
                                {initLog.length === 0 ? (
                                    <span className="text-slate-600 italic">Nhấn "Bắt đầu" để khởi tạo...</span>
                                ) : (
                                    initLog.map((log, i) => (
                                        <div key={i} className="mb-1 text-slate-300 border-b border-slate-800/50 pb-1 last:border-0">{log}</div>
                                    ))
                                )}
                            </div>

                            <div className="flex gap-4">
                                {initStatus === 'not_init' && (
                                    <button
                                        onClick={handleAutoInitSystem}
                                        className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 transition-all"
                                    >
                                        🔥 Bắt đầu Khởi tạo
                                    </button>
                                )}
                                {initStatus === 'initializing' && (
                                    <button disabled className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl flex items-center justify-center gap-2">
                                        <LoadingSpinnerIcon className="animate-spin w-5 h-5" /> Đang xử lý...
                                    </button>
                                )}
                                {initStatus === 'done' && (
                                    <button
                                        onClick={() => setShowInitModal(false)}
                                        className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl"
                                    >
                                        ✅ Hoàn tất - Đóng
                                    </button>
                                )}
                                {initStatus === 'error' && (
                                    <button
                                        onClick={handleAutoInitSystem}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl"
                                    >
                                        ↻ Thử lại
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowInitModal(false)}
                                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700"
                                >
                                    Để sau
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* === CREATE PACK MODAL === */}
            {showCreatePackModal && (
                <div className="absolute inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-8">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-800">
                            <h2 className="text-xl font-bold text-white">📦 Tạo Prompt Pack Mới</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Pack ID (unique, no spaces)</label>
                                <input
                                    value={newPackForm.id}
                                    onChange={e => setNewPackForm({ ...newPackForm, id: e.target.value })}
                                    placeholder="my-awesome-pack"
                                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-sky-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Tên hiển thị</label>
                                <input
                                    value={newPackForm.name}
                                    onChange={e => setNewPackForm({ ...newPackForm, name: e.target.value })}
                                    placeholder="My Awesome Pack"
                                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-sky-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Mô tả</label>
                                <textarea
                                    value={newPackForm.description}
                                    onChange={e => setNewPackForm({ ...newPackForm, description: e.target.value })}
                                    placeholder="Mô tả ngắn gọn về bộ Prompt này..."
                                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-sky-500 outline-none resize-none h-20"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Tác giả</label>
                                <input
                                    value={newPackForm.author}
                                    onChange={e => setNewPackForm({ ...newPackForm, author: e.target.value })}
                                    placeholder="DMP AI Team"
                                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-sky-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-800 flex gap-4">
                            <button
                                onClick={handleCreatePack}
                                className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl"
                            >
                                ✅ Tạo Pack
                            </button>
                            <button
                                onClick={() => setShowCreatePackModal(false)}
                                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* === MAIN PANEL === */}
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
                            <p className="text-slate-400 text-xs">Full Cloud Management (Firestore)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`px-3 py-1 rounded-full border text-xs font-mono ${initStatus === 'done' ? 'bg-green-950/50 border-green-800 text-green-400' : 'bg-yellow-950/50 border-yellow-800 text-yellow-400'}`}>
                            {initStatus === 'done' ? '☁️ Cloud Synced' : '⚠️ Local Mode'}
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
                        <SidebarItem
                            id="cloud"
                            label="Cloud Sync"
                            icon="☁️"
                            isActive={activeTab === 'cloud'}
                            onClick={() => setActiveTab('cloud')}
                        />

                        <div className="border-t border-slate-800/50 my-4 mx-2"></div>

                        <div className="mb-2 px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</div>
                        <button
                            onClick={() => setShowCreatePackModal(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-green-400 hover:bg-green-900/20 border border-dashed border-green-700/50 hover:border-green-500/50 transition-all"
                        >
                            <span>➕</span>
                            <span>Tạo Pack Mới</span>
                        </button>
                        <button
                            onClick={() => { setShowInitModal(true); setInitStatus('not_init'); setInitLog([]); }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sky-400 hover:bg-sky-900/20 border border-dashed border-sky-700/50 hover:border-sky-500/50 transition-all"
                        >
                            <span>🔄</span>
                            <span>Re-Push Local</span>
                        </button>

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
                        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-sky-900/10 to-transparent pointer-events-none"></div>

                        {/* --- EDIT MODAL (Overlay) --- */}
                        {editingPromptId && (
                            <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                                <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[85%] flex flex-col rounded-2xl shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-200">
                                    <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900 rounded-t-2xl">
                                        <div>
                                            <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                                <span className="text-sky-500">EDIT:</span> {editForm.name}
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1 font-mono">{editingPromptId} • Pack: {editForm.packId}</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={handleSavePrompt}
                                                disabled={saveStatus === 'saving'}
                                                className={`px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all transform active:scale-95
                                                    ${saveStatus === 'saved' ? 'bg-green-600 text-white' : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/20'}`}
                                            >
                                                {saveStatus === 'saving' ? <LoadingSpinnerIcon className="animate-spin w-4 h-4" /> : saveStatus === 'saved' ? <CheckIcon className="w-4 h-4" /> : <SaveIcon className="w-4 h-4" />}
                                                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Lưu vào Cloud'}
                                            </button>
                                            <button onClick={() => setEditingPromptId(null)} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700">Hủy</button>
                                        </div>
                                    </div>

                                    <div className="flex-grow p-6 flex flex-col gap-6 overflow-hidden">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase">Tên Prompt</label>
                                                <input
                                                    value={editForm.name}
                                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                                                    placeholder="Tên prompt thân thiện..."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase">Bước (Step)</label>
                                                <div className="relative">
                                                    <select
                                                        value={editForm.stepId}
                                                        onChange={e => setEditForm({ ...editForm, stepId: Number(e.target.value) })}
                                                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white appearance-none focus:border-sky-500 outline-none cursor-pointer"
                                                    >
                                                        {[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>Step {i}</option>)}
                                                    </select>
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-grow flex flex-col space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase">Nội dung Prompt (System Instruction)</label>
                                            <div className="relative flex-grow group">
                                                <textarea
                                                    value={editForm.content}
                                                    onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                                                    className="w-full h-full bg-slate-950 border border-slate-800 rounded-lg p-5 font-mono text-sm text-slate-300 leading-relaxed custom-scrollbar focus:border-sky-500/50 outline-none resize-none shadow-inner"
                                                    spellCheck={false}
                                                ></textarea>
                                                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-400 text-[10px] px-2 py-1 rounded border border-slate-700 pointer-events-none">
                                                    {editForm.content?.length} ký tự
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
                                                {isLoadingPacks && [1, 2, 3].map(i => (
                                                    <div key={i} className="bg-slate-900/50 rounded-2xl h-48 animate-pulse border border-slate-800"></div>
                                                ))}

                                                {packs.map(pack => (
                                                    <div
                                                        key={pack.id}
                                                        onClick={() => setSelectedPackId(pack.id)}
                                                        className={`group bg-slate-900/80 border hover:border-sky-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-sky-900/20 hover:-translate-y-1 relative overflow-hidden backdrop-blur-sm
                                                        ${pack.isValid === false ? 'border-red-900/50 hover:border-red-500/50' : 'border-slate-800'}`}
                                                    >
                                                        {pack.isValid !== false ? (
                                                            <div className="absolute -right-10 -top-10 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all"></div>
                                                        ) : (
                                                            <div className="absolute -right-10 -top-10 w-32 h-32 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all"></div>
                                                        )}

                                                        <div className="relative z-10">
                                                            <div className="flex justify-between items-start mb-4">
                                                                <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/50 px-2 py-1 rounded border border-sky-900/50">v{pack.version}</span>
                                                                {(pack as any).isCloud && <span className="text-[10px] font-bold text-sky-300 bg-sky-900/30 px-2 py-1 rounded">☁️ Cloud</span>}
                                                            </div>
                                                            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-sky-400 transition-colors">{pack.name}</h3>
                                                            <p className="text-sm text-slate-400 line-clamp-2 h-10 mb-6 group-hover:text-slate-300 transition-colors">{pack.description || "No description provided."}</p>

                                                            <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                    {pack.isValid !== false ? (
                                                                        <span className="flex items-center gap-1 text-green-500"><span className="w-2 h-2 rounded-full bg-green-500"></span> Valid</span>
                                                                    ) : (
                                                                        <span className="flex items-center gap-1 text-red-500"><span className="w-2 h-2 rounded-full bg-red-500"></span> Error</span>
                                                                    )}
                                                                    <span>•</span>
                                                                    <span>{pack.prompts?.length || 0}/6</span>
                                                                </div>
                                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <span className="text-xs font-bold text-sky-400">Chi tiết →</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        // DETAILS VIEW
                                        <div className="animate-in slide-in-from-right-8 duration-300">
                                            <button onClick={() => setSelectedPackId(null)} className="mb-8 text-sm text-slate-400 hover:text-white flex items-center gap-2 group transition-colors">
                                                <span className="group-hover:-translate-x-1 transition-transform">←</span> Quay lại
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
                                                                    {(pack as any).isCloud && <span className="text-sky-300 bg-sky-900/30 px-3 py-1 rounded text-sm font-bold">☁️ Cloud Pack</span>}
                                                                </div>
                                                                <p className="text-slate-400 text-lg max-w-2xl">{pack.description}</p>
                                                            </div>
                                                            <div className="flex gap-3">
                                                                <button
                                                                    onClick={() => handleDeletePack(pack.id, pack.name)}
                                                                    className="px-4 py-2 rounded-xl font-medium text-red-400 bg-red-900/20 hover:bg-red-900/40 border border-red-800/50 transition-all flex items-center gap-2"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" /> Xóa Pack
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* STEPS GRID */}
                                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                            {[1, 2, 3, 4, 5, 6].map(stepId => {
                                                                const manifestItem = pack.prompts?.find(p => p.stepId === stepId);
                                                                const promptData = manifestItem ? prompts.find(p => p.id === manifestItem.id) : null;

                                                                return (
                                                                    <div key={stepId} className="relative group">
                                                                        <div className={`absolute -top-4 -right-2 text-8xl font-black select-none z-0 transition-colors pointer-events-none text-slate-800/20 group-hover:text-slate-800/40`}>{stepId}</div>

                                                                        <div className={`relative z-10 h-full p-6 rounded-2xl border transition-all duration-300 flex flex-col bg-slate-900/50 border-slate-700/50 hover:bg-slate-800 hover:border-sky-500/30 hover:shadow-xl`}>
                                                                            <div className="mb-4">
                                                                                <div className="text-[10px] font-bold text-sky-500/80 uppercase tracking-widest mb-2">
                                                                                    {stepId === 1 ? 'Input & Research' : stepId === 2 ? 'Structure' : stepId === 3 ? 'Screenplay' : stepId === 4 ? 'Visual Generation' : stepId === 5 ? 'Audio/TTS' : 'SEO & Meta'}
                                                                                </div>
                                                                                <h3 className="font-bold text-white text-lg mb-1 truncate" title={manifestItem?.name || `Step ${stepId}`}>{manifestItem?.name || `Step ${stepId}`}</h3>
                                                                                <code className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded block w-fit mb-4">{manifestItem?.id || 'N/A'}</code>
                                                                            </div>

                                                                            <div className="mt-auto">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingPromptId(manifestItem?.id || `NEW_${stepId}`);
                                                                                        setEditForm({
                                                                                            id: manifestItem?.id || `NEW_${stepId}`,
                                                                                            packId: pack.id,
                                                                                            stepId: stepId,
                                                                                            name: manifestItem?.name || `Step ${stepId}`,
                                                                                            content: promptData?.content || ''
                                                                                        });
                                                                                        setSaveStatus('idle');
                                                                                    }}
                                                                                    className="w-full py-2.5 bg-slate-800 hover:bg-sky-600/20 hover:text-sky-400 border border-slate-700 hover:border-sky-500/30 rounded-lg text-sm text-slate-300 font-medium transition-all flex items-center justify-center gap-2"
                                                                                >
                                                                                    <EditIcon className="w-4 h-4" /> Chỉnh sửa
                                                                                </button>
                                                                            </div>
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
                                        <h2 className="text-2xl font-bold text-white">Tất cả Prompts (Flat View)</h2>
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
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditPrompt(p)} className="p-2 bg-slate-800 hover:bg-sky-600 text-slate-400 hover:text-white rounded-lg transition-colors shadow-sm"><EditIcon className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- TAB: CLOUD --- */}
                            {activeTab === 'cloud' && (
                                <div className="animate-in fade-in duration-500 max-w-2xl mx-auto">
                                    <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-4xl">☁️</span> Cloud Sync Status
                                    </h2>

                                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-8">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className={`w-4 h-4 rounded-full ${initStatus === 'done' ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`}></div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white">Trạng thái: {initStatus === 'done' ? 'Đã đồng bộ' : 'Chưa đồng bộ'}</h3>
                                                <p className="text-slate-400 text-sm">Hệ thống đang {initStatus === 'done' ? 'đọc từ Cloud (Firestore) ưu tiên.' : 'chạy ở chế độ Local.'}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => { setShowInitModal(true); setInitStatus('not_init'); setInitLog([]); }}
                                                className="py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
                                            >
                                                🔄 Re-Push dữ liệu từ Local
                                            </button>
                                            <button
                                                onClick={() => alert('Tính năng Pull dữ liệu từ Cloud về Local file sẽ được phát triển ở phiên bản sau.')}
                                                className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl border border-slate-700 transition-all"
                                            >
                                                ⬇️ Pull dữ liệu về Local
                                            </button>
                                        </div>
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
