/**
 * Queue Persistence - IndexedDB storage for batch job queue
 * 
 * Ensures no progress is lost on:
 * - Browser refresh
 * - Tab close
 * - Crash
 */

import { BatchJob } from './types';

const DB_NAME = 'ai-script-factory';
const DB_VERSION = 1;
const STORE_NAME = 'batch-queue';

export interface PersistedQueueState {
    jobs: BatchJob[];
    processedJobs: BatchJob[];
    config: {
        sceneCount: number;
        wordMin: number;
        wordMax: number;
        delaySeconds: number;
    };
    lastUpdated: number;
    version: string;
}

class QueuePersistence {
    private db: IDBDatabase | null = null;
    private isInitialized: boolean = false;

    /**
     * Initialize IndexedDB
     */
    async init(): Promise<void> {
        if (this.isInitialized) return;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Save queue state
     */
    async saveState(state: PersistedQueueState): Promise<void> {
        await this.init();
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.put({
                id: 'current-state',
                ...state,
                lastUpdated: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load queue state
     */
    async loadState(): Promise<PersistedQueueState | null> {
        await this.init();
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.get('current-state');

            request.onsuccess = () => {
                if (request.result) {
                    const { id, ...state } = request.result;
                    resolve(state as PersistedQueueState);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear saved state
     */
    async clearState(): Promise<void> {
        await this.init();
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.delete('current-state');

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check if there's a saved state
     */
    async hasSavedState(): Promise<boolean> {
        const state = await this.loadState();

        if (!state) return false;

        // Check if state is recent (less than 24 hours old)
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const isRecent = Date.now() - state.lastUpdated < maxAge;

        // Check if there are pending jobs
        const hasPendingJobs = state.jobs.length > 0;

        return isRecent && hasPendingJobs;
    }

    /**
     * Get state age in human readable format
     */
    async getStateAge(): Promise<string | null> {
        const state = await this.loadState();
        if (!state) return null;

        const ageMs = Date.now() - state.lastUpdated;
        const ageMinutes = Math.floor(ageMs / 60000);

        if (ageMinutes < 60) {
            return `${ageMinutes} phút trước`;
        }

        const ageHours = Math.floor(ageMinutes / 60);
        return `${ageHours} giờ trước`;
    }
}

// Singleton instance
export const queuePersistence = new QueuePersistence();

export default queuePersistence;
