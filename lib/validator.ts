/**
 * SceneValidator - Validates scene structure and content
 * Part of Auto-Fix Scene Validation System
 */

import {
    SceneData,
    ValidationResult,
    ComprehensiveResult
} from './types';
import { countWords } from './wordCounter';
import { Language, LANGUAGE_CONFIGS } from './languageConfig';

export class SceneValidator {
    private readonly MIN_VISUAL_LENGTH = 10;

    validateSceneStructure(sceneText: string, language: Language = 'vi'): ValidationResult {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let sceneData: SceneData | null = null;

        const trimmedText = sceneText.trim();
        const config = LANGUAGE_CONFIGS[language];
        const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
        const imageLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
        const missingImageSuggestion = language === 'vi' 
            ? 'Add "Hình ảnh:" section with visual description'
            : 'Add "Image:" section with visual description';
        const missingVoiceoverSuggestion = language === 'vi'
            ? 'Add "Lời dẫn:" section with voiceover content'
            : 'Add "Voice-over:" section with voiceover content';

        if (!trimmedText) {
            issues.push('empty_scene');
            suggestions.push('Scene content is empty');
            return { sceneData: null, isValid: false, issues, suggestions };
        }

        // Language-aware scene pattern
        const scenePattern = language === 'vi'
            ? /^(?:Scene|Cảnh)\s*(\d+)[:.]?\s*(.*)$/i
            : /^(Scene)\s*(\d+)[:.]?\s*(.*)$/i;
        
        const sceneMatch = trimmedText.match(scenePattern);
        if (!sceneMatch) {
            issues.push('invalid_format');
            suggestions.push(language === 'vi'
                ? 'Scene must start with "Scene X:" or "Cảnh X:"'
                : 'Scene must start with "Scene X:"');
            return { sceneData: null, isValid: false, issues, suggestions };
        }

        const sceneNum = language === 'vi'
            ? parseInt(sceneMatch[1])
            : parseInt(sceneMatch[2]);
        const restContent = language === 'vi'
            ? (sceneMatch[2] || '')
            : (sceneMatch[3] || '');

        // Language-aware visual pattern
        const visualPattern = language === 'vi'
            ? /(?:Hình\s*ảnh|Visual|Image)[:\s]*(.+?)(?=\n\s*(?:Lời|Vo|Voice)|$)/is
            : /(?:Image|Visual)[:\s]*(.+?)(?=\n\s*(?:Voice|Vo)|$)/is;
        
        // Language-aware voiceover pattern
        const voiceoverPattern = language === 'vi'
            ? /(?:Lời\s*dẫn|Voice\s*over|Vo|Audio)[:\s]*(.+?)(?=\n\s*(?:Scene|Cảnh)|$)/is
            : /(?:Voice\s*over|Vo|Audio|Narration)[:\s]*(.+?)(?=\n\s*(?:Scene)|$)/is;

        const visualMatch = trimmedText.match(visualPattern);
        const voiceoverMatch = trimmedText.match(voiceoverPattern);

        if (!visualMatch || !visualMatch[1]?.trim()) {
            issues.push('missing_visual');
            suggestions.push(missingImageSuggestion);
        } else {
            const visualContent = visualMatch[1].trim();
            if (visualContent.split(/\s+/).length < this.MIN_VISUAL_LENGTH) {
                issues.push('visual_too_short');
                suggestions.push('Visual description should be at least 10 words');
            }
        }

        if (!voiceoverMatch || !voiceoverMatch[1]?.trim()) {
            issues.push('missing_voiceover');
            suggestions.push(missingVoiceoverSuggestion);
        }

        const voiceoverContent = voiceoverMatch?.[1]?.trim() || '';
        const wordCount = countWords(voiceoverContent, language);

        sceneData = {
            sceneNum,
            title: restContent.split('\n')[0] || `Scene ${sceneNum}`,
            visual: visualMatch?.[1]?.trim() || '',
            voiceover: voiceoverContent,
            wordCount
        };

        return {
            sceneData,
            isValid: issues.length === 0,
            issues,
            suggestions
        };
    }

    validateAllScenes(outlineContent: string, expectedCount: number, language: Language = 'vi'): ComprehensiveResult {
        if (!outlineContent || outlineContent.trim().length === 0) {
            return {
                totalExpected: expectedCount,
                totalFound: 0,
                validScenes: [],
                invalidScenes: [],
                missingScenes: Array.from({ length: expectedCount }, (_, i) => i + 1),
                completionRate: 0,
                allScenesContent: ''
            };
        }

        const sceneBlocks = this.splitScenes(outlineContent, language);
        const validScenes: SceneData[] = [];
        const invalidScenes: ValidationResult[] = [];
        const foundSceneNums = new Set<number>();
        const missingScenes: number[] = [];

        for (const block of sceneBlocks) {
            const result = this.validateSceneStructure(block, language);
            if (result.sceneData) {
                foundSceneNums.add(result.sceneData.sceneNum);
                if (result.isValid) {
                    validScenes.push(result.sceneData);
                } else {
                    invalidScenes.push(result);
                }
            }
        }

        for (let i = 1; i <= expectedCount; i++) {
            if (!foundSceneNums.has(i)) {
                missingScenes.push(i);
            }
        }

        const totalFound = validScenes.length + invalidScenes.length;
        const completionRate = expectedCount > 0
            ? Math.round((validScenes.length / expectedCount) * 100)
            : 0;

        return {
            totalExpected: expectedCount,
            totalFound,
            validScenes,
            invalidScenes,
            missingScenes,
            completionRate,
            allScenesContent: validScenes
                .sort((a, b) => a.sceneNum - b.sceneNum)
                .map(s => this.buildSceneText(s))
                .join('\n\n')
        };
    }

    extractSceneData(sceneText: string, language: Language = 'vi'): SceneData | null {
        const result = this.validateSceneStructure(sceneText, language);
        return result.sceneData;
    }

    detectMissingFields(sceneText: string, language: Language = 'vi'): string[] {
        const result = this.validateSceneStructure(sceneText, language);
        return result.issues
            .filter(i => i.startsWith('missing_') || i.startsWith('invalid_'))
            .map(i => i.replace('missing_', '').replace('invalid_', ''));
    }

    private splitScenes(content: string, language: Language = 'vi'): string[] {
        const patterns = language === 'vi'
            ? [
                /(?=\n\s*(?:Scene|Cảnh)\s*\d+[:.]?\s*)/i,
                /(?=\n\s*\d+\.\s*)/,
                /(?=\n===+\s*)/,
            ]
            : [
                /(?=\n\s*Scene\s*\d+[:.]?\s*)/i,
                /(?=\n\s*\d+\.\s*)/,
                /(?=\n===+\s*)/,
            ];

        let parts: string[] = [content];

        for (const pattern of patterns) {
            const newParts: string[] = [];
            for (const part of parts) {
                const split = part.split(pattern).filter(p => p.trim().length > 0);
                if (split.length > 1) {
                    newParts.push(...split);
                } else {
                    newParts.push(part);
                }
            }
            parts = newParts;
        }

        const scenePattern = language === 'vi'
            ? /^(?:Scene|Cảnh|\d+\.)\s*\d+/i
            : /^(Scene|\d+\.)\s*\d+/i;

        return parts
            .filter(part => scenePattern.test(part.trim()))
            .map(part => part.trim());
    }

    buildSceneText(sceneData: SceneData, language: Language = 'vi'): string {
        const config = LANGUAGE_CONFIGS[language];
        const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
        const imageLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
        const wordUnit = config.wordUnit;

        return `Scene ${sceneData.sceneNum}: ${sceneData.title}
${imageLabel}: ${sceneData.visual}
${voiceoverLabel}: ${sceneData.voiceover} (${sceneData.wordCount} ${wordUnit})`;
    }
}

export const sceneValidator = new SceneValidator();
