
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

// ========== USER DATA MODEL (Admin Authentication System) ==========

/**
 * User permissions for feature access
 */
export interface UserPermissions {
    allowedPackIds: string[];
    defaultPackId?: string;
    batchModeEnabled: boolean;
    multiIdeaEnabled: boolean;
    maxConcurrent: number;
}

/**
 * User data stored in Firestore 'users' collection
 */
export interface UserData {
    uid: string;
    email: string;
    displayName?: string;
    role: 'admin' | 'member';
    credits: number;
    permissions: UserPermissions;
    createdAt: string;
    updatedAt?: string;
}

/**
 * Default permissions for new members
 */
export const DEFAULT_MEMBER_PERMISSIONS: UserPermissions = {
    allowedPackIds: [],
    defaultPackId: undefined,
    batchModeEnabled: false,
    multiIdeaEnabled: false,
    maxConcurrent: 1,
};

export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
    allowedPackIds: ['*'],
    defaultPackId: undefined,
    batchModeEnabled: true,
    multiIdeaEnabled: true,
    maxConcurrent: 5,
};

/**
 * Default permissions for admins
 */
export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
    allowedPackIds: ['*'],        // All packs
    defaultPackId: undefined,     // Admin can access all
    batchModeEnabled: true,       // Batch mode enabled
    maxConcurrent: 5,             // 5 concurrent jobs
};

// ========== WORKFLOW STATE ==========

/**
 * Workflow state for tracking user progress
 */
export interface WorkflowState {
    isLocked: boolean;            // Whether workflow is locked (no pack selected)
    selectedPackId: string | null; // Currently selected pack
    completedSteps: number[];      // List of completed step IDs
    stepOutputs: StepOutputs;      // Outputs from each step
    startedAt: string | null;      // When workflow started
    completedAt: string | null;    // When workflow completed
}

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
    stepsInOrder: number[];
    allowSkipSteps: boolean;
    requireStep1First: boolean;
    autoResetOnPackChange: boolean;
}

// ========== END WORKFLOW STATE ==========

/**
 * Helper function to check if user has access to a specific pack
 */
export function hasPackAccess(userPermissions: UserPermissions | undefined, packId: string): boolean {
    if (!userPermissions) return false;
    if (userPermissions.allowedPackIds.includes('*')) return true;
    return userPermissions.allowedPackIds.includes(packId);
}

/**
 * Get pack access summary for display
 */
export function getPackAccessSummary(
    allowedPackIds: string[],
    availablePacks: PromptPackManifest[]
): { all: boolean; count: number; names: { id: string; name: string }[] } {
    if (allowedPackIds.includes('*')) {
        return {
            all: true,
            count: availablePacks.length,
            names: availablePacks.map(p => ({ id: p.id, name: p.name }))
        };
    }
    return {
        all: false,
        count: allowedPackIds.length,
        names: allowedPackIds
            .map(id => ({
                id,
                name: availablePacks.find(p => p.id === id)?.name || id
            }))
            .filter(item => item.name !== item.id)
    };
}

// ========== END USER DATA MODEL ==========

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

    // Phase: Auto-Fix System
    fixedScenes?: number[];       // IDs of scenes AI successfully fixed
    stillInvalid?: number[];      // IDs of scenes AI couldn't fix
}

// ========== AUTO-FIX SCENE VALIDATION SYSTEM ==========

export interface SceneData {
    sceneNum: number;
    title: string;
    visual: string;
    voiceover: string;
    wordCount: number;
}

export interface ValidationResult {
    sceneData: SceneData | null;
    isValid: boolean;
    issues: string[];
    suggestions: string[];
}

export interface ComprehensiveResult {
    totalExpected: number;
    totalFound: number;
    validScenes: SceneData[];
    invalidScenes: ValidationResult[];
    missingScenes: number[];
    completionRate: number;
    allScenesContent: string;
}

export interface FixedScene {
    sceneNum: number;
    originalContent: string;
    fixedContent: string;
    fixReasons: string[];
    isValidAfterFix: boolean;
}

export interface AutoFixMetrics {
    totalFixed: number;
    stillInvalid: number[];
    recoveryAttempts: number;
    completionRate: number;
    fixReasons: string[];
}

export interface EnhancedOutlineBatchResult {
    content: string;
    warnings: SceneWarning[];
    fixedScenes: number[];
    stillInvalid: number[];
    qualityMetrics: AutoFixMetrics;
    validationDetails: ComprehensiveResult;
}

export interface AutoFixEvent {
    timestamp: string;
    batchIndex: number;
    attempt: number;
    fixedScenes: number[];
    stillInvalid: number[];
    completionRate: number;
}

// ========== END AUTO-FIX SYSTEM ==========

// ========== PLAN MODE ==========

export interface PlanIdea {
    id: string;
    keyword: string;
    topic: string;
    outline: string;
    createdAt: string;
    status: 'pending' | 'completed' | 'failed';
    error?: string;
}

export interface PlanSession {
    id: string;
    keywords: string[];
    ideas: PlanIdea[];
    totalKeywords: number;
    completedCount: number;
    failedCount: number;
    status: 'idle' | 'running' | 'completed' | 'cancelled';
    startedAt?: string;
    completedAt?: string;
}

export interface PlanConfig {
    targetWords: number;
    tolerance: number;
    delayBetweenKeywords: number;
}

export interface PlanProgress {
    current: number;
    total: number;
    currentKeyword: string;
    status: 'idle' | 'processing' | 'completed' | 'failed';
    completedIdeas?: PlanIdea[];
    lastError?: string;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
    targetWords: 20,
    tolerance: 3,
    delayBetweenKeywords: 2000,
};

export const MAX_KEYWORDS_PER_SESSION = 100;

// ========== END PLAN MODE ==========

