/**
 * AI Model Registry - Multi-Model Architecture
 * Centralized model definitions and capabilities
 */

import { ModelProfile, AIProvider } from './types';

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const MODELS: Record<string, ModelProfile> = {
    // Google Models
    'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        strengths: ['json', 'creative', 'logic', 'fast', 'long-context'],
        supportsSearch: true,
    },
    'gemini-2.0-flash': {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        strengths: ['json', 'fast', 'long-context'],
        supportsSearch: true,
    },

    // OpenAI Models
    'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        strengths: ['json', 'creative', 'logic', 'vision'],
    },
    'gpt-4o-mini': {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        strengths: ['json', 'fast'],
    },

    // OpenRouter Models
    'deepseek-chat': {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'openrouter',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        strengths: ['json', 'logic', 'fast'],
        baseUrl: 'https://openrouter.ai/api/v1',
    },
    'deepseek-r1': {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        provider: 'openrouter',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        strengths: ['logic', 'creative'],
        baseUrl: 'https://openrouter.ai/api/v1',
    },
    'minimax-01': {
        id: 'minimax/minimax-01',
        name: 'Minimax 01',
        provider: 'openrouter',
        contextWindow: 1000000,
        maxOutputTokens: 16384,
        strengths: ['long-context', 'creative'],
        baseUrl: 'https://openrouter.ai/api/v1',
    },
    'minimax-moa-01': {
        id: 'minimax/moa-01',
        name: 'Minimax MoA 01',
        provider: 'openrouter',
        contextWindow: 100000,
        maxOutputTokens: 8192,
        strengths: ['creative', 'fast'],
        baseUrl: 'https://openrouter.ai/api/v1',
    },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get model profile by ID
 */
export function getModel(modelId: string): ModelProfile | undefined {
    return MODELS[modelId];
}

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(provider: AIProvider): ModelProfile[] {
    return Object.values(MODELS).filter(m => m.provider === provider);
}

/**
 * Get models with specific strengths
 */
export function getModelsByStrength(strength: ModelProfile['strengths'][number]): ModelProfile[] {
    return Object.values(MODELS).filter(m => m.strengths.includes(strength));
}

/**
 * Check if model supports Google Search grounding
 */
export function supportsSearch(modelId: string): boolean {
    const model = getModel(modelId);
    return model?.supportsSearch ?? false;
}

/**
 * Get golden baseline model (default for all steps)
 */
export function getGoldenBaseline(): ModelProfile {
    return MODELS['gemini-2.5-flash'];
}

/**
 * List all available model IDs
 */
export function getAllModelIds(): string[] {
    return Object.keys(MODELS);
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: AIProvider): string {
    const names: Record<AIProvider, string> = {
        google: 'Google AI',
        openai: 'OpenAI',
        openrouter: 'OpenRouter',
    };
    return names[provider];
}
