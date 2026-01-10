/**
 * Output Normalizer - Multi-Model Architecture
 * Standardizes AI outputs regardless of source model
 */

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

/**
 * Clean markdown artifacts and normalize whitespace
 */
export function normalizeText(text: string): string {
    let result = text;

    // Remove markdown code block wrappers
    result = result.replace(/^```[\w]*\n?/gm, '');
    result = result.replace(/\n?```$/gm, '');

    // Normalize whitespace
    result = result.replace(/\r\n/g, '\n');
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.trim();

    return result;
}

// ============================================================================
// JSON NORMALIZATION
// ============================================================================

/**
 * Extract and parse JSON from potentially messy model output
 */
export function extractJSON<T = unknown>(text: string): T {
    let content = text;

    // Remove markdown code blocks
    content = content.replace(/^```json\n?/i, '');
    content = content.replace(/^```\n?/i, '');
    content = content.replace(/\n?```$/i, '');
    content = content.trim();

    // Try to find JSON array or object
    const jsonMatch = content.match(/[\[\{][\s\S]*[\]\}]/);
    if (jsonMatch) {
        content = jsonMatch[0];
    }

    try {
        return JSON.parse(content) as T;
    } catch (e) {
        // Try to fix common JSON issues
        content = fixCommonJSONIssues(content);
        return JSON.parse(content) as T;
    }
}

/**
 * Attempt to fix common JSON formatting issues from LLMs
 */
function fixCommonJSONIssues(json: string): string {
    let fixed = json;

    // Remove trailing commas before closing brackets
    fixed = fixed.replace(/,(\s*[\]\}])/g, '$1');

    // Fix unescaped newlines in strings (common LLM mistake)
    fixed = fixed.replace(/(?<!\\)\n(?=.*["\]])/g, '\\n');

    // Fix single quotes used instead of double quotes
    // Be careful not to replace apostrophes in text
    fixed = fixed.replace(/(?<=[:\[{,]\s*)'([^']*)'(?=\s*[,\]\}])/g, '"$1"');

    return fixed;
}

/**
 * Validate JSON against a schema using a validator function
 */
export function validateJSON<T>(
    data: unknown,
    validator: (raw: unknown) => T
): T {
    return validator(data);
}

// ============================================================================
// SCENE FORMAT NORMALIZATION
// ============================================================================

export interface NormalizedScene {
    sceneNumber: number;
    title?: string;
    visualDescription: string;
    voiceOver: string;
    wordCount: number;
}

/**
 * Normalize scene format - handles various "CẢNH X" formats
 */
export function normalizeSceneFormat(rawScene: string): NormalizedScene | null {
    // Pattern: CẢNH X: Title or [CẢNH X] or **CẢNH X**
    const sceneMatch = rawScene.match(
        /(?:\*\*)?(?:\[)?CẢNH\s*(\d+)(?:\])?(?:\*\*)?(?:[:：]\s*(.+?))?(?:\n|$)/i
    );

    if (!sceneMatch) return null;

    const sceneNumber = parseInt(sceneMatch[1], 10);
    const title = sceneMatch[2]?.trim();

    // Extract Voice Over section
    const voMatch = rawScene.match(
        /(?:Voice\s*Over|VO|Lời\s*dẫn|Giọng\s*đọc)[:：]?\s*([\s\S]*?)(?=(?:\[|\*\*)?(?:HÌNH\s*ẢNH|Visual|CẢNH\s*\d|$))/i
    );
    const voiceOver = voMatch ? voMatch[1].trim() : '';

    // Extract Visual Description
    const visualMatch = rawScene.match(
        /(?:HÌNH\s*ẢNH|Visual|Mô\s*tả\s*hình)[:：]?\s*([\s\S]*?)(?=(?:Voice\s*Over|VO|Lời\s*dẫn|$))/i
    );
    const visualDescription = visualMatch ? visualMatch[1].trim() : '';

    // Count words in voice over
    const wordCount = countWords(voiceOver);

    return {
        sceneNumber,
        title,
        visualDescription,
        voiceOver,
        wordCount,
    };
}

/**
 * Count words - handles Vietnamese and English
 */
function countWords(text: string): number {
    if (!text) return 0;
    // Split by whitespace and filter empty strings
    return text.split(/\s+/).filter(Boolean).length;
}

// ============================================================================
// PROMPT JSON NORMALIZATION  
// ============================================================================

export interface PromptEntry {
    scene: number;
    image_prompt: string;
    style?: string;
}

/**
 * Normalize prompt JSON output - ensures consistent format
 */
export function normalizePromptJSON(rawJSON: string | object): PromptEntry[] {
    const data = typeof rawJSON === 'string' ? extractJSON<unknown>(rawJSON) : rawJSON;

    if (!Array.isArray(data)) {
        throw new Error('Expected array of prompts');
    }

    return data.map((item: Record<string, unknown>, index: number) => ({
        scene: typeof item.scene === 'number' ? item.scene : index + 1,
        image_prompt: String(item.image_prompt || item.prompt || item.description || ''),
        style: item.style ? String(item.style) : undefined,
    }));
}

// ============================================================================
// METADATA NORMALIZATION
// ============================================================================

export interface VideoMetadata {
    title: string;
    description: string;
    tags: string[];
    thumbnail_text?: string;
}

/**
 * Normalize metadata output
 */
export function normalizeMetadata(rawData: string | object): VideoMetadata {
    const data = typeof rawData === 'string' ? extractJSON<Record<string, unknown>>(rawData) : rawData as Record<string, unknown>;

    // Handle various tag formats
    let tags: string[] = [];
    if (Array.isArray(data.tags)) {
        tags = data.tags.map(String);
    } else if (typeof data.tags === 'string') {
        tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    return {
        title: String(data.title || data.tiêu_đề || ''),
        description: String(data.description || data.mô_tả || ''),
        tags,
        thumbnail_text: data.thumbnail_text || data.thumbnail ? String(data.thumbnail_text || data.thumbnail) : undefined,
    };
}
