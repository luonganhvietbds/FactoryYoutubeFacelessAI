import { SystemPromptData, PromptPackManifest } from "@/lib/types";

export const RegistryService = {
    fetchPrompts: async (): Promise<SystemPromptData[]> => {
        try {
            const response = await fetch('/api/registry', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch registry');
            const data = await response.json();
            return data.prompts || [];
        } catch (error) {
            console.error("Registry fetch error:", error);
            return [];
        }
    },

    fetchFullRegistry: async (): Promise<{ prompts: SystemPromptData[], packs: PromptPackManifest[] }> => {
        try {
            const response = await fetch('/api/registry', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed');
            const data = await response.json();
            return { prompts: data.prompts || [], packs: data.packs || [] };
        } catch (e) {
            console.error(e);
            return { prompts: [], packs: [] };
        }
    },

    mergeWithLocal: (serverPrompts: SystemPromptData[]): SystemPromptData[] => {
        if (typeof window === 'undefined') return serverPrompts;

        try {
            const localData = localStorage.getItem('systemPromptsLibrary');
            if (!localData) return serverPrompts;

            const localPrompts: SystemPromptData[] = JSON.parse(localData);

            // Create a Map with server prompts
            const promptMap = new Map<string, SystemPromptData>();
            serverPrompts.forEach(p => promptMap.set(p.id, p));

            // Override with local prompts (User edits or Customs)
            // NOTE: This assumes user wants their local version to persist over updates.
            // Ideally, we should only store "diffs", but for backward compatibility, 
            // we treat local storage as the "User's State".
            localPrompts.forEach(p => promptMap.set(p.id, p));

            return Array.from(promptMap.values());
        } catch (e) {
            console.error("Error merging prompts:", e);
            return serverPrompts;
        }
    }
};
