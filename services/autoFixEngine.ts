/**
 * AutoFixEngine - AI-powered scene fixing system
 * Part of Auto-Fix Scene Validation System
 */

import {
    ValidationResult,
    FixedScene,
    SceneData
} from '@/lib/types';
import { sceneValidator } from '@/lib/validator';
import { getAdapterForStep, getModelIdForStep, isSafeMode } from '@/lib/ai/factory';
import { AIRequest } from '@/lib/ai/types';
import { countWords } from '@/lib/wordCounter';
import { logError } from '@/lib/errorTracker';
import { Language, LANGUAGE_CONFIGS } from '@/lib/languageConfig';

const AUTO_FIX_TIMEOUT = 30000;
const MAX_SCENES_PER_FIX = 5;

export class AutoFixEngine {
    private readonly adapter = getAdapterForStep(2);

    async fixScene(
        sceneData: SceneData,
        targetWords: number,
        tolerance: number,
        systemPrompt: string,
        language: Language = 'vi'
    ): Promise<FixedScene> {
        const minWords = targetWords - tolerance;
        const maxWords = targetWords + tolerance;
        const config = LANGUAGE_CONFIGS[language];
        const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
        const imageLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
        const wordUnit = config.wordUnit;

        const issues = sceneValidator.validateSceneStructure(
            `Scene ${sceneData.sceneNum}: ${sceneData.title}\n` +
            `${imageLabel}: ${sceneData.visual}\n` +
            `${voiceoverLabel}: ${sceneData.voiceover}`,
            language
        );

        const fixReasons = issues.issues.map(issue => {
            switch (issue) {
                case 'missing_visual':
                    return language === 'vi' ? 'Thiếu mô tả hình ảnh' : 'Missing visual description';
                case 'missing_voiceover':
                    return language === 'vi' ? 'Thiếu lời dẫn' : 'Missing voiceover';
                case 'visual_too_short':
                    return language === 'vi' ? 'Mô tả hình ảnh quá ngắn' : 'Visual description too short';
                case 'voiceover_missing':
                    return language === 'vi' ? 'Thiếu voiceover' : 'Missing voiceover';
                default: return issue;
            }
        });

        const userPrompt = this.buildFixPrompt(sceneData, fixReasons, targetWords, minWords, maxWords, language);

        try {
            const response = await this.callWithTimeout(
                this.adapter.generateContent({
                    systemPrompt,
                    userMessage: userPrompt
                }),
                AUTO_FIX_TIMEOUT
            );

            const fixedContent = response.content;
            const revalidate = sceneValidator.validateSceneStructure(fixedContent, language);

            return {
                sceneNum: sceneData.sceneNum,
                originalContent: `Scene ${sceneData.sceneNum}: ${sceneData.title}\n${imageLabel}: ${sceneData.visual}\n${voiceoverLabel}: ${sceneData.voiceover}`,
                fixedContent,
                fixReasons,
                isValidAfterFix: revalidate.isValid || (revalidate.sceneData !== null && revalidate.issues.length <= 1)
            };
        } catch (error: any) {
            logError(2, `Auto-fix failed for Scene ${sceneData.sceneNum}: ${error.message}`, 'ERROR');
            return {
                sceneNum: sceneData.sceneNum,
                originalContent: `Scene ${sceneData.sceneNum}: ${sceneData.title}\n${imageLabel}: ${sceneData.visual}\n${voiceoverLabel}: ${sceneData.voiceover}`,
                fixedContent: '',
                fixReasons,
                isValidAfterFix: false
            };
        }
    }

    async fixMultipleScenes(
        invalidScenes: ValidationResult[],
        targetWords: number,
        tolerance: number,
        systemPrompt: string,
        context: string,
        language: Language = 'vi'
    ): Promise<FixedScene[]> {
        if (invalidScenes.length === 0) {
            return [];
        }

        const scenesToFix = invalidScenes
            .filter(r => r.sceneData !== null)
            .slice(0, MAX_SCENES_PER_FIX);

        if (scenesToFix.length === 0) {
            return [];
        }

        const batchPrompt = this.buildBatchFixPrompt(scenesToFix, targetWords, tolerance, systemPrompt, context, language);
        const minWords = targetWords - tolerance;
        const maxWords = targetWords + tolerance;
        const config = LANGUAGE_CONFIGS[language];
        const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
        const imageLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
        const wordUnit = config.wordUnit;

        try {
            const response = await this.callWithTimeout(
                this.adapter.generateContent({
                    systemPrompt,
                    userMessage: batchPrompt
                }),
                AUTO_FIX_TIMEOUT
            );

            const fixedScenes: FixedScene[] = [];
            const responseContent = response.content;

            const sceneBlocks = responseContent.split(/(?=Scene \d+:)/i).filter(
                block => /^Scene \d+:/i.test(block.trim())
            );

            for (const block of sceneBlocks) {
                const revalidate = sceneValidator.validateSceneStructure(block, language);
                const sceneNumMatch = block.match(/Scene\s*(\d+)/i);

                if (sceneNumMatch) {
                    const sceneNum = parseInt(sceneNumMatch[1]);
                    const original = scenesToFix.find(s => s.sceneData?.sceneNum === sceneNum);

                    fixedScenes.push({
                        sceneNum,
                        originalContent: original?.sceneData
                            ? `Scene ${original.sceneData.sceneNum}: ${original.sceneData.title}\n${imageLabel}: ${original.sceneData.visual}\n${voiceoverLabel}: ${original.sceneData.voiceover}`
                            : '',
                        fixedContent: block,
                        fixReasons: original?.issues || ['validation_failed'],
                        isValidAfterFix: revalidate.isValid
                    });
                }
            }

            const originalFixed = new Set(fixedScenes.map(s => s.sceneNum));
            for (const validationResult of scenesToFix) {
                if (validationResult.sceneData && !originalFixed.has(validationResult.sceneData.sceneNum)) {
                    fixedScenes.push({
                        sceneNum: validationResult.sceneData.sceneNum,
                        originalContent: `Scene ${validationResult.sceneData.sceneNum}: ${validationResult.sceneData.title}\n${imageLabel}: ${validationResult.sceneData.visual}\n${voiceoverLabel}: ${validationResult.sceneData.voiceover}`,
                        fixedContent: '',
                        fixReasons: validationResult.issues,
                        isValidAfterFix: false
                    });
                }
            }

            return fixedScenes;
        } catch (error: any) {
            logError(2, `Batch auto-fix failed: ${error.message}`, 'ERROR');
            return scenesToFix.map(r => ({
                sceneNum: r.sceneData?.sceneNum || 0,
                originalContent: r.sceneData
                    ? `Scene ${r.sceneData.sceneNum}: ${r.sceneData.title}\nHình ảnh: ${r.sceneData.visual}\nLời dẫn: ${r.sceneData.voiceover}`
                    : '',
                fixedContent: '',
                fixReasons: r.issues,
                isValidAfterFix: false
            }));
        }
    }

    applyFixes(originalOutline: string, fixes: FixedScene[], language: Language = 'vi'): string {
        if (fixes.length === 0) {
            return originalOutline;
        }

        let result = originalOutline;

        const validFixes = fixes.filter(f => f.fixedContent && f.isValidAfterFix);

        for (const fix of validFixes) {
            const scenePattern = new RegExp(
                `(Scene\\s*${fix.sceneNum}[:.]?\\s*.*?)(?=\\n\\s*(?:Scene\\s*\\d+|===+|$))`,
                'is'
            );
            result = result.replace(scenePattern, fix.fixedContent.trim());
        }

        const missingFixes = fixes.filter(f => !f.isValidAfterFix && f.fixedContent);
        for (const fix of missingFixes) {
            const scenePattern = new RegExp(
                `(Scene\\s*${fix.sceneNum}[:.]?\\s*.*?)(?=\\n\\s*(?:Scene\\s*\\d+|===+|$))`,
                'is'
            );
            if (scenePattern.test(result)) {
                result = result.replace(scenePattern, fix.fixedContent.trim());
            }
        }

        return result;
    }

    private buildFixPrompt(
        sceneData: SceneData,
        fixReasons: string[],
        targetWords: number,
        minWords: number,
        maxWords: number,
        language: Language = 'vi'
    ): string {
        const config = LANGUAGE_CONFIGS[language];
        const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
        const imageLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
        const wordUnit = config.wordUnit;

        const taskLabel = language === 'vi' ? '=== NHIỆM VỤ SỬA LỖI SCENE ===' : '=== SCENE FIX TASK ===';
        const sceneLabel = language === 'vi' ? 'CẢNH CẦN SỬA' : 'SCENE TO FIX';
        const issueLabel = language === 'vi' ? 'VẤN ĐỀ PHÁT HIỆN' : 'ISSUES DETECTED';
        const currentLabel = language === 'vi' ? 'NỘI DUNG HIỆN TẠI' : 'CURRENT CONTENT';
        const fixLabel = language === 'vi' ? 'YÊU CẦU SỬA CHỮA' : 'FIX REQUIREMENTS';
        const formatLabel = language === 'vi' ? 'FORMAT BẮT BUỘC' : 'REQUIRED FORMAT';
        const returnLabel = language === 'vi' ? 'CHỈ TRẢ VỀ NỘI DUNG SCENE ĐÃ SỬA, KHÔNG GIẢI THÍCH.' : 'ONLY RETURN THE FIXED SCENE CONTENT, NO EXPLANATIONS.';

        const visualRequirement = language === 'vi'
            ? 'Đảm bảo "Hình ảnh:" có ít nhất 10 từ mô tả chi tiết'
            : 'Ensure "Image:" has at least 10 words describing details';
        const voiceoverRequirement = language === 'vi'
            ? `Đảm bảo "${voiceoverLabel}:" có độ dài ${targetWords} ${wordUnit} (chấp nhận ${minWords}-${maxWords} ${wordUnit})`
            : `Ensure "${voiceoverLabel}:" has length of ${targetWords} ${wordUnit} (accept ${minWords}-${maxWords} ${wordUnit})`;
        const contextRequirement = language === 'vi'
            ? 'Viết lại nội dung để phù hợp với ngữ cảnh tổng thể'
            : 'Rewrite content to match overall context';

        return `
${taskLabel}

${sceneLabel}: Scene ${sceneData.sceneNum}

${issueLabel}:
${fixReasons.map(r => `- ${r}`).join('\n')}

${currentLabel}:
---
Scene ${sceneData.sceneNum}: ${sceneData.title}
${imageLabel}: ${sceneData.visual}
${voiceoverLabel}: ${sceneData.voiceover}
---

${fixLabel}:
1. ${language === 'vi' ? 'Bổ sung đầy đủ các thành phần bị thiếu' : 'Fill in all missing components'}
2. ${visualRequirement}
3. ${voiceoverRequirement}
4. ${contextRequirement}

${formatLabel}:
\`\`\`
Scene ${sceneData.sceneNum}: [Scene title]
${imageLabel}: [Detailed description - at least 10 words]
${voiceoverLabel}: [Voiceover content] (${targetWords} ${wordUnit})
\`\`\`

${returnLabel}
`;
    }

    private buildBatchFixPrompt(
        scenesToFix: ValidationResult[],
        targetWords: number,
        tolerance: number,
        systemPrompt: string,
        context: string,
        language: Language = 'vi'
    ): string {
        const minWords = targetWords - tolerance;
        const maxWords = targetWords + tolerance;
        const config = LANGUAGE_CONFIGS[language];
        const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
        const imageLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
        const wordUnit = config.wordUnit;

        let prompt = `
=== ${language === 'vi' ? 'NHIỆM VỤ SỬA LỖI NHIỀU SCENES' : 'MULTIPLE SCENES FIX TASK'} ===

TỔNG SỐ SCENES CẦN SỬA: ${scenesToFix.length}

CONTEXT:
${context.slice(0, 2000)}

${language === 'vi' ? 'YÊU CẦU:' : 'REQUIREMENTS:'}
- ${language === 'vi' ? 'Sửa TẤT CẢ scenes bên dưới' : 'Fix ALL scenes below'}
- ${language === 'vi' ? 'Đảm bảo đầy đủ 3 thành phần' : 'Ensure all 3 components are present'}
- ${language === 'vi' ? '"Hình ảnh:" phải có ít nhất 10 từ mô tả' : '"Image:" must have at least 10 words describing'}
- ${language === 'vi' ? `"Lời dẫn:" phải có độ dài ${targetWords} từ (${minWords}-${maxWords} từ chấp nhận được)` : `"Voice-over:" must have length of ${targetWords} words (${minWords}-${maxWords} accepted)`}

`;

        const sceneLabel = language === 'vi' ? 'SCENE' : 'SCENE';
        const issueLabel = language === 'vi' ? 'Vấn đề' : 'Issue';
        const currentLabel = language === 'vi' ? 'Nội dung hiện tại' : 'Current content';
        const formatLabel = language === 'vi' ? 'FORMAT BẮT BUỘC' : 'REQUIRED FORMAT';
        const returnLabel = language === 'vi' ? 'CHỈ TRẢ VỀ NỘI DUNG ĐÃ SỬA, KHÔNG GIẢI THÍCH.' : 'ONLY RETURN FIXED CONTENT, NO EXPLANATIONS.';

        scenesToFix.forEach((result, idx) => {
            if (result.sceneData) {
                prompt += `
--- ${sceneLabel} ${result.sceneData.sceneNum} (${language === 'vi' ? 'Cần sửa' : 'Needs fix'}) ---
${issueLabel}: ${result.issues.join(', ')}
${currentLabel}:
${`Scene ${result.sceneData.sceneNum}: ${result.sceneData.title}
${imageLabel}: ${result.sceneData.visual}
${voiceoverLabel}: ${result.sceneData.voiceover}`}

`;
            }
        });

        prompt += `
${formatLabel} (${language === 'vi' ? 'TRẢ VỀ TẤT CẢ SCENES ĐÃ SỬA' : 'RETURN ALL FIXED SCENES'}):
\`\`\`
Scene 1: [Fixed scene title]
${imageLabel}: [Fixed description]
${voiceoverLabel}: [Fixed content] (${targetWords} ${wordUnit})

Scene 2: [Fixed scene title]
${imageLabel}: [Fixed description]
${voiceoverLabel}: [Fixed content] (${targetWords} ${wordUnit})
...
\`\`\`

${returnLabel}
`;

        return prompt;
    }

    private async callWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeout}ms`));
            }, timeout);

            promise.then(
                result => {
                    clearTimeout(timer);
                    resolve(result);
                },
                error => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    }
}

export const autoFixEngine = new AutoFixEngine();
