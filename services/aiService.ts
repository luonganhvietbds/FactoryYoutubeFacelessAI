/**
 * AI Service - Multi-Model Architecture
 * Unified service replacing geminiService.ts
 * 
 * This service maintains backward compatibility while using the new adapter architecture.
 * All existing code can import from this file without changes.
 */

import {
    getAdapterForStep,
    setFallbackApiKey,
    isSafeMode,
    getModelIdForStep,
} from '@/lib/ai/factory';
import { AIRequest } from '@/lib/ai/types';
import { normalizeText, extractJSON } from '@/lib/ai/normalizer';
import { countVietnameseWords } from '@/lib/wordCounter';
import { logError } from '@/lib/errorTracker';
import type { SceneWarning } from '@/lib/types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCENES_PER_BATCH = 3;

// ============================================================================
// STEP 1: GET NEWS AND EVENTS
// ============================================================================

export const getNewsAndEvents = async (
    apiKey: string,
    keyword: string,
    systemPrompt: string,
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    // Ensure fallback key is set
    setFallbackApiKey(apiKey);

    const adapter = getAdapterForStep(1);
    const request: AIRequest = {
        systemPrompt,
        userMessage: `Chủ đề/Từ khóa cần tìm kiếm: "${keyword}"`,
        useSearch: true, // Step 1 always uses Google Search grounding
    };

    console.log(`🔍 Step 1 using model: ${getModelIdForStep(1)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    const response = await adapter.generateContent(request);
    return response.content;
};

// ============================================================================
// STEP 2: CREATE OUTLINE BATCH (with validation loop)
// ============================================================================

export interface OutlineBatchResult {
    content: string;
    warnings: SceneWarning[];
}

export const createOutlineBatch = async (
    apiKey: string,
    newsData: string,
    systemPrompt: string,
    currentOutline: string,
    batchIndex: number,
    sceneCount: number,
    targetWords: number,
    tolerance: number,
    onRetry?: (reason: string, attempt: number) => void
): Promise<OutlineBatchResult> => {
    setFallbackApiKey(apiKey);

    const minWords = targetWords - tolerance;
    const maxWords = targetWords + tolerance;

    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = Math.min(startScene + SCENES_PER_BATCH - 1, sceneCount);

    if (startScene > sceneCount) return { content: "END_OF_OUTLINE", warnings: [] };

    const adapter = getAdapterForStep(2);
    console.log(`📝 Step 2 Batch ${batchIndex + 1} using model: ${getModelIdForStep(2)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    let attempts = 0;
    const MAX_RETRIES = 3;
    let feedback = "";
    let lastResult: OutlineBatchResult = { content: "FAILED", warnings: [] };

    const expectedScenesList = Array.from({ length: endScene - startScene + 1 }, (_, i) => startScene + i);
    const requiredScenesStr = expectedScenesList.map(s => `Scene ${s}`).join(", ");

    while (attempts < MAX_RETRIES) {
        const userPrompt = `
Thông tin đầu vào (Tin tức/Sự kiện):
${newsData}

Dàn ý đã có (Context):
${currentOutline.slice(-2000)}

NHIỆM VỤ HIỆN TẠI (Batch scenes ${startScene} -> ${endScene}):
Hãy lập tiếp dàn ý chi tiết cho các cảnh: **${requiredScenesStr}**.
Tổng số cảnh dự kiến: ${sceneCount}.

===== QUY TẮC ĐẾM TỪ TIẾNG VIỆT =====
Mỗi ÂM TIẾT tách biệt bằng KHOẢNG TRẮNG = 1 TỪ.
Ví dụ: "Mẹ kế không phải ác quỷ" = 6 từ.
=======================================

YÊU CẦU VỀ LỜI DẪN (VOICE OVER):
1. Mỗi cảnh PHẢI có mục "**Lời dẫn:**".
2. Độ dài MỤC TIÊU: **${targetWords} từ** (chấp nhận từ ${minWords} đến ${maxWords} từ).
3. Cuối mỗi Lời dẫn, ghi số từ thực tế. Ví dụ: (18 từ).

QUY TẮC FORMAT:
Scene ${startScene}: [Tên cảnh]
Hình ảnh: [Mô tả hình ảnh chi tiết]
Lời dẫn: [Nội dung lời dẫn] (Số từ)

... (tiếp tục đến Scene ${endScene})
` + feedback;

        try {
            console.log(`🚀 Batch ${batchIndex + 1} Attempt ${attempts + 1}/${MAX_RETRIES}...`);

            const response = await adapter.generateContent({
                systemPrompt,
                userMessage: userPrompt,
            });

            const rawResponse = response.content;

            // POST-CORRECTION ENGINE - STRICT MODE
            const sceneBlocks = rawResponse.split(/(?=Scene \d+:)/i).filter(block => /^Scene \d+:/i.test(block.trim()));
            const warnings: SceneWarning[] = [];
            const correctedScenesMap = new Map<number, string>();

            // 1. Map blocks to scene numbers
            sceneBlocks.forEach(block => {
                const match = block.match(/Scene (\d+):/i);
                if (match && match[1]) {
                    const sceneNum = parseInt(match[1]);
                    correctedScenesMap.set(sceneNum, block);
                }
            });

            // 2. Validate existence and word count
            const finalScenes: string[] = [];
            let missingScenes: number[] = [];

            for (const sceneNum of expectedScenesList) {
                if (!correctedScenesMap.has(sceneNum)) {
                    missingScenes.push(sceneNum);
                    continue;
                }

                let block = correctedScenesMap.get(sceneNum)!;
                const voMatch = block.match(/Lời dẫn:\s*([\s\S]*?)(?:\s*\(\d+\s*từ\)\s*)?(?=\n\n|$)/i);

                if (voMatch && voMatch[1]) {
                    const rawContent = voMatch[1]
                        .replace(/\(\d+\s*từ\)/g, '')
                        .replace(/\*\*/g, '')
                        .trim();

                    const actualWordCount = countVietnameseWords(rawContent);

                    if (actualWordCount < minWords || actualWordCount > maxWords) {
                        const diff = actualWordCount > maxWords
                            ? actualWordCount - maxWords
                            : actualWordCount - minWords;

                        warnings.push({
                            sceneNum,
                            actual: actualWordCount,
                            target: targetWords,
                            tolerance,
                            diff,
                        });
                    }

                    // Normalize block format
                    block = block.replace(
                        /Lời dẫn:\s*[\s\S]*?(?:\(\d+\s*từ\))?(?=\n\n|$)/i,
                        `Lời dẫn: ${rawContent} (${actualWordCount} từ)`
                    );
                } else {
                    warnings.push({
                        sceneNum,
                        actual: 0,
                        target: targetWords,
                        tolerance,
                        diff: -targetWords,
                    });
                }
                finalScenes.push(block);
            }

            lastResult = {
                content: finalScenes.join('\n\n'),
                warnings,
            };

            // 3. Strict Check: If missing scenes, FORCE RETRY
            if (missingScenes.length > 0) {
                feedback = `\n⚠️ LỖI NGHIÊM TRỌNG: Bạn đã bỏ qua các cảnh: ${missingScenes.map(s => `Scene ${s}`).join(", ")}.
👉 YÊU CẦU: Viết lại ĐẦY ĐỦ các cảnh từ Scene ${startScene} đến Scene ${endScene}. Không được bỏ sót bất kỳ cảnh nào.\n`;
                console.warn(`⚠️ Batch ${batchIndex + 1} Attempt ${attempts + 1} Failed: Missing scenes ${missingScenes.join(", ")}`);
                if (onRetry) onRetry(`Missing scenes: ${missingScenes.join(", ")}`, attempts + 1);
                attempts++;
                continue; // Retry loop
            }

            if (warnings.length === 0) {
                console.log(`✅ Batch ${batchIndex + 1} Passed validation on Attempt ${attempts + 1}`);
                return lastResult;
            }

            // Generate feedback for word count issues
            feedback = `\n⚠️ CÁC LỖI CẦN SỬA NGAY (Lần thử ${attempts + 1}/${MAX_RETRIES}):\n`;
            warnings.forEach(w => {
                if (w.actual === 0) {
                    feedback += `- Scene ${w.sceneNum}: Thiếu mục "Lời dẫn". Hãy bổ sung ngay.\n`;
                } else if (w.actual > maxWords) {
                    feedback += `- Scene ${w.sceneNum}: ${w.actual} từ (QUÁ DÀI, target ${targetWords}). \n  👉 YÊU CẦU: Rút gọn ngay! Viết cô đọng, bỏ bớt từ thừa.\n`;
                } else if (w.actual < minWords) {
                    feedback += `- Scene ${w.sceneNum}: ${w.actual} từ (QUÁ NGẮN, target ${targetWords}). \n  👉 YÊU CẦU: Viết thêm chi tiết! Mô tả kỹ hơn hành động/cảm xúc.\n`;
                }
            });

            console.warn(`⚠️ Batch ${batchIndex + 1} Attempt ${attempts + 1} Failed validation. Retrying...`);
            if (onRetry) onRetry(`Validation failed`, attempts + 1);
            attempts++;

        } catch (e: any) {
            console.error(`AI Service Error (Attempt ${attempts + 1}):`, e);
            logError(2, `API Error at Batch ${batchIndex + 1} Attempt ${attempts + 1}: ${e.message}`, 'ERROR', { batchIndex, error: e.message });

            if (onRetry) onRetry(`API Error: ${e.message}`, attempts + 1);
            feedback = `\n⚠️ Lỗi hệ thống: ${e.message}. Hãy thử lại.\n`;
            attempts++;
        }
    }

    console.warn(`⚠️ Batch ${batchIndex + 1} Max Retries Exceeded. Accepting with warnings.`);
    return lastResult;
};

// ============================================================================
// STEP 3: CREATE SCRIPT BATCH
// ============================================================================

export const createScriptBatch = async (
    apiKey: string,
    outline: string,
    systemPrompt: string,
    previousContent: string,
    batchIndex: number,
    sceneCount: number,
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    setFallbackApiKey(apiKey);

    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = Math.min(startScene + SCENES_PER_BATCH - 1, sceneCount);

    if (startScene > sceneCount) return "END_OF_SCRIPT";

    const adapter = getAdapterForStep(3);
    console.log(`🎬 Step 3 Batch ${batchIndex + 1} using model: ${getModelIdForStep(3)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    const userPrompt = `
Dàn ý tổng quát (Tổng số cảnh yêu cầu: ${sceneCount}):
${outline}

Nội dung kịch bản đã viết ở các phần trước (Context):
${previousContent.slice(-2000)} 
...(Context bị cắt bớt)...

NHIỆM VỤ HIỆN TẠI (Batch xử lý cảnh ${startScene} -> ${endScene}):
Hãy viết kịch bản chi tiết CHO ĐÚNG các cảnh từ **Scene ${startScene}** đến **Scene ${endScene}**.

QUY TẮC:
1. Bắt đầu ngay với "**Scene ${startScene}:**".
2. Viết lần lượt đến "**Scene ${endScene}**".
3. KHÔNG viết vượt quá Scene ${endScene} trong lần trả lời này.
4. Giữ đúng format: Visual và Audio/Voice Over.
5. Nếu đây là batch cuối cùng (Scene ${endScene} == ${sceneCount}), hãy viết thêm phần Kết luận (Conclusion) nếu cần.
`;

    const response = await adapter.generateContent({
        systemPrompt,
        userMessage: userPrompt,
    });

    return response.content;
};

// ============================================================================
// STEP 4: GENERATE PROMPTS BATCH
// ============================================================================

export const generatePromptsBatch = async (
    apiKey: string,
    scriptChunk: string,
    systemPrompt: string,
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    setFallbackApiKey(apiKey);

    const adapter = getAdapterForStep(4);
    console.log(`🎨 Step 4 using model: ${getModelIdForStep(4)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    const userPrompt = `
Phần kịch bản cần xử lý:
${scriptChunk}

NHIỆM VỤ:
Trích xuất Image Prompts và Video Prompts cho các cảnh trong đoạn kịch bản trên thành JSON.
Lưu ý: Chỉ trả về JSON thuần túy, không markdown.
`;

    const response = await adapter.generateContent({
        systemPrompt,
        userMessage: userPrompt,
    });

    return response.content;
};

// ============================================================================
// STEP 5: EXTRACT VOICE OVER
// ============================================================================

export const extractVoiceOver = async (
    apiKey: string,
    fullScript: string,
    systemPrompt: string,
    minWords: number,
    maxWords: number,
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    setFallbackApiKey(apiKey);

    const adapter = getAdapterForStep(5);
    console.log(`🎙️ Step 5 using model: ${getModelIdForStep(5)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    const userPrompt = `
Kịch bản chi tiết cần trích xuất Voice Over:

${fullScript}

YÊU CẦU ĐẶC BIỆT VỀ ĐỘ DÀI:
- Mỗi câu Voice Over phải có độ dài từ **${minWords} đến ${maxWords} từ**.
- Nếu câu quá ngắn, hãy gộp hoặc viết thêm cho đủ ý.
- Nếu câu quá dài, hãy tách thành 2 câu.
`;

    const response = await adapter.generateContent({
        systemPrompt,
        userMessage: userPrompt,
    });

    return response.content;
};

// ============================================================================
// STEP 6: CREATE METADATA
// ============================================================================

export const createMetadata = async (
    apiKey: string,
    detailedScript: string,
    systemPrompt: string,
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    setFallbackApiKey(apiKey);

    const adapter = getAdapterForStep(6);
    console.log(`📋 Step 6 using model: ${getModelIdForStep(6)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    const response = await adapter.generateContent({
        systemPrompt,
        userMessage: `Nội dung kịch bản:\n${detailedScript.slice(0, 30000)}`,
    });

    return response.content;
};

// ============================================================================
// HELPERS (from geminiService.ts)
// ============================================================================

export const splitScriptIntoChunks = (fullScript: string): string[] => {
    const sceneRegex = /(?=\n\s*(?:Scene|Cảnh)\s+\d+[:.])/i;
    const parts = fullScript.split(sceneRegex).filter(p => p.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = "";
    let count = 0;

    for (const part of parts) {
        currentChunk += part;
        count++;
        if (count >= 3) {
            chunks.push(currentChunk);
            currentChunk = "";
            count = 0;
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk);
    }
    return chunks.length > 0 ? chunks : [fullScript];
};

export const mergePromptJsons = (jsonStrings: string[]): string => {
    let allImages: string[] = [];
    let allVideos: string[] = [];

    jsonStrings.forEach(str => {
        try {
            const cleanStr = str.replace(/```json/g, '').replace(/```/g, '').trim();
            const start = cleanStr.indexOf('{');
            const end = cleanStr.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                const json = JSON.parse(cleanStr.substring(start, end + 1));
                if (json.imagePrompts && Array.isArray(json.imagePrompts)) allImages.push(...json.imagePrompts);
                if (json.videoPrompts && Array.isArray(json.videoPrompts)) allVideos.push(...json.videoPrompts);
            }
        } catch (e) {
            console.error("Error parsing batch JSON:", e);
        }
    });

    return JSON.stringify({
        imagePrompts: allImages,
        videoPrompts: allVideos
    }, null, 2);
};

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Export factory functions for advanced usage
export {
    getAdapterForStep,
    getModelIdForStep,
    isSafeMode,
    setSafeMode,
    setStepBinding,
    resetBindings,
    addProviderKeys,
    getStepBindings,
    MODELS,
} from '@/lib/ai/factory';
