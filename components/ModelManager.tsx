'use client';

import React, { useState, useEffect } from 'react';
import {
    MODELS,
    getStepBindings,
    setStepBinding,
    setSafeMode,
    isSafeMode,
    addProviderKeys,
    resetBindings,
} from '@/lib/ai/factory';
import { providerKeyManager } from '@/lib/ai/adapters/openai';
import { apiKeyManager } from '@/lib/apiKeyManager';
import { AIProvider, StepBinding, ModelProfile } from '@/lib/ai/types';
import CheckIcon from './icons/CheckIcon';
import SaveIcon from './icons/SaveIcon';

// ============================================================================
// MODEL MANAGER COMPONENT
// ============================================================================

const ModelManager: React.FC = () => {
    // State
    const [safeModeEnabled, setSafeModeEnabled] = useState(false);
    const [stepBindings, setLocalBindings] = useState<StepBinding[]>([]);
    const [openRouterKey, setOpenRouterKey] = useState('');
    const [openAIKey, setOpenAIKey] = useState('');
    const [keySaveStatus, setKeySaveStatus] = useState<'idle' | 'saved'>('idle');

    // Load state on mount
    useEffect(() => {
        setSafeModeEnabled(isSafeMode());
        setLocalBindings(getStepBindings());

        // Load saved keys from localStorage
        const savedOpenRouter = localStorage.getItem('openrouter_api_key');
        const savedOpenAI = localStorage.getItem('openai_api_key');
        if (savedOpenRouter) setOpenRouterKey(savedOpenRouter);
        if (savedOpenAI) setOpenAIKey(savedOpenAI);
    }, []);

    // Toggle Safe Mode
    const handleToggleSafeMode = () => {
        const newValue = !safeModeEnabled;
        setSafeModeEnabled(newValue);
        setSafeMode(newValue);
        localStorage.setItem('ai_safe_mode', String(newValue));
    };

    // Update step binding
    const handleBindingChange = (stepId: number, modelId: string) => {
        setStepBinding(stepId, modelId);
        setLocalBindings(getStepBindings());
        localStorage.setItem('ai_step_bindings', JSON.stringify(getStepBindings()));
    };

    // Save provider keys
    const handleSaveKeys = () => {
        if (openRouterKey.trim()) {
            localStorage.setItem('openrouter_api_key', openRouterKey.trim());
            providerKeyManager.addKeys('openrouter', [openRouterKey.trim()]);
        }
        if (openAIKey.trim()) {
            localStorage.setItem('openai_api_key', openAIKey.trim());
            providerKeyManager.addKeys('openai', [openAIKey.trim()]);
        }
        setKeySaveStatus('saved');
        setTimeout(() => setKeySaveStatus('idle'), 2000);
    };

    // Reset to defaults
    const handleResetBindings = () => {
        if (confirm('Reset tất cả Model Bindings về mặc định?')) {
            resetBindings();
            setLocalBindings(getStepBindings());
            localStorage.removeItem('ai_step_bindings');
        }
    };

    // Get model options grouped by provider
    const modelsByProvider = Object.values(MODELS).reduce((acc, model) => {
        if (!acc[model.provider]) acc[model.provider] = [];
        acc[model.provider].push(model);
        return acc;
    }, {} as Record<AIProvider, ModelProfile[]>);

    // Step labels
    const stepLabels: Record<number, string> = {
        1: '🔍 Research (News)',
        2: '📝 Outline',
        3: '🎬 Script',
        4: '🎨 Prompts',
        5: '🎙️ Voiceover',
        6: '📋 Metadata',
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                        🤖 Model Management
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Configure AI models for each generation step</p>
                </div>
                <button
                    onClick={handleResetBindings}
                    className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg border border-slate-700 transition-colors"
                >
                    ↻ Reset Defaults
                </button>
            </div>

            {/* Safe Mode Toggle */}
            <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-700/50 rounded-2xl p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-amber-300 flex items-center gap-2">
                            🛡️ Safe Mode
                        </h3>
                        <p className="text-amber-200/70 text-sm mt-1">
                            Override all steps to use <span className="font-mono bg-amber-950 px-1 rounded">gemini-2.5-flash</span> (Golden Baseline)
                        </p>
                    </div>
                    <button
                        onClick={handleToggleSafeMode}
                        className={`relative w-16 h-8 rounded-full transition-colors duration-300 ${safeModeEnabled ? 'bg-amber-500' : 'bg-slate-700'
                            }`}
                    >
                        <span
                            className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow-lg transition-transform duration-300 ${safeModeEnabled ? 'translate-x-8' : 'translate-x-0'
                                }`}
                        />
                    </button>
                </div>
                {safeModeEnabled && (
                    <div className="mt-4 p-3 bg-amber-950/50 rounded-lg border border-amber-800/50 text-amber-200 text-xs">
                        ⚠️ Safe Mode is <strong>ENABLED</strong>. All steps will use Gemini 2.5 Flash regardless of bindings below.
                    </div>
                )}
            </div>

            {/* Step Bindings */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-800 bg-slate-900">
                    <h3 className="font-bold text-white">Step-to-Model Bindings</h3>
                    <p className="text-slate-500 text-xs mt-1">Configure which model to use for each generation step</p>
                </div>
                <div className="divide-y divide-slate-800/50">
                    {[1, 2, 3, 4, 5, 6].map(stepId => {
                        const binding = stepBindings.find(b => b.stepId === stepId);
                        const isSearchStep = stepId === 1;

                        return (
                            <div key={stepId} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <span className="text-2xl w-10">{stepLabels[stepId].split(' ')[0]}</span>
                                    <div>
                                        <div className="text-sm font-medium text-white">{stepLabels[stepId].split(' ').slice(1).join(' ')}</div>
                                        <div className="text-xs text-slate-500">Step {stepId}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {isSearchStep && (
                                        <span className="text-[10px] bg-sky-900/50 text-sky-400 px-2 py-1 rounded border border-sky-800/50">
                                            🔎 Requires Search
                                        </span>
                                    )}
                                    <select
                                        value={binding?.modelId || 'gemini-2.5-flash'}
                                        onChange={e => handleBindingChange(stepId, e.target.value)}
                                        disabled={safeModeEnabled}
                                        className={`bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 outline-none min-w-[200px] ${safeModeEnabled ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                    >
                                        {Object.entries(modelsByProvider).map(([provider, models]) => (
                                            <optgroup key={provider} label={provider.toUpperCase()}>
                                                {models.map(model => (
                                                    <option
                                                        key={model.id}
                                                        value={model.id}
                                                        disabled={isSearchStep && !model.supportsSearch}
                                                    >
                                                        {model.name} {isSearchStep && !model.supportsSearch ? '(No Search)' : ''}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Provider API Keys */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-800 bg-slate-900">
                    <h3 className="font-bold text-white">Provider API Keys</h3>
                    <p className="text-slate-500 text-xs mt-1">Add API keys for non-Gemini providers (OpenAI, OpenRouter)</p>
                </div>
                <div className="p-6 space-y-6">
                    {/* OpenRouter */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <span className="text-lg">🌐</span> OpenRouter API Key
                            <span className="text-[10px] text-slate-600 font-normal">(DeepSeek, Minimax, etc.)</span>
                        </label>
                        <input
                            type="password"
                            value={openRouterKey}
                            onChange={e => setOpenRouterKey(e.target.value)}
                            placeholder="sk-or-v1-..."
                            className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:border-purple-500 outline-none font-mono"
                        />
                    </div>

                    {/* OpenAI */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <span className="text-lg">🤖</span> OpenAI API Key
                            <span className="text-[10px] text-slate-600 font-normal">(GPT-4o, etc.)</span>
                        </label>
                        <input
                            type="password"
                            value={openAIKey}
                            onChange={e => setOpenAIKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:border-purple-500 outline-none font-mono"
                        />
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={handleSaveKeys}
                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${keySaveStatus === 'saved'
                                ? 'bg-green-600 text-white'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                            }`}
                    >
                        {keySaveStatus === 'saved' ? (
                            <>
                                <CheckIcon className="w-5 h-5" />
                                Keys Saved!
                            </>
                        ) : (
                            <>
                                <SaveIcon className="w-5 h-5" />
                                Save Provider Keys
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Available Models Reference */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-800 bg-slate-900">
                    <h3 className="font-bold text-white">Available Models</h3>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.values(MODELS).map(model => (
                            <div
                                key={model.id}
                                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-purple-500/50 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium text-white text-sm">{model.name}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded ${model.provider === 'google' ? 'bg-blue-900/50 text-blue-400' :
                                            model.provider === 'openai' ? 'bg-green-900/50 text-green-400' :
                                                'bg-purple-900/50 text-purple-400'
                                        }`}>
                                        {model.provider}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {model.strengths.map(s => (
                                        <span key={s} className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded">
                                            {s}
                                        </span>
                                    ))}
                                    {model.supportsSearch && (
                                        <span className="text-[9px] bg-sky-900/50 text-sky-400 px-1.5 py-0.5 rounded">
                                            🔎 search
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-slate-600 mt-2 font-mono">
                                    Context: {(model.contextWindow / 1000).toFixed(0)}K
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModelManager;
