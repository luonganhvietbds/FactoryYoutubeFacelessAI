
import { GoogleGenAI } from "@google/genai";
import {
    countVietnameseWords,
    extractVoiceoverContent,
    parseScenes as parseSceneBlocks
} from '@/lib/wordCounter';

// Hàm xử lý chung
const callGemini = async (apiKey: string, systemPrompt: string, userMessage: string, useSearch: boolean = false) => {
    if (!apiKey) {
        throw new Error("Vui lòng nhập API Key của bạn.");
    }
    try {
        const ai = new GoogleGenAI({ apiKey });
        const modelId = 'gemini-3-pro-preview';

        const response = await ai.models.generateContent({
            model: modelId,
            contents: userMessage,
            config: {
                systemInstruction: systemPrompt,
                ...(useSearch && { tools: [{ googleSearch: {} }] })
            }
        });

        let textOutput = (response.text ?? '').trim();

        // Xử lý Grounding
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
        return textOutput;

    } catch (error) {
        console.error("Gemini API call failed:", error);
        if (error instanceof Error) {
            if (error.message.includes('API key not valid')) {
                throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại.");
            }
            throw new Error(`Lỗi từ Gemini API: ${error.message}`);
        }
        throw new Error("Lỗi không xác định từ Gemini API.");
    }
};

// --- SERVICE CHO CÁC BƯỚC ---

// Bước 1: Lấy tin tức
export const getNewsAndEvents = async (apiKey: string, keyword: string, systemPrompt: string): Promise<string> => {
    return callGemini(apiKey, systemPrompt, `Chủ đề/Từ khóa cần tìm kiếm: "${keyword}"`, true);
};

// Bước 2: Tạo Dàn Ý - V3: Post-Correction Engine + Deterministic Word Counter

export const createOutlineBatch = async (
    apiKey: string,
    newsData: string,
    systemPrompt: string,
    currentOutline: string,
    batchIndex: number,
    sceneCount: number,
    minWords: number,
    maxWords: number
): Promise<string> => {
    // Giảm batch size để AI dễ đạt word count chính xác hơn cho large scripts (100-300 scenes)
    const SCENES_PER_BATCH = 3;
    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = startScene + SCENES_PER_BATCH - 1;
    if (endScene > sceneCount) endScene = sceneCount;

    if (startScene > sceneCount) return "END_OF_OUTLINE";

    let attempts = 0;
    const MAX_ATTEMPTS = 5; // Tăng số lần retry cho large scripts
    let feedback = "";
    const TOLERANCE = 2; // Graceful degradation: chấp nhận ±2 sau khi hết retry

    while (attempts < MAX_ATTEMPTS) {
        const userPrompt = `
Thông tin đầu vào (Tin tức/Sự kiện):
${newsData}

Dàn ý đã có (Context - tăng gấp đôi để giữ continuity):
${currentOutline.slice(-2000)}

NHIỆM VỤ HIỆN TẠI (Batch scenes ${startScene} -> ${endScene}):
Hãy lập tiếp dàn ý chi tiết cho các cảnh từ **Scene ${startScene}** đến **Scene ${endScene}**.
Tổng số cảnh dự kiến: ${sceneCount}.

===== QUY TẮC ĐẾM TỪ TIẾNG VIỆT (BẮT BUỘC TUÂN THỦ) =====
Mỗi ÂM TIẾT tách biệt bằng KHOẢNG TRẮNG = 1 TỪ.
Ví dụ đếm CHUẨN:
  • "Mẹ kế không phải ác quỷ" = 6 từ (6 âm tiết riêng biệt).
  • "trong thời kỳ khủng hoảng" = 5 từ.
  • "bà ta là nhà quản lý nguồn lực" = 8 từ.
KHÔNG ĐƯỢC gộp từ ghép thành 1 đơn vị (ví dụ: "nhà quản lý" = 3 từ, KHÔNG PHẢI 1).
===========================================================

YÊU CẦU VỀ LỜI DẪN (VOICE OVER):
1. Mỗi cảnh PHẢI có mục "**Lời dẫn:**".
2. Độ dài PHẢI trong khoảng **${minWords} - ${maxWords} âm tiết** (tính theo QUY TẮC trên).
3. Cuối mỗi Lời dẫn, ghi số từ thực tế. Ví dụ: (18 từ).

${feedback ? `
⚠️ LƯU Ý QUAN TRỌNG (LẦN THỬ ${attempts + 1}/${MAX_ATTEMPTS}):
Lần sinh trước bị TỪ CHỐI vì:
${feedback}
HÃY SỬA LẠI NGAY. Nếu quá dài: CẮT BỚT. Nếu quá ngắn: BỔ SUNG.
` : ""}

QUY TẮC FORMAT:
Scene ${startScene}: [Tên cảnh]
Hình ảnh: [Mô tả hình ảnh chi tiết]
Lời dẫn: [Nội dung lời dẫn] (Số từ)

... (tiếp tục đến Scene ${endScene})
`;

        try {
            const rawResponse = await callGemini(apiKey, systemPrompt, userPrompt);

            // ========== POST-CORRECTION ENGINE ==========
            // Split response into scene blocks
            const sceneBlocks = rawResponse.split(/(?=Scene \d+:)/i).filter(block => /^Scene \d+:/i.test(block.trim()));

            const validationErrors: string[] = [];
            const correctedScenes: string[] = [];

            sceneBlocks.forEach((block, idx) => {
                const currentSceneNum = startScene + idx;

                // IMPORTANT: Only validate scenes within the requested batch range
                // Ignore any extra scenes Gemini may have generated beyond our request
                if (currentSceneNum > endScene) {
                    return; // Skip validation for scenes beyond our batch
                }

                // Extract voiceover content (ignoring AI's annotation)
                const voMatch = block.match(/Lời dẫn:\s*([\s\S]*?)(?:\s*\(\d+\s*từ\)\s*)?(?=\n\n|$)/i);

                if (voMatch && voMatch[1]) {
                    // Clean content: remove any existing annotations
                    const rawContent = voMatch[1]
                        .replace(/\(\d+\s*từ\)/g, '')
                        .replace(/\*\*/g, '')
                        .trim();

                    // COUNT WITH OUR DETERMINISTIC COUNTER
                    const actualWordCount = countVietnameseWords(rawContent);

                    // Validate against constraints
                    if (actualWordCount < minWords || actualWordCount > maxWords) {
                        validationErrors.push(
                            `Scene ${currentSceneNum}: ${actualWordCount} từ (cần ${minWords}-${maxWords})`
                        );
                    }

                    // Correct the annotation with our accurate count
                    const correctedBlock = block.replace(
                        /Lời dẫn:\s*[\s\S]*?(?:\(\d+\s*từ\))?(?=\n\n|$)/i,
                        `Lời dẫn: ${rawContent} (${actualWordCount} từ)`
                    );

                    correctedScenes.push(correctedBlock);
                } else {
                    validationErrors.push(`Scene ${currentSceneNum}: Thiếu mục 'Lời dẫn'`);
                    correctedScenes.push(block); // Keep original if no voiceover found
                }
            });

            // Check if we have the expected number of scenes IN THE REQUESTED RANGE
            const expectedSceneCount = endScene - startScene + 1;
            const validSceneCount = correctedScenes.length; // Only count scenes we actually validated

            if (validSceneCount < expectedSceneCount) {
                validationErrors.push(`Thiếu ${expectedSceneCount - validSceneCount} scene(s)`);
            }

            // If validation passed, return corrected response
            if (validationErrors.length === 0) {
                console.log(`✅ Batch ${batchIndex + 1} passed validation on attempt ${attempts + 1}`);
                return correctedScenes.join('\n\n');
            } else {
                console.warn(`⚠️ Attempt ${attempts + 1} failed:`, validationErrors);
                feedback = validationErrors.join('\n');
                attempts++;

                // Graceful degradation: Sau khi thử nhiều lần, chấp nhận với tolerance
                if (attempts >= MAX_ATTEMPTS) {
                    // Kiểm tra xem lỗi có trong tolerance không
                    const toleranceErrors: string[] = [];
                    const withinTolerance = validationErrors.every(err => {
                        const match = err.match(/Scene (\d+): (\d+) từ \(cần (\d+)-(\d+)\)/);
                        if (match) {
                            const actual = parseInt(match[2]);
                            const min = parseInt(match[3]);
                            const max = parseInt(match[4]);
                            const isWithinTolerance = actual >= (min - TOLERANCE) && actual <= (max + TOLERANCE);
                            if (!isWithinTolerance) {
                                toleranceErrors.push(err);
                            }
                            return isWithinTolerance;
                        }
                        return false; // Missing "Lời dẫn" không thể chấp nhận
                    });

                    if (withinTolerance && validSceneCount >= expectedSceneCount) {
                        console.warn(`⚠️ Batch ${batchIndex + 1} accepted with tolerance (±${TOLERANCE} words)`);
                        return correctedScenes.join('\n\n');
                    }
                }
            }
        } catch (e) {
            console.error("Gemini API Error:", e);
            attempts++;
        }
    }

    throw new Error(`❌ Failed to generate valid scenes ${startScene}-${endScene} after ${MAX_ATTEMPTS} attempts.\nLast errors:\n${feedback}`);
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
