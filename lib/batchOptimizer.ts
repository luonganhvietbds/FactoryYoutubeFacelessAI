/**
 * Batch Optimizer - Dynamic configuration for large-scale processing
 * 
 * Calculates optimal batch settings based on:
 * - Scene count (40-300)
 * - Available API keys
 * - Memory constraints
 */

export interface BatchOptimalConfig {
    scenesPerBatch: number;
    parallelJobs: number;
    delayBetweenBatchesMs: number;
    delayBetweenJobsMs: number;
    maxRetries: number;
    contextWindowSize: number;
    tolerance: number;
}

/**
 * Calculate optimal configuration based on scene count and key availability
 */
export const calculateOptimalConfig = (
    sceneCount: number,
    availableKeyCount: number = 1
): BatchOptimalConfig => {
    // Dynamic batch size: larger scenes = larger batches for efficiency
    let scenesPerBatch: number;
    if (sceneCount >= 200) {
        scenesPerBatch = 5;
    } else if (sceneCount >= 100) {
        scenesPerBatch = 4;
    } else {
        scenesPerBatch = 3;
    }

    // Parallel jobs based on key availability (max 5 to avoid overload)
    const parallelJobs = Math.min(availableKeyCount, 5, 3);

    // Delay between batches: more keys = less delay needed
    const delayBetweenBatchesMs = availableKeyCount >= 5 ? 300 :
        availableKeyCount >= 3 ? 500 : 1000;

    // Delay between jobs
    const delayBetweenJobsMs = availableKeyCount >= 5 ? 2000 : 5000;

    // Max retries: large scripts need more attempts
    const maxRetries = sceneCount >= 200 ? 7 : sceneCount >= 100 ? 6 : 5;

    // Context window: scale with scene count for better continuity
    const contextWindowSize = Math.min(4000, Math.max(2000, sceneCount * 10));

    // Tolerance: slightly more flexible for very large scripts
    const tolerance = sceneCount >= 200 ? 4 : 3;

    return {
        scenesPerBatch,
        parallelJobs,
        delayBetweenBatchesMs,
        delayBetweenJobsMs,
        maxRetries,
        contextWindowSize,
        tolerance
    };
};

/**
 * Estimate total API calls for a batch job
 */
export const estimateApiCalls = (sceneCount: number, scenesPerBatch: number): number => {
    const step2Batches = Math.ceil(sceneCount / scenesPerBatch);
    const step3Batches = Math.ceil(sceneCount / scenesPerBatch);
    const step4Batches = Math.ceil(sceneCount / scenesPerBatch); // Approximate
    const step5Calls = 1;
    const step6Calls = 1;

    return step2Batches + step3Batches + step4Batches + step5Calls + step6Calls;
};

/**
 * Estimate total time for processing
 */
export const estimateProcessingTime = (
    scriptCount: number,
    sceneCountPerScript: number,
    availableKeyCount: number = 1
): { totalMinutes: number; formattedTime: string } => {
    const config = calculateOptimalConfig(sceneCountPerScript, availableKeyCount);
    const callsPerScript = estimateApiCalls(sceneCountPerScript, config.scenesPerBatch);
    const totalCalls = callsPerScript * scriptCount;

    // Average 4 seconds per call + delays
    const avgCallTimeMs = 4000;
    const totalCallTimeMs = totalCalls * avgCallTimeMs;
    const totalDelayMs = scriptCount * (config.delayBetweenJobsMs +
        Math.ceil(sceneCountPerScript / config.scenesPerBatch) * config.delayBetweenBatchesMs);

    // Parallel processing factor
    const parallelFactor = Math.min(config.parallelJobs, availableKeyCount);
    const adjustedTimeMs = (totalCallTimeMs + totalDelayMs) / parallelFactor;

    const totalMinutes = Math.ceil(adjustedTimeMs / 60000);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const formattedTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return { totalMinutes, formattedTime };
};

/**
 * Check if system can handle the requested workload
 */
export const validateWorkload = (
    scriptCount: number,
    sceneCountPerScript: number,
    availableKeyCount: number
): { canProceed: boolean; warnings: string[] } => {
    const warnings: string[] = [];

    const totalScenes = scriptCount * sceneCountPerScript;
    const totalCalls = estimateApiCalls(sceneCountPerScript, 3) * scriptCount;

    // Check key availability
    if (availableKeyCount < 3 && totalCalls > 500) {
        warnings.push(`⚠️ Khuyến nghị sử dụng ít nhất 3 API Keys cho ${totalCalls} calls`);
    }

    if (availableKeyCount < 5 && totalCalls > 1000) {
        warnings.push(`⚠️ Khuyến nghị sử dụng ít nhất 5 API Keys cho ${totalCalls} calls`);
    }

    // Check memory concerns
    if (totalScenes > 3000) {
        warnings.push(`⚠️ ${totalScenes} scenes có thể gây áp lực bộ nhớ. Khuyến nghị 8GB+ RAM`);
    }

    // Check time
    const { formattedTime } = estimateProcessingTime(scriptCount, sceneCountPerScript, availableKeyCount);
    if (formattedTime.includes('h')) {
        warnings.push(`⏱️ Thời gian ước tính: ${formattedTime}. Đảm bảo kết nối ổn định.`);
    }

    return {
        canProceed: availableKeyCount > 0,
        warnings
    };
};

export default {
    calculateOptimalConfig,
    estimateApiCalls,
    estimateProcessingTime,
    validateWorkload
};
