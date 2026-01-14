/**
 * Plan Service - Multi-Idea Plan Mode
 * Handles batch generation of script ideas from keywords
 */

import { getNewsAndEvents } from './aiService';
import { setFallbackApiKey } from '@/lib/ai/factory';
import {
    PlanSession,
    PlanIdea,
    PlanConfig,
    PlanProgress,
    DEFAULT_PLAN_CONFIG,
    MAX_KEYWORDS_PER_SESSION
} from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class PlanService {
    private apiKey: string;
    private systemPrompt: string;
    private config: PlanConfig;
    private isCancelled: boolean = false;
    private currentSession: PlanSession | null = null;

    constructor(
        apiKey: string,
        systemPrompt: string,
        config: Partial<PlanConfig> = {}
    ) {
        this.apiKey = apiKey;
        this.systemPrompt = systemPrompt;
        this.config = { ...DEFAULT_PLAN_CONFIG, ...config };
        setFallbackApiKey(apiKey);
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
            id: uuidv4(),
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
                id: uuidv4(),
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

    cancel(): void {
        this.isCancelled = true;
    }

    getCurrentSession(): PlanSession | null {
        return this.currentSession;
    }

    private async processKeyword(keyword: string): Promise<{ topic: string; outline: string }> {
        const topic = await getNewsAndEvents(
            this.apiKey,
            keyword,
            this.systemPrompt
        );

        return {
            topic,
            outline: ''
        };
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
    apiKey: string,
    systemPrompt: string,
    config?: Partial<PlanConfig>
): PlanService {
    return new PlanService(apiKey, systemPrompt, config);
}
