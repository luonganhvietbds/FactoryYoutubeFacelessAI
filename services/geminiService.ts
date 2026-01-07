
import { GoogleGenAI } from "@google/genai";

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

// Bước 2: Tạo Dàn Ý - CẬP NHẬT: Batching 10 scenes/call
export const createOutlineBatch = async (
    apiKey: string,
    newsData: string,
    systemPrompt: string,
    currentOutline: string,
    batchIndex: number,
    sceneCount: number
): Promise<string> => {
    const SCENES_PER_BATCH = 10;
    const startScene = batchIndex * SCENES_PER_BATCH + 1;
    let endScene = startScene + SCENES_PER_BATCH - 1;
    if (endScene > sceneCount) endScene = sceneCount;

    if (startScene > sceneCount) return "END_OF_OUTLINE";

    const userPrompt = `
Thông tin đầu vào (Tin tức/Sự kiện):
${newsData}

Dàn ý đã có (Context):
${currentOutline.slice(-1000)}

NHIỆM VỤ HIỆN TẠI (Batch scenes ${startScene} -> ${endScene}):
Hãy lập tiếp dàn ý chi tiết cho các cảnh từ **Scene ${startScene}** đến **Scene ${endScene}**.
Tổng số cảnh dự kiến của cả video là ${sceneCount}.

QUY TẮC:
1. Bắt đầu ngay với "**Scene ${startScene}: [Tên cảnh]**".
2. Mô tả nội dung chính của cảnh.
3. KHÔNG viết quá Scene ${endScene}.
`;
    return callGemini(apiKey, systemPrompt, userPrompt);
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
    // Mỗi batch xử lý 5 cảnh
    const SCENES_PER_BATCH = 5;
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

// Helper: Cắt kịch bản thành các chunk (mỗi chunk khoảng 5 scenes) để xử lý Prompt/Json
export const splitScriptIntoChunks = (fullScript: string): string[] => {
    const sceneRegex = /(?=\n\s*(?:Scene|Cảnh)\s+\d+[:.])/i;
    const parts = fullScript.split(sceneRegex).filter(p => p.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = "";
    let count = 0;

    for (const part of parts) {
        currentChunk += part;
        count++;
        // Gom 5 scenes vào 1 chunk
        if (count >= 5) {
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
