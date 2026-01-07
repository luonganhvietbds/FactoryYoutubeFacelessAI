
export interface StepConfig {
    id: number;
    title: string;
    description: string;
    defaultPromptId: string;
    buttonText: string;
}

export interface StepOutputs {
    [key: number]: string;
}

export interface SystemPromptData {
    id: string;
    name: string;
    content: string;
    stepId: number;
    packId?: string;
}

export interface PromptPackManifest {
    id: string;
    name: string;
    version: string;
    author: string;
    description?: string;
    prompts: {
        stepId: number;
        file: string;
        id: string;
        name: string;
    }[];
    // Validation fields (Runtime)
    missingSteps?: number[];
    isValid?: boolean;
}

export interface UserProfile {
    id: string;
    username: string;
    allowedPromptIds: string[]; // Các ID prompt mà user được phép dùng
    isAdmin: boolean;
}

export interface BatchJob {
    id: string;
    input: string; // Nội dung đầu vào cho bước 2
    status: 'pending' | 'processing' | 'completed' | 'failed';
    outputs: StepOutputs; // Lưu kết quả các bước 2-6
    error?: string;
}
