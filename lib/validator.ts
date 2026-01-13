/**
 * SceneValidator - Validates scene structure and content
 * Part of Auto-Fix Scene Validation System
 */

import {
    SceneData,
    ValidationResult,
    ComprehensiveResult
} from './types';
import { countVietnameseWords } from './wordCounter';

export class SceneValidator {
    private readonly MIN_VISUAL_LENGTH = 10;
    private readonly SCENE_PATTERN = /^(?:Scene|Cảnh)\s*(\d+)[:.]?\s*(.*)$/i;
    private readonly VISUAL_PATTERN = /(?:Hình\s*ảnh|Visual|Image)[:\s]*(.+?)(?=\n\s*(?:Lời|Vo|Voice)|$)/is;
    private readonly VOICEOVER_PATTERN = /(?:Lời\s*dẫn|Voice\s*over|Vo|Audio)[:\s]*(.+?)(?=\n\s*(?:Scene|Cảnh)|$)/is;

    validateSceneStructure(sceneText: string): ValidationResult {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let sceneData: SceneData | null = null;

        const trimmedText = sceneText.trim();

        if (!trimmedText) {
            issues.push('empty_scene');
            suggestions.push('Scene content is empty');
            return { sceneData: null, isValid: false, issues, suggestions };
        }

        const sceneMatch = trimmedText.match(this.SCENE_PATTERN);
        if (!sceneMatch) {
            issues.push('invalid_format');
            suggestions.push('Scene must start with "Scene X:" or "Cảnh X:"');
            return { sceneData: null, isValid: false, issues, suggestions };
        }

        const sceneNum = parseInt(sceneMatch[1]);
        const restContent = sceneMatch[2] || '';

        const visualMatch = trimmedText.match(this.VISUAL_PATTERN);
        const voiceoverMatch = trimmedText.match(this.VOICEOVER_PATTERN);

        if (!visualMatch || !visualMatch[1]?.trim()) {
            issues.push('missing_visual');
            suggestions.push('Add "Hình ảnh:" section with visual description');
        } else {
            const visualContent = visualMatch[1].trim();
            if (visualContent.split(/\s+/).length < this.MIN_VISUAL_LENGTH) {
                issues.push('visual_too_short');
                suggestions.push('Visual description should be at least 10 words');
            }
        }

        if (!voiceoverMatch || !voiceoverMatch[1]?.trim()) {
            issues.push('missing_voiceover');
            suggestions.push('Add "Lời dẫn:" section with voiceover content');
        }

        const voiceoverContent = voiceoverMatch?.[1]?.trim() || '';
        const wordCount = countVietnameseWords(voiceoverContent);

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

    validateAllScenes(outlineContent: string, expectedCount: number): ComprehensiveResult {
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

        const sceneBlocks = this.splitScenes(outlineContent);
        const validScenes: SceneData[] = [];
        const invalidScenes: ValidationResult[] = [];
        const foundSceneNums = new Set<number>();
        const missingScenes: number[] = [];

        for (const block of sceneBlocks) {
            const result = this.validateSceneStructure(block);
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

    extractSceneData(sceneText: string): SceneData | null {
        const result = this.validateSceneStructure(sceneText);
        return result.sceneData;
    }

    detectMissingFields(sceneText: string): string[] {
        const result = this.validateSceneStructure(sceneText);
        return result.issues
            .filter(i => i.startsWith('missing_') || i.startsWith('invalid_'))
            .map(i => i.replace('missing_', '').replace('invalid_', ''));
    }

    private splitScenes(content: string): string[] {
        const patterns = [
            /(?=\n\s*(?:Scene|Cảnh)\s*\d+[:.]?\s*)/i,
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

        return parts
            .filter(part => /^(?:Scene|Cảnh|\d+\.)\s*\d+/i.test(part.trim()))
            .map(part => part.trim());
    }

    private buildSceneText(sceneData: SceneData): string {
        return `Scene ${sceneData.sceneNum}: ${sceneData.title}
Hình ảnh: ${sceneData.visual}
Lời dẫn: ${sceneData.voiceover} (${sceneData.wordCount} từ)`;
    }
}

export const sceneValidator = new SceneValidator();
