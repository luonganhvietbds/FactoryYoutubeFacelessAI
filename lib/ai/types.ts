/**
 * AI Abstraction Types - Multi-Model Architecture
 * Core interfaces for model-agnostic AI service layer
 */

// ============================================================================
// PROVIDER DEFINITIONS
// ============================================================================

export type AIProvider = 'google' | 'openai' | 'openrouter';

// ============================================================================
// MODEL PROFILES
// ============================================================================

export interface ModelProfile {
    id: string;
    name: string;
    provider: AIProvider;
    contextWindow: number;
    maxOutputTokens?: number;
    strengths: ModelStrength[];
    supportsSearch?: boolean; // Google Search grounding
    baseUrl?: string; // For OpenRouter/custom endpoints
}

export type ModelStrength =
    | 'json'        // Reliable JSON generation
    | 'creative'    // Creative writing
    | 'logic'       // Logical reasoning
    | 'fast'        // Speed optimized
    | 'vision'      // Image understanding
    | 'long-context'; // Large context handling

// ============================================================================
// REQUEST / RESPONSE
// ============================================================================

export interface AIRequest {
    systemPrompt: string;
    userMessage: string;
    useSearch?: boolean; // For Step 1 (Google grounding)
    temperature?: number;
    maxTokens?: number;
}

export interface AIResponse {
    content: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason?: 'stop' | 'length' | 'content_filter' | 'error';
}

// ============================================================================
// MODEL ADAPTER INTERFACE
// ============================================================================

export interface ModelAdapter {
    readonly modelId: string;
    readonly provider: AIProvider;

    /**
     * Generate text content
     */
    generateContent(request: AIRequest): Promise<AIResponse>;

    /**
     * Generate and parse JSON response
     * @throws if JSON parsing fails after retries
     */
    generateJSON<T>(
        request: AIRequest,
        validator?: (raw: unknown) => T
    ): Promise<T>;

    /**
     * Check if the adapter is available (has valid API key)
     */
    isAvailable(): boolean;
}

// ============================================================================
// STEP BINDING CONFIGURATION
// ============================================================================

export interface StepBinding {
    stepId: number;
    modelId: string;
    fallbackModelId?: string; // Used if primary fails
}

export interface StepBindingConfig {
    bindings: StepBinding[];
    safeMode: boolean; // Override all to gemini-2.5-flash
    safeModeModel: string; // Default: 'gemini-2.5-flash'
}

export const DEFAULT_STEP_BINDINGS: StepBinding[] = [
    { stepId: 1, modelId: 'gemini-2.5-flash' }, // News - requires Search
    { stepId: 2, modelId: 'gemini-2.5-flash' }, // Outline - logic heavy
    { stepId: 3, modelId: 'gemini-2.5-flash' }, // Script - golden baseline
    { stepId: 4, modelId: 'gemini-2.5-flash', fallbackModelId: 'gpt-4o' }, // Prompts
    { stepId: 5, modelId: 'gemini-2.5-flash' }, // Voiceover
    { stepId: 6, modelId: 'gemini-2.5-flash' }, // Metadata
];

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
};

// ============================================================================
// API KEY POOL (Extended for multi-provider)
// ============================================================================

export interface ProviderKeyPool {
    provider: AIProvider;
    keys: string[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class AIServiceError extends Error {
    constructor(
        message: string,
        public readonly provider: AIProvider,
        public readonly modelId: string,
        public readonly isRetryable: boolean = false,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'AIServiceError';
    }
}

export class RateLimitError extends AIServiceError {
    constructor(provider: AIProvider, modelId: string, retryAfterMs?: number) {
        super(`Rate limited by ${provider}`, provider, modelId, true);
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
    retryAfterMs?: number;
}

export class InvalidAPIKeyError extends AIServiceError {
    constructor(provider: AIProvider, modelId: string) {
        super(`Invalid API key for ${provider}`, provider, modelId, false);
        this.name = 'InvalidAPIKeyError';
    }
}
