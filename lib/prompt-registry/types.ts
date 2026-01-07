export interface PromptAsset {
    stepId: number;
    file: string; // Relative path to .txt file
    id: string;   // Legacy/System ID (must be unique globally for compatibility)
    name: string; // Display Name
}

export interface PromptPackManifest {
    id: string;
    name: string;
    version: string;
    author: string;
    description?: string;
    prompts: PromptAsset[];
}

export interface SystemPromptData {
    id: string; // SYSTEM_S1_CRIME...
    name: string;
    content: string;
    stepId: number;
    packId?: string; // Optional: traceback to source pack
}
