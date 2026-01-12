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
    isLocked: boolean,
    selectedPackId: string | null
): boolean {
    if (stepId === 1) {
        return true;
    }
    
    if (!selectedPackId) {
        return false;
    }
    
    if (isLocked) {
        return false;
    }
    
    const dependencies = STEP_DEPENDENCIES[stepId] || [];
    return dependencies.every(dep => completedSteps.includes(dep));
}

export function canRunStepSimple(
    stepId: number,
    completedSteps: number[],
    isLocked: boolean
): boolean {
    if (stepId === 1) {
        return true;
    }
    
    if (isLocked) {
        return false;
    }
    
    const dependencies = STEP_DEPENDENCIES[stepId] || [];
    return dependencies.every(dep => completedSteps.includes(dep));
}

export function getStepLockMessage(
    stepId: number,
    selectedPackId: string | null,
    completedSteps: number[],
    isLocked: boolean
): string {
    if (stepId === 1) {
        return '✅ Sẵn sàng chạy - Nhấn nút để bắt đầu';
    }
    
    if (!selectedPackId) {
        return '🔒 Vui lòng chọn Pack để kích hoạt Steps 2-6';
    }
    
    if (isLocked) {
        return '🔒 Workflow đã bị khóa';
    }
    
    const prevStep = stepId - 1;
    if (!completedSteps.includes(prevStep)) {
        return `🔒 Hoàn thành Step ${prevStep} để mở khóa`;
    }
    
    return '✅ Sẵn sàng chạy';
}

export function isStepAccessible(
    stepId: number,
    selectedPackId: string | null
): boolean {
    if (stepId === 1) {
        return true;
    }
    return selectedPackId !== null;
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
