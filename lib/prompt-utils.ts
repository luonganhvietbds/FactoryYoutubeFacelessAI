import { SystemPromptData } from "./types";

/**
 * Helper để lấy nội dung prompt từ ID
 */
export const getPromptContentById = (id: string, library: SystemPromptData[]): string => {
    const prompt = library.find(p => p.id === id);
    return prompt ? prompt.content : "";
};
