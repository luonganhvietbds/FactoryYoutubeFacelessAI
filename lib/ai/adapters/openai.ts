/**
 * OpenAI-Compatible Adapter - Multi-Model Architecture
 * Works with OpenAI, DeepSeek, Minimax, and OpenRouter
 */

import { BaseAdapter } from './base';
import {
    AIRequest,
    AIResponse,
    AIProvider,
    RateLimitError,
    InvalidAPIKeyError,
    AIServiceError,
    ProviderKeyPool,
} from '../types';
import { getModel } from '../registry';

// ============================================================================
// API KEY POOL MANAGER (for non-Gemini providers)
// ============================================================================

interface KeyInfo {
    key: string;
    usageCount: number;
    lastError?: string;
    isActive: boolean;
}

class ProviderKeyManager {
    private pools: Map<AIProvider, KeyInfo[]> = new Map();
    private indices: Map<AIProvider, number> = new Map();

    /**
     * Add keys for a provider
     */
    addKeys(provider: AIProvider, keys: string[]): void {
        const existing = this.pools.get(provider) || [];
        const newKeys = keys
            .filter(k => k.trim())
            .filter(k => !existing.some(e => e.key === k))
            .map(k => ({ key: k, usageCount: 0, isActive: true }));

        this.pools.set(provider, [...existing, ...newKeys]);
    }

    /**
     * Get next available key (round-robin)
     */
    getNextKey(provider: AIProvider): string | null {
        const pool = this.pools.get(provider);
        if (!pool || pool.length === 0) return null;

        const activeKeys = pool.filter(k => k.isActive);
        if (activeKeys.length === 0) return null;

        const currentIndex = this.indices.get(provider) || 0;
        const nextIndex = currentIndex % activeKeys.length;
        this.indices.set(provider, nextIndex + 1);

        const keyInfo = activeKeys[nextIndex];
        keyInfo.usageCount++;
        return keyInfo.key;
    }

    /**
     * Report key failure
     */
    reportFailure(provider: AIProvider, key: string, error: string): void {
        const pool = this.pools.get(provider);
        if (!pool) return;

        const keyInfo = pool.find(k => k.key === key);
        if (keyInfo) {
            keyInfo.lastError = error;
            // Deactivate on auth errors
            if (error.includes('401') || error.includes('invalid')) {
                keyInfo.isActive = false;
            }
        }
    }

    /**
     * Check if provider has available keys
     */
    hasKeys(provider: AIProvider): boolean {
        const pool = this.pools.get(provider);
        return !!pool && pool.some(k => k.isActive);
    }

    /**
     * Clear keys for provider
     */
    clearKeys(provider: AIProvider): void {
        this.pools.delete(provider);
        this.indices.delete(provider);
    }

    /**
     * Load from localStorage
     */
    loadFromStorage(): void {
        if (typeof window === 'undefined') return;

        const providers: AIProvider[] = ['openai', 'openrouter'];
        providers.forEach(provider => {
            const stored = localStorage.getItem(`ai_keys_${provider}`);
            if (stored) {
                try {
                    const keys = JSON.parse(stored) as string[];
                    this.addKeys(provider, keys);
                } catch (e) {
                    console.error(`Failed to load ${provider} keys:`, e);
                }
            }
        });
    }

    /**
     * Save to localStorage
     */
    saveToStorage(provider: AIProvider): void {
        if (typeof window === 'undefined') return;

        const pool = this.pools.get(provider);
        if (pool) {
            const keys = pool.map(k => k.key);
            localStorage.setItem(`ai_keys_${provider}`, JSON.stringify(keys));
        }
    }
}

// Singleton instance
export const providerKeyManager = new ProviderKeyManager();

// ============================================================================
// OPENAI-COMPATIBLE ADAPTER
// ============================================================================

export class OpenAIAdapter extends BaseAdapter {
    readonly modelId: string;
    readonly provider: AIProvider;

    private baseUrl: string;
    private fallbackApiKey: string | null = null;

    constructor(modelId: string, provider: AIProvider = 'openai', baseUrl?: string) {
        super();
        this.modelId = modelId;
        this.provider = provider;

        // Set base URL based on provider or custom
        if (baseUrl) {
            this.baseUrl = baseUrl;
        } else if (provider === 'openrouter') {
            this.baseUrl = 'https://openrouter.ai/api/v1';
        } else {
            this.baseUrl = 'https://api.openai.com/v1';
        }
    }

    /**
     * Set fallback API key
     */
    setFallbackKey(apiKey: string): void {
        this.fallbackApiKey = apiKey;
    }

    /**
     * Check if adapter is available
     */
    isAvailable(): boolean {
        return providerKeyManager.hasKeys(this.provider) || !!this.fallbackApiKey;
    }

    /**
     * Generate content
     */
    async generateContent(request: AIRequest): Promise<AIResponse> {
        return this.withRetry(
            () => this.doGenerateContent(request),
            (reason, attempt) => {
                console.warn(`${this.provider} retry: ${reason} (attempt ${attempt})`);
            }
        );
    }

    /**
     * Internal: Single API call
     */
    private async doGenerateContent(request: AIRequest): Promise<AIResponse> {
        const apiKey = providerKeyManager.getNextKey(this.provider) || this.fallbackApiKey;

        if (!apiKey) {
            throw new AIServiceError(
                `Không có API Key cho ${this.provider}. Vui lòng thêm key.`,
                this.provider,
                this.modelId,
                false
            );
        }

        // Get actual model ID (may differ for OpenRouter)
        const modelProfile = getModel(this.modelId);
        const actualModelId = modelProfile?.id || this.modelId;

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    ...(this.provider === 'openrouter' && {
                        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
                        'X-Title': 'AI Script Factory',
                    }),
                },
                body: JSON.stringify({
                    model: actualModelId,
                    messages: [
                        { role: 'system', content: request.systemPrompt },
                        { role: 'user', content: request.userMessage },
                    ],
                    temperature: request.temperature ?? 0.7,
                    max_tokens: request.maxTokens ?? 4096,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `HTTP ${response.status}`;

                // Classify error
                if (response.status === 429) {
                    providerKeyManager.reportFailure(this.provider, apiKey, 'rate_limit');
                    throw new RateLimitError(this.provider, this.modelId);
                }

                if (response.status === 401 || response.status === 403) {
                    providerKeyManager.reportFailure(this.provider, apiKey, 'invalid_key');
                    throw new InvalidAPIKeyError(this.provider, this.modelId);
                }

                throw new AIServiceError(
                    errorMessage,
                    this.provider,
                    this.modelId,
                    response.status >= 500
                );
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';

            return {
                content: content.trim(),
                model: this.modelId,
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens,
                } : undefined,
                finishReason: data.choices?.[0]?.finish_reason || 'stop',
            };

        } catch (error) {
            if (error instanceof AIServiceError) throw error;

            const message = error instanceof Error ? error.message : String(error);
            throw new AIServiceError(
                message,
                this.provider,
                this.modelId,
                true,
                error instanceof Error ? error : undefined
            );
        }
    }
}

// ============================================================================
// FACTORY HELPERS
// ============================================================================

/**
 * Create adapter for DeepSeek models via OpenRouter
 */
export function createDeepSeekAdapter(modelId: string = 'deepseek/deepseek-chat'): OpenAIAdapter {
    return new OpenAIAdapter(modelId, 'openrouter');
}

/**
 * Create adapter for Minimax models via OpenRouter
 */
export function createMinimaxAdapter(modelId: string = 'minimax/minimax-01'): OpenAIAdapter {
    return new OpenAIAdapter(modelId, 'openrouter');
}

/**
 * Create generic OpenAI adapter
 */
export function createOpenAIAdapter(modelId: string = 'gpt-4o'): OpenAIAdapter {
    return new OpenAIAdapter(modelId, 'openai');
}
