/**
 * Adapter Factory - Multi-Model Architecture
 * Instantiates appropriate adapters based on model/step configuration
 */

import { ModelAdapter, StepBinding, DEFAULT_STEP_BINDINGS, AIProvider } from './types';
import { getModel, MODELS } from './registry';
import { GeminiAdapter } from './adapters/gemini';
import { OpenAIAdapter, providerKeyManager } from './adapters/openai';

// ============================================================================
// ADAPTER CACHE
// ============================================================================

const adapterCache: Map<string, ModelAdapter> = new Map();

// ============================================================================
// CONFIGURATION STATE
// ============================================================================

interface FactoryConfig {
    safeMode: boolean;
    safeModeModel: string;
    stepBindings: StepBinding[];
    fallbackApiKey: string | null;
}

let config: FactoryConfig = {
    safeMode: false,
    safeModeModel: 'gemini-2.5-flash',
    stepBindings: [...DEFAULT_STEP_BINDINGS],
    fallbackApiKey: null,
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Get adapter for a specific model
 */
export function getAdapter(modelId: string): ModelAdapter {
    // Check cache first
    if (adapterCache.has(modelId)) {
        return adapterCache.get(modelId)!;
    }

    const model = getModel(modelId);
    if (!model) {
        throw new Error(`Unknown model: ${modelId}`);
    }

    let adapter: ModelAdapter;

    switch (model.provider) {
        case 'google':
            adapter = new GeminiAdapter(modelId, config.fallbackApiKey ?? undefined);
            break;
        case 'openai':
        case 'openrouter':
            adapter = new OpenAIAdapter(modelId, model.provider, model.baseUrl);
            break;
        default:
            throw new Error(`Unsupported provider: ${model.provider}`);
    }

    adapterCache.set(modelId, adapter);
    return adapter;
}

/**
 * Get adapter for a specific step (respects Safe Mode)
 */
export function getAdapterForStep(stepId: number): ModelAdapter {
    // Safe Mode: Always use golden baseline
    if (config.safeMode) {
        return getAdapter(config.safeModeModel);
    }

    // Find binding for this step
    const binding = config.stepBindings.find(b => b.stepId === stepId);
    const modelId = binding?.modelId || config.safeModeModel;

    const adapter = getAdapter(modelId);

    // Check availability, fallback if needed
    if (!adapter.isAvailable() && binding?.fallbackModelId) {
        console.warn(`Model ${modelId} not available, using fallback ${binding.fallbackModelId}`);
        return getAdapter(binding.fallbackModelId);
    }

    return adapter;
}

/**
 * Get model ID for a step (respects Safe Mode)
 */
export function getModelIdForStep(stepId: number): string {
    if (config.safeMode) {
        return config.safeModeModel;
    }

    const binding = config.stepBindings.find(b => b.stepId === stepId);
    return binding?.modelId || config.safeModeModel;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Enable/Disable Safe Mode
 */
export function setSafeMode(enabled: boolean): void {
    config.safeMode = enabled;
    console.log(`Safe Mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Check if Safe Mode is enabled
 */
export function isSafeMode(): boolean {
    return config.safeMode;
}

/**
 * Set step binding
 */
export function setStepBinding(stepId: number, modelId: string, fallbackModelId?: string): void {
    const existingIndex = config.stepBindings.findIndex(b => b.stepId === stepId);
    const newBinding: StepBinding = { stepId, modelId, fallbackModelId };

    if (existingIndex >= 0) {
        config.stepBindings[existingIndex] = newBinding;
    } else {
        config.stepBindings.push(newBinding);
    }
}

/**
 * Reset all bindings to default
 */
export function resetBindings(): void {
    config.stepBindings = [...DEFAULT_STEP_BINDINGS];
}

/**
 * Set fallback API key (for Gemini when pool is empty)
 */
export function setFallbackApiKey(apiKey: string): void {
    config.fallbackApiKey = apiKey;

    // Update existing Gemini adapters
    adapterCache.forEach((adapter, modelId) => {
        if (adapter instanceof GeminiAdapter) {
            adapter.setFallbackKey(apiKey);
        }
    });
}

/**
 * Add API keys for a provider
 */
export function addProviderKeys(provider: AIProvider, keys: string[]): void {
    if (provider === 'google') {
        // Use existing apiKeyManager for Gemini
        const { apiKeyManager } = require('@/lib/apiKeyManager');
        keys.forEach(k => apiKeyManager.addKeysFromInput(k));
    } else {
        providerKeyManager.addKeys(provider, keys);
    }
}

/**
 * Get all step bindings (for UI display)
 */
export function getStepBindings(): StepBinding[] {
    return [...config.stepBindings];
}

/**
 * Clear adapter cache (useful when keys change)
 */
export function clearAdapterCache(): void {
    adapterCache.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { MODELS } from './registry';
export { providerKeyManager } from './adapters/openai';
export type { ModelAdapter, StepBinding, AIProvider } from './types';
