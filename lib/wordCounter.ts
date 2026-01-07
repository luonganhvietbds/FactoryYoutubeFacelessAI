/**
 * Vietnamese Word Counter Utility
 * 
 * SINGLE SOURCE OF TRUTH for word counting in AI Script Factory.
 * Counts Vietnamese words by splitting on whitespace (syllables).
 */

/**
 * Counts Vietnamese words (syllables) by splitting on whitespace.
 * This matches how voiceover timing is calculated (1 syllable ≈ 0.25-0.3s).
 * 
 * @param text - The Vietnamese text to count words in
 * @returns Number of words (syllables)
 * 
 * @example
 * countVietnameseWords("Mẹ kế không phải ác quỷ") // Returns: 6
 * countVietnameseWords("trong thời kỳ khủng hoảng") // Returns: 5
 */
export const countVietnameseWords = (text: string): number => {
    if (!text || text.trim().length === 0) return 0;

    // Remove common punctuation that might be attached to words
    // Keep Vietnamese diacritics intact
    const cleaned = text
        .replace(/[.,;:!?"""''()—–\-\[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Split by whitespace and filter empty strings
    const words = cleaned.split(/\s+/).filter(w => w.length > 0);

    return words.length;
};

/**
 * Counts English words by splitting on whitespace.
 * Standard word counting for English text.
 * 
 * @param text - The English text to count words in
 * @returns Number of words
 */
export const countEnglishWords = (text: string): number => {
    if (!text || text.trim().length === 0) return 0;

    // Remove common punctuation and split
    const cleaned = text
        .replace(/[.,;:!?"'""''()—–\-\[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words = cleaned.split(/\s+/).filter(w => w.length > 0);
    return words.length;
};

/**
 * Language-aware word counter
 * @param text - Text to count
 * @param lang - Language code ('vi' or 'en')
 * @returns Word count
 */
export const countWords = (text: string, lang: 'vi' | 'en' = 'vi'): number => {
    return lang === 'vi' ? countVietnameseWords(text) : countEnglishWords(text);
};

/**
 * Extracts the voiceover content from a scene block, removing the word count annotation.
 * 
 * @param sceneText - The full scene text containing "Lời dẫn: ... (X từ)"
 * @returns The voiceover content without the word count annotation
 */
export const extractVoiceoverContent = (sceneText: string): string | null => {
    // Match "Lời dẫn:" followed by content, optionally ending with "(X từ)"
    const match = sceneText.match(/Lời dẫn:\s*([\s\S]*?)(?:\s*\(\d+\s*từ\)\s*)?$/i);

    if (match && match[1]) {
        // Clean up the extracted content
        return match[1]
            .replace(/\(\d+\s*từ\)/g, '') // Remove any word count annotations
            .trim();
    }

    return null;
};

/**
 * Corrects the word count annotation in a scene's voiceover.
 * Replaces AI's potentially incorrect count with our accurate count.
 * 
 * @param sceneText - The full scene text
 * @returns The scene text with corrected word count annotation
 */
export const correctVoiceoverAnnotation = (sceneText: string): {
    correctedText: string;
    wordCount: number;
    voiceoverContent: string | null;
} => {
    const voiceoverContent = extractVoiceoverContent(sceneText);

    if (!voiceoverContent) {
        return {
            correctedText: sceneText,
            wordCount: 0,
            voiceoverContent: null
        };
    }

    const actualCount = countVietnameseWords(voiceoverContent);

    // Replace the voiceover section with corrected annotation
    const correctedText = sceneText.replace(
        /Lời dẫn:\s*[\s\S]*?(?:\(\d+\s*từ\))?\s*$/i,
        `Lời dẫn: ${voiceoverContent} (${actualCount} từ)`
    );

    return {
        correctedText,
        wordCount: actualCount,
        voiceoverContent
    };
};

/**
 * Parses a full outline response into individual scene blocks.
 * 
 * @param response - The full Gemini response containing multiple scenes
 * @returns Array of scene strings
 */
export const parseScenes = (response: string): string[] => {
    // Split by "Scene X:" pattern, keeping the delimiter
    const parts = response.split(/(?=Scene \d+:)/i);

    // Filter out empty parts and the content before first scene
    return parts
        .filter(part => /^Scene \d+:/i.test(part.trim()))
        .map(part => part.trim());
};
