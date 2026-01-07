/**
 * API Key Manager - Quản lý pool API Keys với rotation và status tracking
 * Phase 9.1: Scalable API Key Management
 */

export type KeyStatus = 'active' | 'rate_limited' | 'dead' | 'checking' | 'unknown';

export interface ApiKeyInfo {
    key: string;
    status: KeyStatus;
    usageCount: number;
    lastUsed: number;
    errorCount: number;
    lastError?: string;
    rateLimitResetTime?: number;
}

export interface KeyManagerState {
    keys: ApiKeyInfo[];
    currentIndex: number;
    isChecking: boolean;
}

// Rate limit recovery time (5 minutes)
const RATE_LIMIT_RECOVERY_MS = 5 * 60 * 1000;

// Max consecutive errors before marking dead
const MAX_ERRORS_BEFORE_DEAD = 3;

/**
 * API Key Manager Class
 * Singleton pattern for global state management
 */
class ApiKeyManager {
    private keys: ApiKeyInfo[] = [];
    private currentIndex: number = 0;
    private listeners: Set<(state: KeyManagerState) => void> = new Set();

    /**
     * Parse and add keys from multiline input
     */
    addKeysFromInput(input: string): number {
        const newKeys = input
            .split(/[\n,;]/)
            .map(k => k.trim())
            .filter(k => k.length > 20); // Basic validation

        const added = newKeys.filter(key => !this.keys.find(k => k.key === key));

        added.forEach(key => {
            this.keys.push({
                key,
                status: 'unknown',
                usageCount: 0,
                lastUsed: 0,
                errorCount: 0
            });
        });

        this.notifyListeners();
        return added.length;
    }

    /**
     * Set keys directly (replace all)
     */
    setKeys(keys: string[]): void {
        this.keys = keys.map(key => ({
            key,
            status: 'unknown' as KeyStatus,
            usageCount: 0,
            lastUsed: 0,
            errorCount: 0
        }));
        this.currentIndex = 0;
        this.notifyListeners();
    }

    /**
     * Get next available key (round-robin with status check)
     */
    getNextKey(): string | null {
        if (this.keys.length === 0) return null;

        // Try to find an active or unknown key
        const startIndex = this.currentIndex;
        let attempts = 0;

        while (attempts < this.keys.length) {
            const keyInfo = this.keys[this.currentIndex];

            // Check if rate_limited key has recovered
            if (keyInfo.status === 'rate_limited' && keyInfo.rateLimitResetTime) {
                if (Date.now() > keyInfo.rateLimitResetTime) {
                    keyInfo.status = 'active';
                    keyInfo.errorCount = 0;
                }
            }

            // Return if key is usable
            if (keyInfo.status === 'active' || keyInfo.status === 'unknown') {
                keyInfo.usageCount++;
                keyInfo.lastUsed = Date.now();

                // Move to next for round-robin
                this.currentIndex = (this.currentIndex + 1) % this.keys.length;
                this.notifyListeners();

                return keyInfo.key;
            }

            // Try next key
            this.currentIndex = (this.currentIndex + 1) % this.keys.length;
            attempts++;
        }

        // No available keys
        return null;
    }

    /**
     * Report successful API call
     */
    reportSuccess(key: string): void {
        const keyInfo = this.keys.find(k => k.key === key);
        if (keyInfo) {
            keyInfo.status = 'active';
            keyInfo.errorCount = 0;
            keyInfo.lastError = undefined;
            this.notifyListeners();
        }
    }

    /**
     * Report API call failure
     */
    reportFailure(key: string, error: string): void {
        const keyInfo = this.keys.find(k => k.key === key);
        if (!keyInfo) return;

        keyInfo.errorCount++;
        keyInfo.lastError = error;

        // Check error type
        if (error.includes('429') || error.toLowerCase().includes('rate limit') || error.toLowerCase().includes('quota')) {
            keyInfo.status = 'rate_limited';
            keyInfo.rateLimitResetTime = Date.now() + RATE_LIMIT_RECOVERY_MS;
        } else if (error.includes('401') || error.includes('403') || error.toLowerCase().includes('invalid') || error.toLowerCase().includes('api key')) {
            keyInfo.status = 'dead';
        } else if (keyInfo.errorCount >= MAX_ERRORS_BEFORE_DEAD) {
            keyInfo.status = 'dead';
        }

        this.notifyListeners();
    }

    /**
     * Check if a single key is alive
     */
    async checkKey(key: string): Promise<boolean> {
        const keyInfo = this.keys.find(k => k.key === key);
        if (!keyInfo) return false;

        keyInfo.status = 'checking';
        this.notifyListeners();

        try {
            // Simple validation call
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key);

            if (response.ok) {
                keyInfo.status = 'active';
                keyInfo.errorCount = 0;
                this.notifyListeners();
                return true;
            } else if (response.status === 429) {
                keyInfo.status = 'rate_limited';
                keyInfo.rateLimitResetTime = Date.now() + RATE_LIMIT_RECOVERY_MS;
                this.notifyListeners();
                return false;
            } else {
                keyInfo.status = 'dead';
                keyInfo.lastError = `HTTP ${response.status}`;
                this.notifyListeners();
                return false;
            }
        } catch (error: any) {
            keyInfo.status = 'dead';
            keyInfo.lastError = error.message;
            this.notifyListeners();
            return false;
        }
    }

    /**
     * Check all keys
     */
    async checkAllKeys(): Promise<{ active: number; dead: number; rateLimited: number }> {
        const results = await Promise.all(this.keys.map(k => this.checkKey(k.key)));

        return {
            active: this.keys.filter(k => k.status === 'active').length,
            dead: this.keys.filter(k => k.status === 'dead').length,
            rateLimited: this.keys.filter(k => k.status === 'rate_limited').length
        };
    }

    /**
     * Remove a key from pool
     */
    removeKey(key: string): void {
        const index = this.keys.findIndex(k => k.key === key);
        if (index !== -1) {
            this.keys.splice(index, 1);
            if (this.currentIndex >= this.keys.length) {
                this.currentIndex = 0;
            }
            this.notifyListeners();
        }
    }

    /**
     * Clear all keys
     */
    clearKeys(): void {
        this.keys = [];
        this.currentIndex = 0;
        this.notifyListeners();
    }

    /**
     * Get current state
     */
    getState(): KeyManagerState {
        return {
            keys: [...this.keys],
            currentIndex: this.currentIndex,
            isChecking: this.keys.some(k => k.status === 'checking')
        };
    }

    /**
     * Get statistics
     */
    getStats(): { total: number; active: number; dead: number; rateLimited: number; unknown: number } {
        return {
            total: this.keys.length,
            active: this.keys.filter(k => k.status === 'active').length,
            dead: this.keys.filter(k => k.status === 'dead').length,
            rateLimited: this.keys.filter(k => k.status === 'rate_limited').length,
            unknown: this.keys.filter(k => k.status === 'unknown').length
        };
    }

    /**
     * Check if any key is available
     */
    hasAvailableKey(): boolean {
        return this.keys.some(k => k.status === 'active' || k.status === 'unknown');
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: (state: KeyManagerState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Notify all listeners
     */
    private notifyListeners(): void {
        const state = this.getState();
        this.listeners.forEach(listener => listener(state));
    }

    /**
     * Export keys for persistence
     */
    exportKeys(): string[] {
        return this.keys.map(k => k.key);
    }

    /**
     * Get masked key for display
     */
    static maskKey(key: string): string {
        if (key.length < 10) return '***';
        return key.substring(0, 6) + '***' + key.substring(key.length - 4);
    }
}

// Singleton instance
export const apiKeyManager = new ApiKeyManager();

// Export class for testing
export { ApiKeyManager };
