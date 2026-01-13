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
import { countVietnameseWords } from '@/lib/wordCounter';
import { logError } from '@/lib/errorTracker';

const AUTO_FIX_TIMEOUT = 30000;
const MAX_SCENES_PER_FIX = 5;

export class AutoFixEngine {
    private readonly adapter = getAdapterForStep(2);

    async fixScene(
        sceneData: SceneData,
        targetWords: number,
        tolerance: number,
        systemPrompt: string
    ): Promise<FixedScene> {
        const minWords = targetWords - tolerance;
        const maxWords = targetWords + tolerance;

        const issues = sceneValidator.validateSceneStructure(
            `Scene ${sceneData.sceneNum}: ${sceneData.title}\n` +
            `Hình ảnh: ${sceneData.visual}\n` +
            `Lời dẫn: ${sceneData.voiceover}`
        );

        const fixReasons = issues.issues.map(issue => {
            switch (issue) {
                case 'missing_visual': return 'Thiếu mô tả hình ảnh';
                case 'missing_voiceover': return 'Thiếu lời dẫn';
                case 'visual_too_short': return 'Mô tả hình ảnh quá ngắn';
                case 'voiceover_missing': return 'Thiếu voiceover';
                default: return issue;
            }
        });

        const userPrompt = this.buildFixPrompt(sceneData, fixReasons, targetWords, minWords, maxWords);

        try {
            const response = await this.callWithTimeout(
                this.adapter.generateContent({
                    systemPrompt,
                    userMessage: userPrompt
                }),
                AUTO_FIX_TIMEOUT
            );

            const fixedContent = response.content;
            const revalidate = sceneValidator.validateSceneStructure(fixedContent);

            return {
                sceneNum: sceneData.sceneNum,
                originalContent: `Scene ${sceneData.sceneNum}: ${sceneData.title}\nHình ảnh: ${sceneData.visual}\nLời dẫn: ${sceneData.voiceover}`,
                fixedContent,
                fixReasons,
                isValidAfterFix: revalidate.isValid || (revalidate.sceneData !== null && revalidate.issues.length <= 1)
            };
        } catch (error: any) {
            logError(2, `Auto-fix failed for Scene ${sceneData.sceneNum}: ${error.message}`, 'ERROR');
            return {
                sceneNum: sceneData.sceneNum,
                originalContent: `Scene ${sceneData.sceneNum}: ${sceneData.title}\nHình ảnh: ${sceneData.visual}\nLời dẫn: ${sceneData.voiceover}`,
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
        context: string
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

        const batchPrompt = this.buildBatchFixPrompt(scenesToFix, targetWords, tolerance, systemPrompt, context);
        const minWords = targetWords - tolerance;
        const maxWords = targetWords + tolerance;

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
                const revalidate = sceneValidator.validateSceneStructure(block);
                const sceneNumMatch = block.match(/Scene\s*(\d+)/i);

                if (sceneNumMatch) {
                    const sceneNum = parseInt(sceneNumMatch[1]);
                    const original = scenesToFix.find(s => s.sceneData?.sceneNum === sceneNum);

                    fixedScenes.push({
                        sceneNum,
                        originalContent: original?.sceneData
                            ? `Scene ${original.sceneData.sceneNum}: ${original.sceneData.title}\nHình ảnh: ${original.sceneData.visual}\nLời dẫn: ${original.sceneData.voiceover}`
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
                        originalContent: `Scene ${validationResult.sceneData.sceneNum}: ${validationResult.sceneData.title}\nHình ảnh: ${validationResult.sceneData.visual}\nLời dẫn: ${validationResult.sceneData.voiceover}`,
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

    applyFixes(originalOutline: string, fixes: FixedScene[]): string {
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
        maxWords: number
    ): string {
        return `
=== NHIỆM VỤ SỬA LỖI SCENE ===

CẢNH CẦN SỬA: Scene ${sceneData.sceneNum}

VẤN ĐỀ PHÁT HIỆN:
${fixReasons.map(r => `- ${r}`).join('\n')}

NỘI DUNG HIỆN TẠI:
---
Scene ${sceneData.sceneNum}: ${sceneData.title}
Hình ảnh: ${sceneData.visual}
Lời dẫn: ${sceneData.voiceover}
---

YÊU CẦU SỬA CHỮA:
1. Bổ sung đầy đủ các thành phần bị thiếu
2. Đảm bảo "Hình ảnh:" có ít nhất 10 từ mô tả chi tiết
3. Đảm bảo "Lời dẫn:" có độ dài ${targetWords} từ (chấp nhận ${minWords}-${maxWords} từ)
4. Viết lại nội dung để phù hợp với ngữ cảnh tổng thể

FORMAT BẮT BUỘC:
\`\`\`
Scene ${sceneData.sceneNum}: [Tên cảnh]
Hình ảnh: [Mô tả chi tiết - ít nhất 10 từ]
Lời dẫn: [Nội dung voiceover] (${targetWords} từ)
\`\`\`

CHỈ TRẢ VỀ NỘI DUNG SCENE ĐÃ SỬA, KHÔNG GIẢI THÍCH.
`;
    }

    private buildBatchFixPrompt(
        scenesToFix: ValidationResult[],
        targetWords: number,
        tolerance: number,
        systemPrompt: string,
        context: string
    ): string {
        const minWords = targetWords - tolerance;
        const maxWords = targetWords + tolerance;

        let prompt = `
=== NHIỆM VỤ SỬA LỖI NHIỀU SCENES ===

TỔNG SỐ SCENES CẦN SỬA: ${scenesToFix.length}

CONTEXT:
${context.slice(0, 2000)}

YÊU CẦU:
- Sửa TẤT CẢ scenes bên dưới
- Đảm bảo đầy đủ 3 thành phần: "Scene X:", "Hình ảnh:", "Lời dẫn:"
- "Hình ảnh:" phải có ít nhất 10 từ mô tả
- "Lời dẫn:" phải có độ dài ${targetWords} từ (${minWords}-${maxWords} từ chấp nhận được)

`;

        scenesToFix.forEach((result, idx) => {
            if (result.sceneData) {
                prompt += `
--- SCENE ${result.sceneData.sceneNum} (Cần sửa) ---
Vấn đề: ${result.issues.join(', ')}
Nội dung hiện tại:
${`Scene ${result.sceneData.sceneNum}: ${result.sceneData.title}
Hình ảnh: ${result.sceneData.visual}
Lời dẫn: ${result.sceneData.voiceover}`}

`;
            }
        });

        prompt += `
FORMAT BẮT BUỘC (TRẢ VỀ TẤT CẢ SCENES ĐÃ SỬA):
\`\`\`
Scene 1: [Tên cảnh đã sửa]
Hình ảnh: [Mô tả đã sửa]
Lời dẫn: [Nội dung đã sửa] (X từ)

Scene 2: [Tên cảnh đã sửa]
Hình ảnh: [Mô tả đã sửa]
Lời dẫn: [Nội dung đã sửa] (X từ)
...
\`\`\`

CHỈ TRẢ VỀ NỘI DUNG ĐÃ SỬA, KHÔNG GIẢI THÍCH.
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
