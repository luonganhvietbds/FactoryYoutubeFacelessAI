/**
 * Language Configuration for Multi-Language Script Factory
 * Phase 11: English Script Factory Branch
 */

export type Language = 'vi' | 'en';

export interface LanguageConfig {
    id: Language;
    name: string;
    flag: string;
    wordCountPattern: RegExp;
    voiceoverPrefix: string | null; // null = no prefix (English)
    wordUnit: string;
    defaultPromptPackId: string;
    defaultWordRange: { min: number; max: number };
}

export const LANGUAGE_CONFIGS: Record<Language, LanguageConfig> = {
    vi: {
        id: 'vi',
        name: 'Tiếng Việt',
        flag: '🇻🇳',
        wordCountPattern: /\((\d+)\s*từ\)/,
        voiceoverPrefix: 'Lời dẫn:',
        wordUnit: 'từ',
        defaultPromptPackId: 'core-tools',
        defaultWordRange: { min: 18, max: 22 }
    },
    en: {
        id: 'en',
        name: 'English',
        flag: '🇺🇸',
        wordCountPattern: /\((\d+)\s*words?\)/i,
        voiceoverPrefix: null, // No prefix for English
        wordUnit: 'words',
        defaultPromptPackId: 'english-bd-crime',
        defaultWordRange: { min: 14, max: 20 }
    }
};

/**
 * Get language config by ID
 */
export const getLanguageConfig = (lang: Language): LanguageConfig => {
    return LANGUAGE_CONFIGS[lang];
};

/**
 * Get all available languages
 */
export const getAvailableLanguages = (): LanguageConfig[] => {
    return Object.values(LANGUAGE_CONFIGS);
};
