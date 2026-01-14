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
import { countWords, countVietnameseWords } from '@/lib/wordCounter';
import { logError } from '@/lib/errorTracker';
import type {
    SceneWarning,
    EnhancedOutlineBatchResult
} from '@/lib/types';
import { sceneValidator } from '@/lib/validator';
import { autoFixEngine } from './autoFixEngine';
import { Language, LANGUAGE_CONFIGS } from '@/lib/languageConfig';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCENES_PER_BATCH = 3;
const MAX_AUTO_FIX_ATTEMPTS = 3;

// ============================================================================
// LANGUAGE-AWARE PROMPT TEMPLATES
// ============================================================================

const getWordCountInstructions = (language: Language) => {
    const config = LANGUAGE_CONFIGS[language];
    return language === 'vi'
        ? `
===== QUY TẮC ĐẾM TỪ TIẾNG VIỆT =====
Mỗi ÂM TIẾT tách biệt bằng KHOẢNG TRẮNG = 1 TỪ.
Ví dụ: "Mẹ kế không phải ác quỷ" = 6 từ.
======================================`
        : `
===== ENGLISH WORD COUNT RULES =====
Count each WORD separated by SPACES.
Example: "The stepmother is not a devil" = 7 words.
======================================`;
};

const getVoiceoverRequirements = (language: Language, targetWords: number, minWords: number, maxWords: number) => {
    const config = LANGUAGE_CONFIGS[language];
    const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
    const wordUnit = config.wordUnit;
    
    return language === 'vi'
        ? `
YÊU CẦU VỀ ${voiceoverLabel.toUpperCase()}:
1. Mỗi cảnh PHẢI có mục "**${voiceoverLabel}:**".
2. Độ dài MỤC TIÊU: **${targetWords} ${wordUnit}** (chấp nhận từ ${minWords} đến ${maxWords} ${wordUnit}).
3. Cuối mỗi ${voiceoverLabel}, ghi số ${wordUnit} thực tế. Ví dụ: (18 ${wordUnit}).`
        : `
${voiceoverLabel.toUpperCase()} REQUIREMENTS:
1. Each scene MUST have "**${voiceoverLabel}:**" section.
2. TARGET LENGTH: **${targetWords} ${wordUnit}** (accept ${minWords}-${maxWords} ${wordUnit}).
3. At the end of each ${voiceoverLabel}, write the actual word count. Example: (18 ${wordUnit}).`;
};

const getFormatRules = (language: Language, startScene: number, endScene: number) => {
    const config = LANGUAGE_CONFIGS[language];
    const sceneLabel = language === 'vi' ? 'Scene' : 'Scene';
    const imageLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
    const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
    const wordUnit = config.wordUnit;
    
    return language === 'vi'
        ? `
QUY TẮC FORMAT:
${sceneLabel} ${startScene}: [Tên cảnh]
${imageLabel}: [Mô tả hình ảnh chi tiết]
${voiceoverLabel}: [Nội dung ${voiceoverLabel.toLowerCase()}] (Số ${wordUnit})

... (tiếp tục đến ${sceneLabel} ${endScene})`
        : `
FORMAT RULES:
${sceneLabel} ${startScene}: [Scene Title]
${imageLabel}: [Detailed visual description]
${voiceoverLabel}: [${voiceoverLabel.toLowerCase()} content] (Word count)

... (continue to ${sceneLabel} ${endScene})`;
};

const getMissingSceneFeedback = (language: Language, missingScenes: number[], startScene: number, endScene: number) => {
    const missingStr = missingScenes.map(s => `Scene ${s}`).join(", ");
    return language === 'vi'
        ? `\n⚠️ LỖI NGHIÊM TRỌNG: Bạn đã bỏ qua các cảnh: ${missingStr}.
👉 YÊU CẦU: Viết lại ĐẦY ĐỦ các cảnh từ Scene ${startScene} đến Scene ${endScene}. Không được bỏ sót bất kỳ cảnh nào.\n`
        : `\n⚠️ CRITICAL ERROR: You skipped the following scenes: ${missingStr}.
👉 REQUIRED: Rewrite ALL scenes from Scene ${startScene} to Scene ${endScene}. Do not skip any scenes.\n`;
};

const getValidationFeedback = (language: Language, warnings: SceneWarning[], targetWords: number, maxWords: number, minWords: number) => {
    const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
    const wordUnit = LANGUAGE_CONFIGS[language].wordUnit;
    
    let feedback = `\n⚠️ ERRORS TO FIX IMMEDIATELY (Attempt ${warnings.length + 1}):\n`;
    
    warnings.forEach(w => {
        if (w.actual === 0) {
            feedback += language === 'vi'
                ? `- Scene ${w.sceneNum}: Thiếu mục "${voiceoverLabel}". Hãy bổ sung ngay.\n`
                : `- Scene ${w.sceneNum}: Missing "${voiceoverLabel}" section. Add it immediately.\n`;
        } else if (w.actual > maxWords) {
            feedback += language === 'vi'
                ? `- Scene ${w.sceneNum}: ${w.actual} ${wordUnit} (QUÁ DÀI, target ${targetWords}). \n  👉 YÊU CẦU: Rút gọn ngay! Viết cô đọng, bỏ bớt từ thừa.\n`
                : `- Scene ${w.sceneNum}: ${w.actual} ${wordUnit} (TOO LONG, target ${targetWords}). \n  👉 REQUIRED: Shorten immediately! Be concise, remove unnecessary words.\n`;
        } else if (w.actual < minWords) {
            feedback += language === 'vi'
                ? `- Scene ${w.sceneNum}: ${w.actual} ${wordUnit} (QUÁ NGẮN, target ${targetWords}). \n  👉 YÊU CẦU: Viết thêm chi tiết! Mô tả kỹ hơn hành động/cảm xúc.\n`
                : `- Scene ${w.sceneNum}: ${w.actual} ${wordUnit} (TOO SHORT, target ${targetWords}). \n  👉 REQUIRED: Add more details! Describe actions/emotions more thoroughly.\n`;
        }
    });
    
    return feedback;
};

const getRecoveryPrompt = (language: Language, missingScenesStr: string, currentOutline: string, lastResult: string, targetWords: number) => {
    const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
    const wordUnit = LANGUAGE_CONFIGS[language].wordUnit;
    
    return language === 'vi'
        ? `
NHIỆM VỤ KHẨN CẤP (RECOVERY):
Viết NGAY các cảnh sau: **${missingScenesStr}**

Context:
${currentOutline.slice(-1500)}
${lastResult.slice(-1500)}

YÊU CẦU:
1. Viết ĐẦY ĐỦ: ${missingScenesStr}.
2. Format: Scene X: [Tên] / Hình ảnh: [...] / ${voiceoverLabel}: [...] (${targetWords} ${wordUnit})
`
        : `
URGENT RECOVERY TASK:
Write IMMEDIATELY the following scenes: **${missingScenesStr}**

Context:
${currentOutline.slice(-1500)}
${lastResult.slice(-1500)}

REQUIREMENTS:
1. Write COMPLETE: ${missingScenesStr}.
2. Format: Scene X: [Title] / Image: [...] / ${voiceoverLabel}: [...] (${targetWords} ${wordUnit})
`;
};

// ============================================================================
// STEP 3-6 LANGUAGE-AWARE PROMPT TEMPLATES
// ============================================================================

const getScriptBatchPrompt = (language: Language, outline: string, previousContent: string, startScene: number, endScene: number, sceneCount: number) => {
    const config = LANGUAGE_CONFIGS[language];
    
    if (language === 'vi') {
        return `
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
    } else {
        return `
Overall outline (Total scenes required: ${sceneCount}):
${outline}

Previously written script content (Context):
${previousContent.slice(-2000)} 
...(Context truncated)...

CURRENT TASK (Batch processing scenes ${startScene} -> ${endScene}):
Write detailed script for scenes from **Scene ${startScene}** to **Scene ${endScene}**.

RULES:
1. Start immediately with "**Scene ${startScene}:**".
2. Continue sequentially to "**Scene ${endScene}**".
3. Do NOT write beyond Scene ${endScene} in this response.
4. Maintain correct format: Visual and Audio/Voice Over.
5. If this is the last batch (Scene ${endScene} == ${sceneCount}), add a Conclusion section if needed.
`;
    }
};

const getPromptsBatchPrompt = (language: Language, scriptChunk: string) => {
    const visualLabel = language === 'vi' ? 'Hình ảnh' : 'Image';
    
    if (language === 'vi') {
        return `
Phần kịch bản cần xử lý:
${scriptChunk}

NHIỆM VỤ (PURE EXTRACTION):
Trích xuất NGUYÊN VĂN nội dung mục "${visualLabel}" của từng cảnh thành JSON.

YÊU CẦU BẮT BUỘC:
1. KHÔNG sáng tạo thêm. KHÔNG chỉnh sửa nội dung.
2. Nếu kịch bản ghi: "${visualLabel}: Một con mèo đang ngủ." -> JSON phải là: "image_prompt": "Một con mèo đang ngủ."
3. Chỉ trả về JSON thuần túy.

Cấu trúc JSON:`;
    } else {
        return `
Script segment to process:
${scriptChunk}

TASK (PURE EXTRACTION):
Extract the ORIGINAL content of the "${visualLabel}" section for each scene as JSON.

MANDATORY REQUIREMENTS:
1. Do NOT add creativity. Do NOT modify content.
2. If script says: "${visualLabel}: A cat is sleeping." -> JSON must be: "image_prompt": "A cat is sleeping."
3. Return pure JSON only.

JSON structure:`;
    }
};

const getVoiceoverExtractionPrompt = (language: Language, fullScript: string) => {
    const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
    const contentLabel = language === 'vi' ? 'Nội dung Lời dẫn nguyên văn' : 'Original Voice-over content';
    
    if (language === 'vi') {
        return `
Kịch bản chi tiết cần trích xuất Voice Over:

${fullScript}

NHIỆM VỤ (PURE EXTRACTION):
Trích xuất NGUYÊN VĂN nội dung mục "${voiceoverLabel}" (Voice Over) của từng cảnh.

YÊU CẦU BẮT BUỘC:
1. TUYỆT ĐỐI KHÔNG CHỈNH SỬA, KHÔNG THÊM BỚT TỪ.
2. KHÔNG gộp câu, KHÔNG tách câu.
3. Kịch bản gốc viết thế nào, trích xuất y hệt thế ấy.
4. Bỏ qua mọi yêu cầu về độ dài (min/max words). Độ dài là do kịch bản gốc quyết định.

Output format:
Scene X: [${contentLabel}]
Scene Y: [${contentLabel}]
...
`;
    } else {
        return `
Detailed script for Voice Over extraction:

${fullScript}

TASK (PURE EXTRACTION):
Extract the ORIGINAL content of the "${voiceoverLabel}" section for each scene.

MANDATORY REQUIREMENTS:
1. ABSOLUTELY DO NOT MODIFY, DO NOT ADD OR REMOVE WORDS.
2. Do NOT combine sentences, do NOT split sentences.
3. Extract exactly as written in the original script.
4. Ignore any length requirements (min/max words). Length is determined by the original script.

Output format:
Scene X: [${contentLabel}]
Scene Y: [${contentLabel}]
...
`;
    }
};

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

    console.log(`Step 1 using model: ${getModelIdForStep(1)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

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
    language: Language = 'vi',
    onRetry?: (reason: string, attempt: number) => void
): Promise<OutlineBatchResult> => {
    setFallbackApiKey(apiKey);

    const minWords = targetWords - tolerance;
    const maxWords = targetWords + tolerance;

    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = Math.min(startScene + SCENES_PER_BATCH - 1, sceneCount);

    if (startScene > sceneCount) return { content: "END_OF_OUTLINE", warnings: [] };

    const adapter = getAdapterForStep(2);
    console.log(`Step 2 Batch ${batchIndex + 1} using model: ${getModelIdForStep(2)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    let attempts = 0;
    const MAX_RETRIES = 5; // Increased from 3 for better scene recovery
    let feedback = "";
    let lastResult: OutlineBatchResult = { content: "FAILED", warnings: [] };
    let missingScenes: number[] = []; // Track missing scenes across attempts

    const expectedScenesList = Array.from({ length: endScene - startScene + 1 }, (_, i) => startScene + i);
    const requiredScenesStr = expectedScenesList.map(s => `Scene ${s}`).join(", ");

    const infoLabel = language === 'vi' ? 'Thông tin đầu vào (Tin tức/Sự kiện)' : 'Input Information (News/Events)';
    const contextLabel = language === 'vi' ? 'Dàn ý đã có (Context)' : 'Existing Outline (Context)';
    const taskLabel = language === 'vi' ? 'NHIỆM VỤ HIỆN TẠI' : 'CURRENT TASK';
    const batchLabel = language === 'vi' ? '(Batch scenes' : '(Batch scenes';
    
    while (attempts < MAX_RETRIES) {
        const userPrompt = `
${infoLabel}:
${newsData}

${contextLabel}:
${currentOutline.slice(-2000)}

${taskLabel} ${batchLabel} ${startScene} -> ${endScene}):
${language === 'vi' ? 'Hãy lập tiếp dàn ý chi tiết cho các cảnh:' : 'Continue creating detailed outline for scenes:'} **${requiredScenesStr}**.
${language === 'vi' ? 'Tổng số cảnh dự kiến:' : 'Total expected scenes:'} ${sceneCount}.

${getWordCountInstructions(language)}

${getVoiceoverRequirements(language, targetWords, minWords, maxWords)}

${getFormatRules(language, startScene, endScene)}
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
            const voiceoverPattern = language === 'vi' 
                ? /Lời dẫn:\s*([\s\S]*?)(?:\s*\(\d+\s*từ\)\s*)?(?=\n\n|$)/i
                : /Voice-over:\s*([\s\S]*?)(?:\s*\(\d+\s*words?\)\s*)?(?=\n\n|$)/i;
            
            const voiceoverReplacePattern = language === 'vi'
                ? /Lời dẫn:\s*[\s\S]*?(?:\(\d+\s*từ\))?(?=\n\n|$)/i
                : /Voice-over:\s*[\s\S]*?(?:\(\d+\s*words?\))?(?=\n\n|$)/i;
            
            const wordUnitPattern = language === 'vi' ? /\(\d+\s*từ\)/g : /\(\d+\s*words?\)/gi;
            
            const finalScenes: string[] = [];
            missingScenes = []; // Reset for this attempt

            for (const sceneNum of expectedScenesList) {
                if (!correctedScenesMap.has(sceneNum)) {
                    missingScenes.push(sceneNum);
                    continue;
                }

                let block = correctedScenesMap.get(sceneNum)!;
                const voMatch = block.match(voiceoverPattern);

                if (voMatch && voMatch[1]) {
                    const rawContent = voMatch[1]
                        .replace(wordUnitPattern, '')
                        .replace(/\*\*/g, '')
                        .trim();

                    const actualWordCount = countWords(rawContent, language);

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
                    const wordUnit = LANGUAGE_CONFIGS[language].wordUnit;
                    const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
                    block = block.replace(
                        voiceoverReplacePattern,
                        `${voiceoverLabel}: ${rawContent} (${actualWordCount} ${wordUnit})`
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
                feedback = getMissingSceneFeedback(language, missingScenes, startScene, endScene);
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
            feedback = getValidationFeedback(language, warnings, targetWords, maxWords, minWords);

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

    // ===== RECOVERY PASS: Fill Missing Scenes =====
    if (missingScenes.length > 0) {
        console.log(`🔧 Recovery Pass: Attempting to fill ${missingScenes.length} missing scenes: ${missingScenes.join(", ")}`);
        const missingScenesStr = missingScenes.map(s => `Scene ${s}`).join(", ");
        const recoveryPrompt = getRecoveryPrompt(language, missingScenesStr, currentOutline, lastResult.content, targetWords);
        try {
            const recoveryResponse = await adapter.generateContent({ systemPrompt, userMessage: recoveryPrompt });
            const recoveryBlocks = recoveryResponse.content.split(/(?=Scene \d+:)/i).filter(block => /^Scene \d+:/i.test(block.trim()));
            const recoveredScenesMap = new Map<number, string>();
            recoveryBlocks.forEach(block => {
                const match = block.match(/Scene (\d+):/i);
                if (match && match[1]) recoveredScenesMap.set(parseInt(match[1]), block);
            });

            // Merge into lastResult
            const allScenes = lastResult.content.split(/(?=Scene \d+:)/i).filter(block => /^Scene \d+:/i.test(block.trim()));
            const allScenesMap = new Map<number, string>();
            allScenes.forEach(block => {
                const match = block.match(/Scene (\d+):/i);
                if (match && match[1]) allScenesMap.set(parseInt(match[1]), block);
            });

            recoveredScenesMap.forEach((block, sceneNum) => {
                if (!allScenesMap.has(sceneNum)) {
                    allScenesMap.set(sceneNum, block);
                    console.log(`✅ Recovered Scene ${sceneNum}`);
                }
            });

            const sortedScenes = Array.from(allScenesMap.entries()).sort((a, b) => a[0] - b[0]).map(entry => entry[1]);
            lastResult.content = sortedScenes.join('\n\n');
            console.log(`🔧 Recovery Complete. Total scenes: ${sortedScenes.length}`);
        } catch (e: any) {
            console.error(`Recovery Pass Failed:`, e);
            logError(2, `Recovery Failed: ${e.message}`, 'ERROR', { batchIndex, error: e.message });
        }
    }

    console.warn(`⚠️ Batch ${batchIndex + 1} Max Retries Exceeded. Returning with ${lastResult.warnings.length} warnings.`);
    return lastResult;
};

// ============================================================================
// STEP 2: CREATE OUTLINE BATCH WITH AUTO-FIX (Enhanced Version)
// ============================================================================

export const createOutlineBatchWithAutoFix = async (
    apiKey: string,
    newsData: string,
    systemPrompt: string,
    currentOutline: string,
    batchIndex: number,
    sceneCount: number,
    targetWords: number,
    tolerance: number,
    language: Language = 'vi',
    onRetry?: (reason: string, attempt: number) => void
): Promise<EnhancedOutlineBatchResult> => {
    setFallbackApiKey(apiKey);

    const minWords = targetWords - tolerance;
    const maxWords = targetWords + tolerance;

    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = Math.min(startScene + SCENES_PER_BATCH - 1, sceneCount);

    if (startScene > sceneCount) {
        return {
            content: "END_OF_OUTLINE",
            warnings: [],
            fixedScenes: [],
            stillInvalid: [],
            qualityMetrics: {
                totalFixed: 0,
                stillInvalid: [],
                recoveryAttempts: 0,
                completionRate: 100,
                fixReasons: []
            },
            validationDetails: {
                totalExpected: sceneCount,
                totalFound: 0,
                validScenes: [],
                invalidScenes: [],
                missingScenes: [],
                completionRate: 0,
                allScenesContent: ''
            }
        };
    }

    const adapter = getAdapterForStep(2);
    console.log(`📝 Step 2 Auto-Fix Batch ${batchIndex + 1} using model: ${getModelIdForStep(2)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    let attempts = 0;
    const MAX_RETRIES = 5;
    let feedback = "";
    let lastContent = "";
    let lastWarnings: SceneWarning[] = [];

    const expectedScenesList = Array.from({ length: endScene - startScene + 1 }, (_, i) => startScene + i);
    const requiredScenesStr = expectedScenesList.map(s => `Scene ${s}`).join(", ");

    const infoLabel = language === 'vi' ? 'Thông tin đầu vào (Tin tức/Sự kiện)' : 'Input Information (News/Events)';
    const contextLabel = language === 'vi' ? 'Dàn ý đã có (Context)' : 'Existing Outline (Context)';
    const taskLabel = language === 'vi' ? 'NHIỆM VỤ HIỆN TẠI' : 'CURRENT TASK';
    const batchLabel = language === 'vi' ? '(Batch scenes' : '(Batch scenes';

    while (attempts < MAX_RETRIES) {
        const userPrompt = `
${infoLabel}:
${newsData}

${contextLabel}:
${currentOutline.slice(-2000)}

${taskLabel} ${batchLabel} ${startScene} -> ${endScene}):
${language === 'vi' ? 'Hãy lập tiếp dàn ý chi tiết cho các cảnh:' : 'Continue creating detailed outline for scenes:'} **${requiredScenesStr}**.
${language === 'vi' ? 'Tổng số cảnh dự kiến:' : 'Total expected scenes:'} ${sceneCount}.

${getWordCountInstructions(language)}

${getVoiceoverRequirements(language, targetWords, minWords, maxWords)}

${getFormatRules(language, startScene, endScene)}
` + feedback;

        try {
            console.log(`🚀 Auto-Fix Batch ${batchIndex + 1} Attempt ${attempts + 1}/${MAX_RETRIES}...`);

            const response = await adapter.generateContent({
                systemPrompt,
                userMessage: userPrompt,
            });

            const rawResponse = response.content;
            lastContent = rawResponse;

            const sceneBlocks = rawResponse.split(/(?=Scene \d+:)/i).filter(block => /^Scene \d+:/i.test(block.trim()));
            const warnings: SceneWarning[] = [];
            const correctedScenesMap = new Map<number, string>();

            sceneBlocks.forEach(block => {
                const match = block.match(/Scene (\d+):/i);
                if (match && match[1]) {
                    const sceneNum = parseInt(match[1]);
                    correctedScenesMap.set(sceneNum, block);
                }
            });

            const finalScenes: string[] = [];
            let missingScenes: number[] = [];

            for (const sceneNum of expectedScenesList) {
                if (!correctedScenesMap.has(sceneNum)) {
                    missingScenes.push(sceneNum);
                    continue;
                }

                let block = correctedScenesMap.get(sceneNum)!;
                const voiceoverPattern = language === 'vi' 
                    ? /Lời dẫn:\s*([\s\S]*?)(?:\s*\(\d+\s*từ\)\s*)?(?=\n\n|$)/i
                    : /Voice-over:\s*([\s\S]*?)(?:\s*\(\d+\s*words?\)\s*)?(?=\n\n|$)/i;
                
                const voiceoverReplacePattern = language === 'vi'
                    ? /Lời dẫn:\s*[\s\S]*?(?:\(\d+\s*từ\))?(?=\n\n|$)/i
                    : /Voice-over:\s*[\s\S]*?(?:\(\d+\s*words?\))?(?=\n\n|$)/i;
                
                const wordUnitPattern = language === 'vi' ? /\(\d+\s*từ\)/g : /\(\d+\s*words?\)/gi;

                if (voMatch && voMatch[1]) {
                    const rawContent = voMatch[1]
                        .replace(wordUnitPattern, '')
                        .replace(/\*\*/g, '')
                        .trim();

                    const actualWordCount = countWords(rawContent, language);

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

                    const wordUnit = LANGUAGE_CONFIGS[language].wordUnit;
                    const voiceoverLabel = language === 'vi' ? 'Lời dẫn' : 'Voice-over';
                    block = block.replace(
                        voiceoverReplacePattern,
                        `${voiceoverLabel}: ${rawContent} (${actualWordCount} ${wordUnit})`
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

            lastContent = finalScenes.join('\n\n');
            lastWarnings = warnings;

            if (missingScenes.length > 0) {
                feedback = getMissingSceneFeedback(language, missingScenes, startScene, endScene);
                console.warn(`⚠️ Batch ${batchIndex + 1} Attempt ${attempts + 1} Failed: Missing scenes ${missingScenes.join(", ")}`);
                if (onRetry) onRetry(`Missing scenes: ${missingScenes.join(", ")}`, attempts + 1);
                attempts++;
                continue;
            }

            attempts++;

        } catch (e: any) {
            console.error(`AI Service Error (Attempt ${attempts + 1}):`, e);
            logError(2, `API Error at Batch ${batchIndex + 1} Attempt ${attempts + 1}: ${e.message}`, 'ERROR', { batchIndex, error: e.message });

            if (onRetry) onRetry(`API Error: ${e.message}`, attempts + 1);
            feedback = `\n⚠️ Lỗi hệ thống: ${e.message}. Hãy thử lại.\n`;
            attempts++;
        }
    }

    console.log(`🔧 Starting Auto-Fix Phase for Batch ${batchIndex + 1}...`);

    const fixedScenes: number[] = [];
    const stillInvalid: number[] = [];
    const allFixReasons: string[] = [];

    let currentContent = lastContent;

    for (let fixAttempt = 1; fixAttempt <= MAX_AUTO_FIX_ATTEMPTS; fixAttempt++) {
        const validationResult = sceneValidator.validateAllScenes(
            currentContent,
            endScene - startScene + 1
        );

        if (validationResult.completionRate >= 100 && validationResult.invalidScenes.length === 0) {
            console.log(`✅ Auto-Fix Batch ${batchIndex + 1} Attempt ${fixAttempt}: All scenes valid`);
            break;
        }

        if (validationResult.invalidScenes.length > 0) {
            console.log(`🔧 Auto-Fix Attempt ${fixAttempt}: Found ${validationResult.invalidScenes.length} invalid scenes`);

            const fixes = await autoFixEngine.fixMultipleScenes(
                validationResult.invalidScenes,
                targetWords,
                tolerance,
                systemPrompt,
                currentContent,
                language
            );

            const successfulFixes = fixes.filter(f => f.isValidAfterFix && f.fixedContent);
            const failedFixes = fixes.filter(f => !f.isValidAfterFix);

            for (const fix of successfulFixes) {
                if (!fixedScenes.includes(fix.sceneNum)) {
                    fixedScenes.push(fix.sceneNum);
                    allFixReasons.push(...fix.fixReasons);
                }
            }

            for (const fail of failedFixes) {
                if (!stillInvalid.includes(fail.sceneNum)) {
                    stillInvalid.push(fail.sceneNum);
                }
            }

            if (successfulFixes.length > 0) {
                currentContent = autoFixEngine.applyFixes(currentContent, successfulFixes, language);
                console.log(`✅ Fixed ${successfulFixes.length} scenes in attempt ${fixAttempt}`);
            }

            if (failedFixes.length > 0 && fixAttempt === MAX_AUTO_FIX_ATTEMPTS) {
                logError(2, `Auto-fix failed for scenes: ${failedFixes.map(f => f.sceneNum).join(', ')}`, 'WARNING', { batchIndex });
            }
        } else {
            break;
        }
    }

    const finalValidation = sceneValidator.validateAllScenes(
        currentContent,
        endScene - startScene + 1
    );

    const qualityMetrics = {
        totalFixed: fixedScenes.length,
        stillInvalid,
        recoveryAttempts: MAX_AUTO_FIX_ATTEMPTS,
        completionRate: finalValidation.completionRate,
        fixReasons: [...new Set(allFixReasons)]
    };

    console.log(`📊 Auto-Fix Complete for Batch ${batchIndex + 1}: ${fixedScenes.length} fixed, ${stillInvalid.length} still invalid`);

    return {
        content: currentContent,
        warnings: lastWarnings,
        fixedScenes,
        stillInvalid,
        qualityMetrics,
        validationDetails: finalValidation
    };
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
    language: Language = 'vi',
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    setFallbackApiKey(apiKey);

    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = Math.min(startScene + SCENES_PER_BATCH - 1, sceneCount);

    if (startScene > sceneCount) return "END_OF_SCRIPT";

    const adapter = getAdapterForStep(3);
    console.log(`Step 3 Batch ${batchIndex + 1} using model: ${getModelIdForStep(3)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    const userPrompt = getScriptBatchPrompt(language, outline, previousContent, startScene, endScene, sceneCount);

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
    language: Language = 'vi',
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    setFallbackApiKey(apiKey);

    const adapter = getAdapterForStep(4);
    console.log(`Step 4 using model: ${getModelIdForStep(4)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

    const userPrompt = getPromptsBatchPrompt(language, scriptChunk);
[
  {
    "id": "Scene X",
    "image_prompt": "Nội dung nguyên văn từ mục Hình ảnh",
    "video_prompt": "Nội dung nguyên văn từ mục Hình ảnh"
  }
]
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
    language: Language = 'vi',
    onRetry?: (reason: string, attempt: number) => void
): Promise<string> => {
    setFallbackApiKey(apiKey);

    const adapter = getAdapterForStep(5);
    const userPrompt = getVoiceoverExtractionPrompt(language, fullScript);

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
    console.log(`Step 6 using model: ${getModelIdForStep(6)}${isSafeMode() ? ' (Safe Mode)' : ''}`);

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
