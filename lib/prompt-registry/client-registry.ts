import { SystemPromptData } from "@/lib/types";

export const RegistryService = {
    fetchPrompts: async (): Promise<SystemPromptData[]> => {
        try {
            // Gọi API nội bộ của NextJS
            const response = await fetch('/api/registry', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch registry');
            const data = await response.json();
            return data.prompts || [];
        } catch (error) {
            console.error("Registry fetch error:", error);
            return [];
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
