'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserData, UserPermissions, DEFAULT_MEMBER_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS, PromptPackManifest } from '@/lib/types';
import { RegistryService } from '@/lib/prompt-registry/client-registry';

import EditIcon from './icons/EditIcon';
import SaveIcon from './icons/SaveIcon';
import TrashIcon from './icons/TrashIcon';
import CheckIcon from './icons/CheckIcon';
import LoadingSpinnerIcon from './icons/LoadingSpinnerIcon';

interface UserManagementProps {
    onRefresh?: () => void;
}

interface PackPermissionSelectorProps {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    availablePacks: PromptPackManifest[];
}

const PackPermissionSelector: React.FC<PackPermissionSelectorProps> = ({
    selectedIds,
    onChange,
    availablePacks
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredPacks = useMemo(() => {
        if (!searchTerm.trim()) return availablePacks;
        const term = searchTerm.toLowerCase();
        return availablePacks.filter(pack =>
            pack.name.toLowerCase().includes(term) ||
            pack.id.toLowerCase().includes(term)
        );
    }, [availablePacks, searchTerm]);

    const handleTogglePack = (packId: string) => {
        if (packId === '*') {
            onChange(['*']);
            return;
        }
        
        if (selectedIds.includes('*')) {
            onChange([packId]);
            return;
        }

        if (selectedIds.includes(packId)) {
            onChange(selectedIds.filter(id => id !== packId));
        } else {
            onChange([...selectedIds, packId]);
        }
    };

    const handleSelectAll = () => {
        onChange(availablePacks.map(p => p.id));
    };

    const handleSelectNone = () => {
        onChange([]);
    };

    const handleSelectGlobal = () => {
        onChange(['*']);
    };

    const selectedCount = selectedIds.includes('*') ? availablePacks.length : selectedIds.length;

    return (
        <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400">📦 Available Packs</span>
                    <div className="flex gap-2 text-xs">
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="text-green-400 hover:text-green-300 transition-colors"
                        >
                            ✓ All
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                            type="button"
                            onClick={handleSelectNone}
                            className="text-sky-400 hover:text-sky-300 transition-colors"
                        >
                            ✗ None
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                            type="button"
                            onClick={handleSelectGlobal}
                            className="text-purple-400 hover:text-purple-300 transition-colors"
                            title="Global access to all packs"
                        >
                            🌐 All Sites
                        </button>
                    </div>
                </div>
                <input
                    type="text"
                    placeholder="🔍 Search packs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-purple-500 outline-none transition-colors"
                />
            </div>

            <div className="max-h-48 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {filteredPacks.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                        {searchTerm ? 'No packs match your search' : 'No packs available'}
                    </div>
                ) : (
                    filteredPacks.map(pack => (
                        <label
                            key={pack.id}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                selectedIds.includes(pack.id) 
                                    ? 'bg-purple-900/20 hover:bg-purple-900/30' 
                                    : 'hover:bg-slate-800'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(pack.id)}
                                onChange={() => handleTogglePack(pack.id)}
                                className="w-4 h-4 rounded border-slate-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-white text-sm font-medium truncate">
                                    {pack.name}
                                </div>
                                <div className="text-slate-500 text-xs flex items-center gap-2">
                                    <span className="font-mono">{pack.id}</span>
                                    <span>•</span>
                                    <span>v{pack.version}</span>
                                    <span>•</span>
                                    <span>{pack.language === 'en' ? '🇺🇸' : '🇻🇳'}</span>
                                </div>
                            </div>
                            {selectedIds.includes(pack.id) && (
                                <CheckIcon className="w-4 h-4 text-purple-400 flex-shrink-0" />
                            )}
                        </label>
                    ))
                )}
            </div>

            <div className="p-2 border-t border-slate-800 text-xs text-slate-500 text-center bg-slate-900/50">
                {selectedIds.includes('*') 
                    ? '🌐 Global access (all current and future packs)'
                    : `${selectedCount} / ${availablePacks.length} packs selected`
                }
            </div>
        </div>
    );
};

const UserManagement: React.FC<UserManagementProps> = ({ onRefresh }) => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [availablePacks, setAvailablePacks] = useState<PromptPackManifest[]>([]);
    const [isLoadingPacks, setIsLoadingPacks] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<UserData>>({});
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [searchTerm, setSearchTerm] = useState('');

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const usersRef = collection(db, "users");
            const snapshot = await getDocs(usersRef);
            const usersData = snapshot.docs.map(doc => ({
                ...doc.data(),
                uid: doc.id
            } as UserData));
            setUsers(usersData);
        } catch (error) {
            console.error("Error loading users:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAvailablePacks = async () => {
        setIsLoadingPacks(true);
        try {
            const { packs } = await RegistryService.fetchFullRegistry();
            setAvailablePacks(packs);
        } catch (error) {
            console.error("Error loading packs:", error);
        } finally {
            setIsLoadingPacks(false);
        }
    };

    useEffect(() => {
        loadUsers();
        loadAvailablePacks();
    }, []);

    // Filter users by search term
    const filteredUsers = users.filter(user =>
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Handle edit user
    const handleEditUser = (user: UserData) => {
        setEditingUserId(user.uid);
        setEditForm({
            ...user,
            permissions: user.permissions || { ...DEFAULT_MEMBER_PERMISSIONS }
        });
        setSaveStatus('idle');
    };

    // Handle save user
    const handleSaveUser = async () => {
        if (!editingUserId || !editForm) return;
        setSaveStatus('saving');

        try {
            const userRef = doc(db, "users", editingUserId);
            await updateDoc(userRef, {
                role: editForm.role,
                permissions: editForm.permissions,
                credits: editForm.credits,
                updatedAt: new Date().toISOString()
            });

            setSaveStatus('saved');
            await loadUsers();

            setTimeout(() => {
                setEditingUserId(null);
                setSaveStatus('idle');
            }, 800);
        } catch (error: any) {
            console.error("Error saving user:", error);
            alert(`Lỗi lưu user: ${error.message}`);
            setSaveStatus('idle');
        }
    };

    // Handle delete user
    const handleDeleteUser = async (userId: string, email: string) => {
        if (!confirm(`⚠️ Xác nhận xóa user "${email}"?\n\nHành động này chỉ xóa document trong Firestore, không xóa Firebase Auth account.`)) return;

        try {
            await deleteDoc(doc(db, "users", userId));
            await loadUsers();
            alert("✅ Đã xóa user document");
        } catch (error: any) {
            console.error("Error deleting user:", error);
            alert(`Lỗi xóa user: ${error.message}`);
        }
    };

    // Handle toggle permission
    const handleTogglePermission = (key: keyof UserPermissions) => {
        if (!editForm.permissions) return;
        setEditForm({
            ...editForm,
            permissions: {
                ...editForm.permissions,
                [key]: !editForm.permissions[key]
            }
        });
    };

    // Handle update pack access
    const handleUpdatePackAccess = (value: string) => {
        if (!editForm.permissions) return;
        const packs = value === '*' ? ['*'] : value.split(',').map(s => s.trim()).filter(s => s);
        setEditForm({
            ...editForm,
            permissions: {
                ...editForm.permissions,
                allowedPackIds: packs
            }
        });
    };

    // Handle role change
    const handleRoleChange = (newRole: 'admin' | 'member') => {
        setEditForm({
            ...editForm,
            role: newRole,
            permissions: newRole === 'admin' ? { ...DEFAULT_ADMIN_PERMISSIONS } : { ...DEFAULT_MEMBER_PERMISSIONS }
        });
    };

    // Render role badge
    const RoleBadge = ({ role }: { role: string }) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${role === 'admin'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700 text-slate-300'
            }`}>
            {role === 'admin' ? '👑 Admin' : '👤 Member'}
        </span>
    );

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                    👥 User Management
                </span>
                <span className="bg-slate-800 text-slate-400 text-sm px-2 py-1 rounded-full">
                    {users.length}
                </span>
            </h2>

            {/* Search & Actions */}
            <div className="flex flex-wrap gap-4 mb-6">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="🔍 Tìm theo email, tên, role..."
                    className="flex-1 min-w-[250px] bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 outline-none"
                />
                <button
                    onClick={loadUsers}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-2"
                >
                    🔄 Refresh
                </button>
            </div>

            {/* User List */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <LoadingSpinnerIcon className="w-8 h-8 text-purple-500 animate-spin" />
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredUsers.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            {searchTerm ? 'Không tìm thấy user phù hợp' : 'Chưa có user nào'}
                        </div>
                    ) : (
                        filteredUsers.map(user => (
                            <div
                                key={user.uid}
                                className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-purple-500/30 transition-colors"
                            >
                                {editingUserId === user.uid ? (
                                    /* Edit Mode */
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-lg font-bold text-white">{user.email}</h3>
                                                <p className="text-sm text-slate-500">UID: {user.uid}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveUser}
                                                    disabled={saveStatus === 'saving'}
                                                    className={`px-4 py-2 rounded-lg flex items-center gap-2 font-bold transition-all ${saveStatus === 'saved'
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                                                        }`}
                                                >
                                                    {saveStatus === 'saving' ? (
                                                        <LoadingSpinnerIcon className="w-4 h-4 animate-spin" />
                                                    ) : saveStatus === 'saved' ? (
                                                        <CheckIcon className="w-4 h-4" />
                                                    ) : (
                                                        <SaveIcon className="w-4 h-4" />
                                                    )}
                                                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Lưu'}
                                                </button>
                                                <button
                                                    onClick={() => setEditingUserId(null)}
                                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
                                                >
                                                    Hủy
                                                </button>
                                            </div>
                                        </div>

                                        {/* Role Selection */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Role</label>
                                                <select
                                                    value={editForm.role}
                                                    onChange={(e) => handleRoleChange(e.target.value as 'admin' | 'member')}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 outline-none"
                                                >
                                                    <option value="member">👤 Member</option>
                                                    <option value="admin">👑 Admin</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Credits</label>
                                                <input
                                                    type="number"
                                                    value={editForm.credits || 0}
                                                    onChange={(e) => setEditForm({ ...editForm, credits: parseInt(e.target.value) || 0 })}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Permissions */}
                                        <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
                                            <h4 className="text-sm font-bold text-slate-400 mb-3">🔐 Permissions</h4>

                                            <div className="space-y-3">
                                                {/* Batch Mode */}
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <span className="text-slate-300">Batch Mode</span>
                                                    <div
                                                        onClick={() => handleTogglePermission('batchModeEnabled')}
                                                        className={`w-12 h-6 rounded-full transition-colors relative ${editForm.permissions?.batchModeEnabled ? 'bg-green-600' : 'bg-slate-700'
                                                            }`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${editForm.permissions?.batchModeEnabled ? 'left-7' : 'left-1'
                                                            }`} />
                                                    </div>
                                                </label>

                                                {/* Max Concurrent */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-slate-300">Max Concurrent Jobs</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="10"
                                                        value={editForm.permissions?.maxConcurrent || 1}
                                                        onChange={(e) => setEditForm({
                                                            ...editForm,
                                                            permissions: {
                                                                ...editForm.permissions!,
                                                                maxConcurrent: parseInt(e.target.value) || 1
                                                            }
                                                        })}
                                                        className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-center"
                                                    />
                                                </div>

                                                {/* Allowed Packs */}
                                                <div>
                                                    <span className="text-slate-300 text-sm block mb-2">Allowed Packs</span>
                                                    {isLoadingPacks ? (
                                                        <div className="flex items-center justify-center py-4">
                                                            <LoadingSpinnerIcon className="w-6 h-6 text-purple-500 animate-spin" />
                                                            <span className="text-slate-500 text-sm ml-2">Đang tải packs...</span>
                                                        </div>
                                                    ) : (
                                                        <PackPermissionSelector
                                                            selectedIds={editForm.permissions?.allowedPackIds || []}
                                                            onChange={(ids) => setEditForm({
                                                                ...editForm,
                                                                permissions: {
                                                                    ...editForm.permissions!,
                                                                    allowedPackIds: ids
                                                                }
                                                            })}
                                                            availablePacks={availablePacks}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* View Mode */
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                                {user.email?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-white">{user.displayName || user.email}</h3>
                                                    <RoleBadge role={user.role} />
                                                </div>
                                                <p className="text-sm text-slate-500">{user.email}</p>
                                                <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-600">
                                                    <span className="bg-slate-800 px-2 py-0.5 rounded">💰 {user.credits || 0} credits</span>
                                                    <span className={`px-2 py-0.5 rounded ${user.permissions?.batchModeEnabled ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                                        📦 Batch: {user.permissions?.batchModeEnabled ? '✅' : '❌'}
                                                    </span>
                                                    <span className="bg-slate-800 px-2 py-0.5 rounded">⚡ Max: {user.permissions?.maxConcurrent || 1}</span>
                                                </div>
                                                {/* Pack Access Display */}
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {user.permissions?.allowedPackIds?.includes('*') ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded-full">
                                                            🌐 All Packs
                                                        </span>
                                                    ) : user.permissions?.allowedPackIds && user.permissions.allowedPackIds.length > 0 ? (
                                                        user.permissions.allowedPackIds.slice(0, 3).map(packId => {
                                                            const pack = availablePacks.find(p => p.id === packId);
                                                            return (
                                                                <span 
                                                                    key={packId}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full"
                                                                    title={pack?.description || packId}
                                                                >
                                                                    📦 {pack?.name || packId}
                                                                </span>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-xs text-slate-500 italic">No packs assigned</span>
                                                    )}
                                                    {user.permissions?.allowedPackIds && user.permissions.allowedPackIds.length > 3 && (
                                                        <span className="text-xs text-slate-500">+{user.permissions.allowedPackIds.length - 3} more</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditUser(user)}
                                                className="p-2 text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded-lg transition-colors"
                                                title="Chỉnh sửa"
                                            >
                                                <EditIcon className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.uid, user.email)}
                                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                                                title="Xóa"
                                            >
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Stats Footer */}
            <div className="mt-6 pt-6 border-t border-slate-800 grid grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-400">
                        {users.filter(u => u.role === 'admin').length}
                    </div>
                    <div className="text-xs text-slate-500">Admins</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-sky-400">
                        {users.filter(u => u.role === 'member').length}
                    </div>
                    <div className="text-xs text-slate-500">Members</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-400">
                        {users.filter(u => u.permissions?.batchModeEnabled).length}
                    </div>
                    <div className="text-xs text-slate-500">Batch Enabled</div>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
