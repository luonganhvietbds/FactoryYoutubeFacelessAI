/**
 * Gemini Adapter - Multi-Model Architecture
 * Implementation for Google Gemini models with key rotation
 */

import { GoogleGenAI } from '@google/genai';
import { BaseAdapter } from './base';
import {
    AIRequest,
    AIResponse,
    AIProvider,
    RateLimitError,
    InvalidAPIKeyError,
    AIServiceError,
} from '../types';
import { apiKeyManager } from '@/lib/apiKeyManager';
import { logError } from '@/lib/errorTracker';

// ============================================================================
// GEMINI ADAPTER
// ============================================================================

export class GeminiAdapter extends BaseAdapter {
    readonly modelId: string;
    readonly provider: AIProvider = 'google';

    private fallbackApiKey: string | null = null;

    constructor(modelId: string = 'gemini-2.5-flash', fallbackApiKey?: string) {
        super();
        this.modelId = modelId;
        this.fallbackApiKey = fallbackApiKey ?? null;
    }

    /**
     * Set fallback API key (used when pool is empty)
     */
    setFallbackKey(apiKey: string): void {
        this.fallbackApiKey = apiKey;
    }

    /**
     * Check if adapter is available
     */
    isAvailable(): boolean {
        return apiKeyManager.hasAvailableKey() || !!this.fallbackApiKey;
    }

    /**
     * Generate content with automatic key rotation and retry
     */
    async generateContent(request: AIRequest): Promise<AIResponse> {
        return this.withRetry(
            () => this.doGenerateContent(request),
            (reason, attempt) => {
                logError(0, `Gemini retry: ${reason} (attempt ${attempt})`, 'WARNING');
            }
        );
    }

    /**
     * Internal: Single API call with current key
     */
    private async doGenerateContent(request: AIRequest): Promise<AIResponse> {
        // Get key from pool or fallback
        const currentKey = apiKeyManager.getNextKey() || this.fallbackApiKey;

        if (!currentKey) {
            throw new AIServiceError(
                'Không có API Key khả dụng. Vui lòng thêm key vào pool hoặc nhập trực tiếp.',
                'google',
                this.modelId,
                false
            );
        }

        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });

            const response = await ai.models.generateContent({
                model: this.modelId,
                contents: request.userMessage,
                config: {
                    systemInstruction: request.systemPrompt,
                    ...(request.useSearch && { tools: [{ googleSearch: {} }] }),
                    ...(request.temperature !== undefined && { temperature: request.temperature }),
                    ...(request.maxTokens !== undefined && { maxOutputTokens: request.maxTokens }),
                },
            });

            let textOutput = (response.text ?? '').trim();

            // Handle Google Search grounding
            if (request.useSearch && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                textOutput = this.appendGroundingSources(textOutput, response.candidates[0].groundingMetadata.groundingChunks);
            }

            // Report success
            apiKeyManager.reportSuccess(currentKey);

            return {
                content: textOutput,
                model: this.modelId,
                finishReason: 'stop',
            };

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Report failure
            apiKeyManager.reportFailure(currentKey, errorMessage);

            // Classify error
            if (this.isRateLimitError(errorMessage)) {
                logError(0, `Rate limit hit, rotating key`, 'WARNING', { key: currentKey.slice(0, 8) });
                throw new RateLimitError('google', this.modelId);
            }

            if (this.isInvalidKeyError(errorMessage)) {
                logError(0, `Invalid key detected`, 'ERROR', { key: currentKey.slice(0, 8) });
                throw new InvalidAPIKeyError('google', this.modelId);
            }

            // Other error
            throw new AIServiceError(
                errorMessage,
                'google',
                this.modelId,
                true,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Append grounding sources to output
     */
    private appendGroundingSources(text: string, chunks: any[]): string {
        let sourcesList = '\n\n---\n**Nguồn tham khảo (Sources):**\n';
        let hasSources = false;

        chunks.forEach((chunk: any, index: number) => {
            if (chunk.web?.uri && chunk.web?.title) {
                sourcesList += `${index + 1}. [${chunk.web.title}](${chunk.web.uri})\n`;
                hasSources = true;
            }
        });

        return hasSources ? text + sourcesList : text;
    }

    /**
     * Check if error is rate limit
     */
    private isRateLimitError(message: string): boolean {
        const lower = message.toLowerCase();
        return (
            message.includes('429') ||
            lower.includes('rate limit') ||
            lower.includes('quota') ||
            lower.includes('resource exhausted')
        );
    }

    /**
     * Check if error is invalid API key
     */
    private isInvalidKeyError(message: string): boolean {
        const lower = message.toLowerCase();
        return (
            message.includes('401') ||
            message.includes('403') ||
            lower.includes('api key not valid') ||
            lower.includes('invalid api key')
        );
    }
}

// ============================================================================
// SINGLETON INSTANCE (for convenience)
// ============================================================================

export const geminiAdapter = new GeminiAdapter('gemini-2.5-flash');
