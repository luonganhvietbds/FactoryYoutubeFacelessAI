import { SystemPromptData, PromptPackManifest } from "@/lib/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const RegistryService = {
    fetchPrompts: async (): Promise<SystemPromptData[]> => {
        try {
            const registry = await RegistryService.fetchFullRegistry();
            return registry.prompts;
        } catch (error) {
            console.error("Registry fetch error:", error);
            return [];
        }
    },

    fetchFullRegistry: async (): Promise<{ prompts: SystemPromptData[], packs: PromptPackManifest[] }> => {
        try {
            // 1. Parallel Fetch: Local API + Firestore
            const [localRes, cloudSnapshot] = await Promise.all([
                fetch('/api/registry', { cache: 'no-store' }).then(r => r.ok ? r.json() : { prompts: [], packs: [] }),
                getDocs(collection(db, "prompt_packs")).catch(e => { console.error("Firebase fetch failed", e); return { docs: [] }; })
            ]);

            const localPacks: PromptPackManifest[] = localRes.packs || [];
            const localPrompts: SystemPromptData[] = localRes.prompts || [];

            // 2. Parse Cloud Data
            const cloudPacks: PromptPackManifest[] = [];
            const cloudPrompts: SystemPromptData[] = [];

            cloudSnapshot.docs.forEach((doc: any) => {
                const data = doc.data();
                const pack: PromptPackManifest = {
                    id: doc.id,
                    name: data.name,
                    version: data.version,
                    author: data.author,
                    description: data.description,
                    language: data.language, // Phase 11: Multi-language support
                    // Check logic for 'prompts' in manifest (metadata) vs actual content
                    prompts: [], // Fill from map below
                    isValid: true
                };

                // data.prompts is a Map in Firestore: step1: { id, name, content }
                const promptsMap = data.prompts || {};

                Object.keys(promptsMap).forEach(key => {
                    const pData = promptsMap[key]; // { id, name, content }
                    // Add to pack manifest
                    // Determine stepId from key "step1" -> 1
                    const stepId = parseInt(key.replace('step', ''));

                    if (pData && !isNaN(stepId)) {
                        pack.prompts.push({
                            stepId: stepId,
                            file: `cloud://${doc.id}/${key}`, // Virtual path
                            id: pData.id,
                            name: pData.name
                        });

                        // Add to flat prompts list
                        cloudPrompts.push({
                            id: pData.id,
                            name: pData.name,
                            stepId: stepId,
                            content: pData.content,
                            packId: doc.id
                        });
                    }
                });

                // Sort prompts by step
                pack.prompts.sort((a, b) => a.stepId - b.stepId);
                cloudPacks.push(pack);
            });

            // 3. Merge Strategies
            // Strategy: Cloud Overrides Local if ID matches.
            const packMap = new Map<string, PromptPackManifest>();
            localPacks.forEach(p => packMap.set(p.id, p));
            cloudPacks.forEach(p => {
                // Add a visual indicator? 
                // We'll trust the ID. If cloud has it, we use it.
                // Maybe append " (Cloud)" to name for now verification? 
                // No, let's keep it seamless.
                packMap.set(p.id, { ...p, isCloud: true } as any);
            });

            const mergedPacks = Array.from(packMap.values());

            // Merge Prompts
            // Strategy: Union
            const promptMap = new Map<string, SystemPromptData>();
            localPrompts.forEach(p => promptMap.set(p.id, p));
            cloudPrompts.forEach(p => promptMap.set(p.id, p));

            return {
                prompts: Array.from(promptMap.values()),
                packs: mergedPacks
            };

        } catch (e) {
            console.error("Hybrid Fetch Error:", e);
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
            localPrompts.forEach(p => promptMap.set(p.id, p));

            return Array.from(promptMap.values());
        } catch (e) {
            console.error("Error merging prompts:", e);
            return serverPrompts;
        }
    }
};
