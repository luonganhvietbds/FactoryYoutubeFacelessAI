/**
 * Error Tracker Module for AI Script Factory
 * 
 * Provides detailed error tracking with:
 * - Step identification (Step 2, 3, 4, 5, 6)
 * - Batch identification (Scene ranges)
 * - Error levels (INFO, WARNING, ERROR, CRITICAL)
 * - Context data for debugging
 */

export type ErrorLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface ErrorDetail {
    timestamp: number;
    level: ErrorLevel;
    step: number;
    stepName?: string;
    batchIndex?: number;
    sceneRange?: string;
    message: string;
    context?: Record<string, any>;
}

export interface ErrorSummary {
    totalErrors: number;
    byLevel: Record<ErrorLevel, number>;
    byStep: Record<number, number>;
    lastError: ErrorDetail | null;
}

const STEP_NAMES: Record<number, string> = {
    1: 'Research & Ideas',
    2: 'Create Outline',
    3: 'Write Script',
    4: 'Extract Prompts',
    5: 'Voice Over',
    6: 'Metadata'
};

const MAX_HISTORY = 100;

class ErrorTrackerClass {
    private errors: ErrorDetail[] = [];
    private subscribers: ((errors: ErrorDetail[]) => void)[] = [];

    /**
     * Log an error with full context
     */
    log(detail: Omit<ErrorDetail, 'timestamp' | 'stepName'>): void {
        const fullDetail: ErrorDetail = {
            ...detail,
            timestamp: Date.now(),
            stepName: STEP_NAMES[detail.step] || `Step ${detail.step}`
        };

        this.errors.push(fullDetail);

        // Keep history under limit
        if (this.errors.length > MAX_HISTORY) {
            this.errors = this.errors.slice(-MAX_HISTORY);
        }

        // Log to console with color
        this.logToConsole(fullDetail);

        // Notify subscribers
        this.notifySubscribers();
    }

    /**
     * Log to console with color-coded levels
     */
    private logToConsole(detail: ErrorDetail): void {
        const levelStyles: Record<ErrorLevel, string> = {
            'INFO': 'color: #38bdf8; font-weight: bold;',     // sky-400
            'WARNING': 'color: #fbbf24; font-weight: bold;',  // amber-400
            'ERROR': 'color: #f87171; font-weight: bold;',    // red-400
            'CRITICAL': 'color: #ffffff; background: #dc2626; font-weight: bold; padding: 2px 6px;' // red-600 bg
        };

        const prefix = `[${detail.level}] Step ${detail.step}`;
        const sceneInfo = detail.sceneRange ? ` (Scenes ${detail.sceneRange})` : '';

        console.log(
            `%c${prefix}${sceneInfo}`,
            levelStyles[detail.level],
            detail.message,
            detail.context || ''
        );
    }

    /**
     * Get last N errors
     */
    getLastN(n: number = 10): ErrorDetail[] {
        return this.errors.slice(-n);
    }

    /**
     * Get errors for a specific step
     */
    getByStep(step: number): ErrorDetail[] {
        return this.errors.filter(e => e.step === step);
    }

    /**
     * Get summary statistics
     */
    getSummary(): ErrorSummary {
        const byLevel: Record<ErrorLevel, number> = {
            'INFO': 0, 'WARNING': 0, 'ERROR': 0, 'CRITICAL': 0
        };
        const byStep: Record<number, number> = {};

        this.errors.forEach(e => {
            byLevel[e.level]++;
            byStep[e.step] = (byStep[e.step] || 0) + 1;
        });

        return {
            totalErrors: this.errors.length,
            byLevel,
            byStep,
            lastError: this.errors.length > 0 ? this.errors[this.errors.length - 1] : null
        };
    }

    /**
     * Format errors for UI display
     */
    formatForDisplay(errors?: ErrorDetail[]): string {
        const list = errors || this.getLastN(5);

        if (list.length === 0) return '(No errors recorded)';

        return list.map(e => {
            const time = new Date(e.timestamp).toLocaleTimeString('vi-VN');
            const sceneInfo = e.sceneRange ? ` [Scene ${e.sceneRange}]` : '';
            return `[${time}] ${e.level} - ${e.stepName}${sceneInfo}: ${e.message}`;
        }).join('\n');
    }

    /**
     * Format single error for job display
     */
    formatSingleError(step: number, batchIndex?: number, sceneRange?: string, details?: string[]): string {
        const stepName = STEP_NAMES[step] || `Step ${step}`;
        const batchInfo = batchIndex !== undefined ? `Batch ${batchIndex + 1}` : '';
        const sceneInfo = sceneRange ? `Scene ${sceneRange}` : '';

        let message = `❌ LỖI TẠI: ${stepName}`;
        if (batchInfo) message += ` | ${batchInfo}`;
        if (sceneInfo) message += ` | ${sceneInfo}`;
        message += '\n';

        if (details && details.length > 0) {
            message += '📋 CHI TIẾT:\n';
            details.forEach((d, i) => {
                message += `   ${i + 1}. ${d}\n`;
            });
        }

        return message;
    }

    /**
     * Clear all errors
     */
    clear(): void {
        this.errors = [];
        this.notifySubscribers();
    }

    /**
     * Subscribe to error changes
     */
    subscribe(callback: (errors: ErrorDetail[]) => void): () => void {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(s => s !== callback);
        };
    }

    private notifySubscribers(): void {
        this.subscribers.forEach(cb => cb(this.errors));
    }
}

// Singleton instance
export const errorTracker = new ErrorTrackerClass();

// Helper function for quick logging
export const logError = (
    step: number,
    message: string,
    level: ErrorLevel = 'ERROR',
    context?: Record<string, any>
): void => {
    errorTracker.log({ step, message, level, context });
};

export default errorTracker;
