/**
 * Base Adapter - Multi-Model Architecture
 * Abstract class with shared retry logic and error handling
 */

import {
    ModelAdapter,
    AIRequest,
    AIResponse,
    AIProvider,
    RetryConfig,
    DEFAULT_RETRY_CONFIG,
    AIServiceError,
    RateLimitError,
} from '../types';

// ============================================================================
// ABSTRACT BASE ADAPTER
// ============================================================================

export abstract class BaseAdapter implements ModelAdapter {
    abstract readonly modelId: string;
    abstract readonly provider: AIProvider;

    protected retryConfig: RetryConfig;

    constructor(config?: Partial<RetryConfig>) {
        this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    }

    // Abstract methods that subclasses must implement
    abstract generateContent(request: AIRequest): Promise<AIResponse>;
    abstract isAvailable(): boolean;

    /**
     * Generate and parse JSON response with validation
     */
    async generateJSON<T>(
        request: AIRequest,
        validator?: (raw: unknown) => T
    ): Promise<T> {
        // Append JSON instruction to system prompt
        const jsonRequest: AIRequest = {
            ...request,
            systemPrompt: `${request.systemPrompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanations.`,
        };

        const response = await this.generateContent(jsonRequest);
        const parsed = this.parseJSON(response.content);

        if (validator) {
            return validator(parsed);
        }

        return parsed as T;
    }

    /**
     * Parse JSON from potentially messy model output
     */
    protected parseJSON(text: string): unknown {
        let content = text;

        // Remove markdown code blocks
        content = content.replace(/^```json\n?/i, '');
        content = content.replace(/^```\n?/i, '');
        content = content.replace(/\n?```$/i, '');
        content = content.trim();

        // Find JSON object or array
        const match = content.match(/[\[\{][\s\S]*[\]\}]/);
        if (match) {
            content = match[0];
        }

        try {
            return JSON.parse(content);
        } catch (e) {
            // Try fixing common issues
            content = this.fixJSON(content);
            return JSON.parse(content);
        }
    }

    /**
     * Fix common JSON issues from LLMs
     */
    protected fixJSON(json: string): string {
        let fixed = json;
        // Remove trailing commas
        fixed = fixed.replace(/,(\s*[\]\}])/g, '$1');
        return fixed;
    }

    /**
     * Execute with retry logic
     */
    protected async withRetry<T>(
        fn: () => Promise<T>,
        onRetry?: (reason: string, attempt: number) => void
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Check if retryable
                if (!this.isRetryableError(lastError)) {
                    throw lastError;
                }

                // Last attempt failed
                if (attempt === this.retryConfig.maxRetries) {
                    break;
                }

                // Calculate delay with exponential backoff
                const delay = Math.min(
                    this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
                    this.retryConfig.maxDelayMs
                );

                onRetry?.(lastError.message, attempt + 1);
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Check if error is retryable
     */
    protected isRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();

        // Rate limits are retryable
        if (error instanceof RateLimitError) return true;

        // Network errors
        if (message.includes('network') || message.includes('timeout')) return true;

        // Server errors (5xx)
        if (message.includes('500') || message.includes('502') ||
            message.includes('503') || message.includes('504')) return true;

        // Overloaded
        if (message.includes('overloaded') || message.includes('capacity')) return true;

        // AI-specific retryable errors
        if (error instanceof AIServiceError) return error.isRetryable;

        return false;
    }

    /**
     * Sleep helper
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract error message from various error types
     */
    protected extractErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        return 'Unknown error';
    }
}
