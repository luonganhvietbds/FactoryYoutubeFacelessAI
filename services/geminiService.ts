
import { GoogleGenAI } from "@google/genai";
import {
    countVietnameseWords,
    extractVoiceoverContent,
    parseScenes as parseSceneBlocks
} from '@/lib/wordCounter';
import { errorTracker, logError } from '@/lib/errorTracker';
import { apiKeyManager } from '@/lib/apiKeyManager';

// Config for retry behavior
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2
};

/**
 * Call Gemini API with automatic key rotation and retry
 * Falls back to provided apiKey if pool is empty
 */
const callGeminiWithRetry = async (
    providedApiKey: string,
    systemPrompt: string,
    userMessage: string,
    useSearch: boolean = false
): Promise<string> => {
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts < RETRY_CONFIG.maxRetries) {
        // Try to get key from pool first, fallback to provided key
        const currentKey = apiKeyManager.getNextKey() || providedApiKey;

        if (!currentKey) {
            throw new Error("Không có API Key khả dụng. Vui lòng thêm key vào pool hoặc nhập trực tiếp.");
        }

        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const modelId = 'gemini-2.5-flash';

            const response = await ai.models.generateContent({
                model: modelId,
                contents: userMessage,
                config: {
                    systemInstruction: systemPrompt,
                    ...(useSearch && { tools: [{ googleSearch: {} }] })
                }
            });

            let textOutput = (response.text ?? '').trim();

            // Handle Grounding
            if (useSearch && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                const chunks = response.candidates[0].groundingMetadata.groundingChunks;
                let sourcesList = "\n\n---\n**Nguồn tham khảo (Sources):**\n";
                let hasSources = false;

                chunks.forEach((chunk: any, index: number) => {
                    if (chunk.web?.uri && chunk.web?.title) {
                        sourcesList += `${index + 1}. [${chunk.web.title}](${chunk.web.uri})\n`;
                        hasSources = true;
                    }
                });

                if (hasSources) {
                    textOutput += sourcesList;
                }
            }

            // Success - report to key manager
            apiKeyManager.reportSuccess(currentKey);
            return textOutput;

        } catch (error: any) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const errorMessage = lastError.message;

            console.warn(`API call failed (attempt ${attempts + 1}):`, errorMessage);

            // Report failure to key manager
            apiKeyManager.reportFailure(currentKey, errorMessage);

            // Check if it's a rate limit error
            const isRateLimit = errorMessage.includes('429') ||
                errorMessage.toLowerCase().includes('rate limit') ||
                errorMessage.toLowerCase().includes('quota');

            // Check if it's an invalid key error
            const isInvalidKey = errorMessage.includes('401') ||
                errorMessage.includes('403') ||
                errorMessage.toLowerCase().includes('api key not valid');

            if (isRateLimit) {
                // Rate limit - try next key immediately
                logError(0, `Rate limit hit, rotating key`, 'WARNING', { key: currentKey.slice(0, 8) });
                attempts++;
                continue;
            } else if (isInvalidKey) {
                // Invalid key - mark dead and try next
                logError(0, `Invalid key detected, removing from rotation`, 'ERROR', { key: currentKey.slice(0, 8) });
                attempts++;
                continue;
            } else {
                // Other error - exponential backoff
                const delay = Math.min(
                    RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempts),
                    RETRY_CONFIG.maxDelayMs
                );
                logError(0, `API error, retrying in ${delay}ms`, 'WARNING', { error: errorMessage });
                await new Promise(resolve => setTimeout(resolve, delay));
                attempts++;
            }
        }
    }

    // All retries exhausted
    throw lastError || new Error("Đã thử hết tất cả API keys nhưng vẫn thất bại.");
};

// Legacy function for backward compatibility (uses new retry logic internally)
const callGemini = async (apiKey: string, systemPrompt: string, userMessage: string, useSearch: boolean = false) => {
    return callGeminiWithRetry(apiKey, systemPrompt, userMessage, useSearch);
};

// --- SERVICE CHO CÁC BƯỚC ---

// Bước 1: Lấy tin tức
export const getNewsAndEvents = async (apiKey: string, keyword: string, systemPrompt: string): Promise<string> => {
    return callGemini(apiKey, systemPrompt, `Chủ đề/Từ khóa cần tìm kiếm: "${keyword}"`, true);
};

// Bước 2: Tạo Dàn Ý - V5: Graceful Accept Mode (Always Complete)
import { SceneWarning } from '@/lib/types';

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
    tolerance: number
): Promise<OutlineBatchResult> => {
    // Calculate min/max from target ± tolerance
    const minWords = targetWords - tolerance;
    const maxWords = targetWords + tolerance;

    // Batch size for processing
    const SCENES_PER_BATCH = 3;
    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = startScene + SCENES_PER_BATCH - 1;
    if (endScene > sceneCount) endScene = sceneCount;

    if (startScene > sceneCount) return { content: "END_OF_OUTLINE", warnings: [] };

    const userPrompt = `
Thông tin đầu vào (Tin tức/Sự kiện):
${newsData}

Dàn ý đã có (Context):
${currentOutline.slice(-2000)}

NHIỆM VỤ HIỆN TẠI (Batch scenes ${startScene} -> ${endScene}):
Hãy lập tiếp dàn ý chi tiết cho các cảnh từ **Scene ${startScene}** đến **Scene ${endScene}**.
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
`;

    try {
        const rawResponse = await callGemini(apiKey, systemPrompt, userPrompt);

        // ========== POST-CORRECTION ENGINE ==========
        const sceneBlocks = rawResponse.split(/(?=Scene \d+:)/i).filter(block => /^Scene \d+:/i.test(block.trim()));
        const warnings: SceneWarning[] = [];
        const correctedScenes: string[] = [];

        sceneBlocks.forEach((block, idx) => {
            const currentSceneNum = startScene + idx;
            if (currentSceneNum > endScene) return;

            const voMatch = block.match(/Lời dẫn:\s*([\s\S]*?)(?:\s*\(\d+\s*từ\)\s*)?(?=\n\n|$)/i);

            if (voMatch && voMatch[1]) {
                const rawContent = voMatch[1]
                    .replace(/\(\d+\s*từ\)/g, '')
                    .replace(/\*\*/g, '')
                    .trim();

                const actualWordCount = countVietnameseWords(rawContent);

                // GRACEFUL MODE: Collect warning instead of failing
                if (actualWordCount < minWords || actualWordCount > maxWords) {
                    const diff = actualWordCount > maxWords
                        ? actualWordCount - maxWords
                        : actualWordCount - minWords;

                    warnings.push({
                        sceneNum: currentSceneNum,
                        actual: actualWordCount,
                        target: targetWords,
                        tolerance: tolerance,
                        diff: diff
                    });

                    console.warn(`⚠️ Scene ${currentSceneNum}: ${actualWordCount} words (target: ${minWords}-${maxWords}, diff: ${diff > 0 ? '+' : ''}${diff})`);
                }

                // Always correct annotation with accurate count
                const correctedBlock = block.replace(
                    /Lời dẫn:\s*[\s\S]*?(?:\(\d+\s*từ\))?(?=\n\n|$)/i,
                    `Lời dẫn: ${rawContent} (${actualWordCount} từ)`
                );
                correctedScenes.push(correctedBlock);
            } else {
                // Missing voiceover - still accept but log warning
                warnings.push({
                    sceneNum: currentSceneNum,
                    actual: 0,
                    target: targetWords,
                    tolerance: tolerance,
                    diff: -targetWords
                });
                console.warn(`⚠️ Scene ${currentSceneNum}: Missing 'Lời dẫn'`);
                correctedScenes.push(block);
            }
        });

        // Check for missing scenes
        const expectedSceneCount = endScene - startScene + 1;
        if (correctedScenes.length < expectedSceneCount) {
            const missing = expectedSceneCount - correctedScenes.length;
            console.warn(`⚠️ Batch ${batchIndex + 1}: Missing ${missing} scene(s)`);
            // Add placeholder warnings for missing scenes
            for (let i = correctedScenes.length; i < expectedSceneCount; i++) {
                warnings.push({
                    sceneNum: startScene + i,
                    actual: 0,
                    target: targetWords,
                    tolerance: tolerance,
                    diff: -targetWords
                });
            }
        }

        console.log(`✅ Batch ${batchIndex + 1} completed (${warnings.length} warnings)`);

        return {
            content: correctedScenes.join('\n\n'),
            warnings: warnings
        };

    } catch (e: any) {
        console.error("Gemini API Error:", e);
        logError(2, `API Error at Batch ${batchIndex + 1}: ${e.message}`, 'ERROR', { batchIndex, error: e.message });

        // GRACEFUL MODE: Return empty batch with warning instead of throwing
        const expectedSceneCount = endScene - startScene + 1;
        const warnings: SceneWarning[] = [];
        for (let i = 0; i < expectedSceneCount; i++) {
            warnings.push({
                sceneNum: startScene + i,
                actual: 0,
                target: targetWords,
                tolerance: tolerance,
                diff: -targetWords
            });
        }

        return {
            content: `[API Error in Batch ${batchIndex + 1}: ${e.message}]`,
            warnings: warnings
        };
    }
};

// Bước 3: Tạo Kịch Bản Chi Tiết - CẬP NHẬT: Batching chính xác theo số cảnh
export const createScriptBatch = async (
    apiKey: string,
    outline: string,
    systemPrompt: string,
    previousContent: string,
    batchIndex: number,
    sceneCount: number // Tổng số cảnh yêu cầu
): Promise<string> => {
    // Đồng bộ batch size với Step 2 để consistency
    const SCENES_PER_BATCH = 3;
    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = startScene + SCENES_PER_BATCH - 1;

    // Nếu endScene vượt quá tổng số cảnh, chặn lại ở sceneCount
    if (endScene > sceneCount) endScene = sceneCount;

    // Nếu startScene đã vượt quá sceneCount, nghĩa là không còn gì để viết
    if (startScene > sceneCount) return "END_OF_SCRIPT";

    const prompt = `
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
    return callGemini(apiKey, systemPrompt, prompt);
};

// Bước 4: Tạo Prompt JSON
export const generatePromptsBatch = async (
    apiKey: string,
    scriptChunk: string,
    systemPrompt: string
): Promise<string> => {
    const prompt = `
Phần kịch bản cần xử lý:
${scriptChunk}

NHIỆM VỤ:
Trích xuất Image Prompts và Video Prompts cho các cảnh trong đoạn kịch bản trên thành JSON.
Lưu ý: Chỉ trả về JSON thuần túy, không markdown.
`;
    return callGemini(apiKey, systemPrompt, prompt);
};

// Bước 5: Tách Voice Over - CẬP NHẬT: Min/Max Word Count
export const extractVoiceOver = async (
    apiKey: string,
    fullScript: string,
    systemPrompt: string,
    minWords: number,
    maxWords: number
): Promise<string> => {
    return callGemini(apiKey, systemPrompt, `
Kịch bản chi tiết cần trích xuất Voice Over:

${fullScript}

YÊU CẦU ĐẶC BIỆT VỀ ĐỘ DÀI:
- Mỗi câu Voice Over phải có độ dài từ **${minWords} đến ${maxWords} từ**.
- Nếu câu quá ngắn, hãy gộp hoặc viết thêm cho đủ ý.
- Nếu câu quá dài, hãy tách thành 2 câu.
`);
};

// Helper: Cắt kịch bản thành các chunk (mỗi chunk 3 scenes - đồng bộ với Step 2/3)
export const splitScriptIntoChunks = (fullScript: string): string[] => {
    const sceneRegex = /(?=\n\s*(?:Scene|Cảnh)\s+\d+[:.])/i;
    const parts = fullScript.split(sceneRegex).filter(p => p.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = "";
    let count = 0;

    for (const part of parts) {
        currentChunk += part;
        count++;
        // Đồng bộ với batch size của Step 2/3 (3 scenes)
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

// Helper: Merge JSON
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

// Bước 6: Metadata
export const createMetadata = async (apiKey: string, detailedScript: string, systemPrompt: string): Promise<string> => {
    return callGemini(apiKey, systemPrompt, `Nội dung kịch bản:\n${detailedScript.slice(0, 30000)}`);
};
