/**
 * Plan Service - Multi-Idea Plan Mode
 * Handles batch generation of script ideas from keywords with concurrent processing
 */

import { getNewsAndEvents } from './aiService';
import { setFallbackApiKey } from '@/lib/ai/factory';
import { apiKeyManager } from '@/lib/apiKeyManager';
import {
    PlanSession,
    PlanIdea,
    PlanConfig,
    PlanProgress,
    DEFAULT_PLAN_CONFIG,
    MAX_KEYWORDS_PER_SESSION
} from '@/lib/types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class PlanService {
    private systemPrompt: string;
    private config: PlanConfig;
    private isCancelled: boolean = false;
    private currentSession: PlanSession | null = null;

    constructor(
        systemPrompt: string,
        config: Partial<PlanConfig> = {}
    ) {
        this.systemPrompt = systemPrompt;
        this.config = { ...DEFAULT_PLAN_CONFIG, ...config };
    }

    async generateIdeas(
        keywords: string[],
        onProgress: (progress: PlanProgress) => void
    ): Promise<PlanSession> {
        this.isCancelled = false;

        const validKeywords = keywords
            .map(k => k.trim())
            .filter(k => k.length > 0)
            .slice(0, MAX_KEYWORDS_PER_SESSION);

        if (validKeywords.length === 0) {
            throw new Error('No valid keywords provided');
        }

        const session: PlanSession = {
            id: this.generateId(),
            keywords: validKeywords,
            ideas: [],
            totalKeywords: validKeywords.length,
            completedCount: 0,
            failedCount: 0,
            status: 'running',
            startedAt: new Date().toISOString()
        };

        this.currentSession = session;

        for (let i = 0; i < validKeywords.length; i++) {
            if (this.isCancelled) {
                session.status = 'cancelled';
                session.completedAt = new Date().toISOString();
                break;
            }

            const keyword = validKeywords[i];
            const idea: PlanIdea = {
                id: this.generateId(),
                keyword,
                topic: '',
                outline: '',
                createdAt: new Date().toISOString(),
                status: 'pending'
            };

            onProgress({
                current: i + 1,
                total: validKeywords.length,
                currentKeyword: keyword,
                status: 'processing',
                completedIdeas: session.ideas
            });

            try {
                const result = await this.processKeyword(keyword);
                idea.topic = result.topic;
                idea.outline = result.outline;
                idea.status = 'completed';
                session.completedCount++;
            } catch (error: any) {
                idea.status = 'failed';
                idea.error = error.message;
                session.failedCount++;
                console.error(`❌ Failed to process keyword "${keyword}":`, error.message);
            }

            session.ideas.push(idea);

            onProgress({
                current: i + 1,
                total: validKeywords.length,
                currentKeyword: keyword,
                status: idea.status === 'completed' ? 'completed' : 'failed',
                completedIdeas: session.ideas,
                lastError: idea.error
            });

            if (i < validKeywords.length - 1) {
                await delay(this.config.delayBetweenKeywords);
            }
        }

        session.status = session.status === 'cancelled' ? 'cancelled' : 'completed';
        session.completedAt = new Date().toISOString();
        this.currentSession = session;

        return session;
    }

    async generateIdeasConcurrent(
        keywords: string[],
        maxConcurrent: number,
        delayBetweenRequests: number,
        onProgress: (progress: PlanProgress) => void
    ): Promise<PlanSession> {
        this.isCancelled = false;

        const validKeywords = keywords
            .map(k => k.trim())
            .filter(k => k.length > 0)
            .slice(0, MAX_KEYWORDS_PER_SESSION);

        if (validKeywords.length === 0) {
            throw new Error('No valid keywords provided');
        }

        if (maxConcurrent < 1) {
            throw new Error('maxConcurrent must be at least 1');
        }

        const session: PlanSession = {
            id: this.generateId(),
            keywords: validKeywords,
            ideas: [],
            totalKeywords: validKeywords.length,
            completedCount: 0,
            failedCount: 0,
            status: 'running',
            startedAt: new Date().toISOString()
        };

        this.currentSession = session;

        // Split keywords into chunks for concurrent processing
        const chunks: string[][] = [];
        for (let i = 0; i < validKeywords.length; i += maxConcurrent) {
            chunks.push(validKeywords.slice(i, i + maxConcurrent));
        }

        // Process each chunk concurrently
        for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
            if (this.isCancelled) {
                session.status = 'cancelled';
                session.completedAt = new Date().toISOString();
                break;
            }

            const chunk = chunks[chunkIdx];
            
            // Process all keywords in current chunk concurrently
            const chunkPromises = chunk.map(async (keyword, idx) => {
                const idea: PlanIdea = {
                    id: this.generateId(),
                    keyword,
                    topic: '',
                    outline: '',
                    createdAt: new Date().toISOString(),
                    status: 'pending'
                };

                const globalIndex = chunkIdx * maxConcurrent + idx;

                onProgress({
                    current: globalIndex + 1,
                    total: validKeywords.length,
                    currentKeyword: keyword,
                    status: 'processing',
                    completedIdeas: session.ideas
                });

                try {
                    // Get next available API key
                    const apiKey = apiKeyManager.getNextKey();
                    if (!apiKey) {
                        throw new Error('No available API key');
                    }

                    const result = await this.processKeywordWithKey(keyword, apiKey);
                    idea.topic = result.topic;
                    idea.outline = result.outline;
                    idea.status = 'completed';
                    session.completedCount++;
                    apiKeyManager.reportSuccess(apiKey);
                } catch (error: any) {
                    idea.status = 'failed';
                    idea.error = error.message;
                    session.failedCount++;
                    
                    // Get the API key that was used (from manager state)
                    const state = apiKeyManager.getState();
                    if (state.keys.length > 0) {
                        const usedKey = state.keys[state.currentIndex]?.key || '';
                        if (usedKey) {
                            apiKeyManager.reportFailure(usedKey, error.message);
                        }
                    }
                    
                    console.error(`❌ Failed to process keyword "${keyword}":`, error.message);
                }

                return idea;
            });

            // Wait for all keywords in chunk to complete
            const chunkResults = await Promise.all(chunkPromises);
            
            // Add completed ideas to session
            session.ideas.push(...chunkResults);

            // Update progress after chunk completes
            const completedInSession = session.ideas.filter(i => i.status === 'completed').length;
            onProgress({
                current: Math.min((chunkIdx + 1) * maxConcurrent, validKeywords.length),
                total: validKeywords.length,
                currentKeyword: session.ideas[session.ideas.length - 1]?.keyword || '',
                status: 'processing',
                completedIdeas: session.ideas,
                lastError: session.ideas[session.ideas.length - 1]?.error
            });

            // Delay between chunks to respect rate limits
            if (chunkIdx < chunks.length - 1 && delayBetweenRequests > 0) {
                await delay(delayBetweenRequests);
            }
        }

        session.status = session.status === 'cancelled' ? 'cancelled' : 'completed';
        session.completedAt = new Date().toISOString();
        this.currentSession = session;

        return session;
    }

    cancel(): void {
        this.isCancelled = true;
    }

    getCurrentSession(): PlanSession | null {
        return this.currentSession;
    }

    private async processKeyword(keyword: string): Promise<{ topic: string; outline: string }> {
        const apiKey = apiKeyManager.getNextKey();
        if (!apiKey) {
            throw new Error('No available API key');
        }

        return this.processKeywordWithKey(keyword, apiKey);
    }

    private async processKeywordWithKey(keyword: string, apiKey: string): Promise<{ topic: string; outline: string }> {
        try {
            setFallbackApiKey(apiKey);
            const topic = await getNewsAndEvents(
                apiKey,
                keyword,
                this.systemPrompt
            );

            return {
                topic,
                outline: ''
            };
        } catch (error: any) {
            // Report failure to key manager
            apiKeyManager.reportFailure(apiKey, error.message);
            throw error;
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    exportToText(session: PlanSession): string {
        const completedIdeas = session.ideas.filter(i => i.status === 'completed');

        if (completedIdeas.length === 0) {
            return 'No ideas generated successfully.\n';
        }

        const lines: string[] = [
            `=== Multi-Idea Plan Export ===`,
            `Generated: ${new Date().toLocaleString('vi-VN')}`,
            `Total: ${completedIdeas.length} ideas`,
            `================================`,
            ''
        ];

        for (const idea of completedIdeas) {
            lines.push(`=== ${idea.keyword} ===`);
            lines.push('');
            lines.push(`📋 Topic/Outline:`);
            lines.push(idea.topic);
            lines.push('');
            lines.push('---');
            lines.push('');
        }

        return lines.join('\n');
    }

    downloadAsFile(session: PlanSession, filename?: string): void {
        const text = this.exportToText(session);
        const defaultFilename = `plan-ideas-${new Date().toISOString().split('T')[0]}.txt`;
        const finalFilename = filename || defaultFilename;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

export function createPlanService(
    systemPrompt: string,
    config?: Partial<PlanConfig>
): PlanService {
    return new PlanService(systemPrompt, config);
}
