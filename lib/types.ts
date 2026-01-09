
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
    language?: 'vi' | 'en'; // Phase 11: Multi-language support
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

// ========== GRACEFUL ACCEPT MODE (Phase: Always Complete) ==========

/**
 * Warning for a single scene that exceeded word count tolerance
 */
export interface SceneWarning {
    sceneNum: number;
    actual: number;      // Actual word count
    target: number;      // Target word count (e.g., 20)
    tolerance: number;   // Tolerance (e.g., 3)
    diff: number;        // Difference from acceptable range (+2 means 2 over max)
}

/**
 * Quality score for a completed job
 */
export interface JobQualityScore {
    totalScenes: number;
    withinTarget: number;      // Perfectly within target±0
    withinTolerance: number;   // Within tolerance but not perfect
    outOfTolerance: number;    // Outside tolerance
    score: number;             // Percentage: (withinTarget + withinTolerance) / total * 100
}

/**
 * Quality report for a job - exported in ZIP
 */
export interface QualityReport {
    jobId: string;
    totalScenes: number;
    qualityScore: number;
    warnings: SceneWarning[];
    completedAt: string;
}

// ========== END GRACEFUL ACCEPT MODE ==========

export interface BatchJob {
    id: string;
    input: string; // Nội dung đầu vào cho bước 2
    status: 'pending' | 'processing' | 'completed' | 'failed';
    outputs: StepOutputs; // Lưu kết quả các bước 2-6
    error?: string;
    // Phase 10: Per-job progress tracking
    currentStep?: number; // 2-6
    stepProgress?: string; // e.g. "Outline 3/10", "Script 2/10"
    createdAt?: number;
    // Phase: Graceful Accept Mode
    warnings?: SceneWarning[];
    qualityScore?: JobQualityScore;

    // Phase: Hard Checkpoint & Resume
    completedBatches?: number;    // Index of the last successfully completed batch (e.g. 5)
    totalBatches?: number;        // Total batches planned (e.g. 10)
    partialOutputs?: {            // Partially built content for current step
        outline?: string;
        script?: string;
    };
    lastUpdated?: number;         // Timestamp for persistence check
}

