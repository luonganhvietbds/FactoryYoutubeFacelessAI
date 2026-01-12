import { useState, useCallback } from 'react';
import { WorkflowState, StepOutputs } from './types';
import { WORKFLOW_CONFIG } from './workflow-constants';

interface UseWorkflowStateReturn extends WorkflowState {
    resetWorkflow: (newPackId: string) => void;
    completeStep: (stepId: number, output: string) => void;
    unlockWorkflow: (packId: string) => void;
    lockWorkflow: () => void;
    clearStepOutput: (stepId: number) => void;
    clearAllOutputs: () => void;
}

export function useWorkflowState(initialPackId: string | null = null): UseWorkflowStateReturn {
    const [state, setState] = useState<WorkflowState>({
        isLocked: initialPackId === null,
        selectedPackId: initialPackId,
        completedSteps: [],
        stepOutputs: {},
        startedAt: initialPackId ? new Date().toISOString() : null,
        completedAt: null
    });

    const resetWorkflow = useCallback((newPackId: string) => {
        setState({
            isLocked: false,
            selectedPackId: newPackId,
            completedSteps: [],
            stepOutputs: {},
            startedAt: new Date().toISOString(),
            completedAt: null
        });
    }, []);

    const completeStep = useCallback((stepId: number, output: string) => {
        setState(prev => {
            const newCompletedSteps = prev.completedSteps.includes(stepId)
                ? prev.completedSteps
                : [...prev.completedSteps, stepId];
            
            const allSteps = WORKFLOW_CONFIG.stepsInOrder;
            const allCompleted = allSteps.every(s => newCompletedSteps.includes(s));
            
            return {
                ...prev,
                completedSteps: newCompletedSteps,
                stepOutputs: { ...prev.stepOutputs, [stepId]: output },
                completedAt: allCompleted ? new Date().toISOString() : prev.completedAt
            };
        });
    }, []);

    const unlockWorkflow = useCallback((packId: string) => {
        setState(prev => ({
            ...prev,
            isLocked: false,
            selectedPackId: packId,
            startedAt: prev.startedAt || new Date().toISOString()
        }));
    }, []);

    const lockWorkflow = useCallback(() => {
        setState(prev => ({
            ...prev,
            isLocked: true
        }));
    }, []);

    const clearStepOutput = useCallback((stepId: number) => {
        setState(prev => {
            const newOutputs = { ...prev.stepOutputs };
            delete newOutputs[stepId];
            
            return {
                ...prev,
                completedSteps: prev.completedSteps.filter(s => s !== stepId),
                stepOutputs: newOutputs
            };
        });
    }, []);

    const clearAllOutputs = useCallback(() => {
        setState(prev => ({
            ...prev,
            completedSteps: [],
            stepOutputs: {},
            completedAt: null
        }));
    }, []);

    return {
        ...state,
        resetWorkflow,
        completeStep,
        unlockWorkflow,
        lockWorkflow,
        clearStepOutput,
        clearAllOutputs
    };
}

export function useStepOutput(stepId: number, stepOutputs: StepOutputs): string | undefined {
    return stepOutputs[stepId];
}

export function isStepCompleted(stepId: number, completedSteps: number[]): boolean {
    return completedSteps.includes(stepId);
}
