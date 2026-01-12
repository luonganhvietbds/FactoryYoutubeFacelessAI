import { WorkflowConfig } from './types';

export const WORKFLOW_CONFIG: WorkflowConfig = {
    stepsInOrder: [1, 2, 3, 4, 5, 6],
    allowSkipSteps: false,
    requireStep1First: true,
    autoResetOnPackChange: true
};

export const STEP_DEPENDENCIES: Record<number, number[]> = {
    1: [],
    2: [1],
    3: [2],
    4: [3],
    5: [3],
    6: [3, 4, 5]
};

export function canRunStep(
    stepId: number,
    completedSteps: number[],
    isLocked: boolean
): boolean {
    if (isLocked) return false;
    if (stepId === 1) return true;
    
    const dependencies = STEP_DEPENDENCIES[stepId] || [];
    return dependencies.every(dep => completedSteps.includes(dep));
}

export function getStepLockMessage(stepId: number, selectedPackId: string | null, completedSteps: number[]): string {
    if (!selectedPackId) {
        return 'Vui lòng chọn Pack để bắt đầu workflow';
    }
    
    if (stepId === 1) {
        return '✅ Sẵn sàng chạy Step 1';
    }
    
    const prevStep = stepId - 1;
    if (!completedSteps.includes(prevStep)) {
        return `🔒 Hoàn thành Step ${prevStep} để mở khóa Step ${stepId}`;
    }
    
    return '✅ Sẵn sàng chạy';
}

export function getWorkflowProgress(completedSteps: number[], totalSteps: number = 6): {
    percentage: number;
    completed: number;
    remaining: number;
} {
    return {
        percentage: Math.round((completedSteps.length / totalSteps) * 100),
        completed: completedSteps.length,
        remaining: totalSteps - completedSteps.length
    };
}
