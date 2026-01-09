import { useState, useCallback, useMemo } from 'react';
import { StepOutputs, SystemPromptData, PromptPackManifest, BatchJob } from './types';
import { getPromptContentById } from './prompt-utils';
import {
    getNewsAndEvents,
    createOutlineBatch,
    createScriptBatch,
    splitScriptIntoChunks,
    generatePromptsBatch,
    mergePromptJsons,
    extractVoiceOver,
    createMetadata
} from '@/services/geminiService';
import { STEPS_CONFIG } from './constants';

interface UseScriptGeneratorOptions {
    promptsLibrary: SystemPromptData[];
    selectedPromptIds: { [key: number]: string };
    apiKey: string;
    sceneCount: number;
    wordCountMin: number;
    wordCountMax: number;
}

interface ProgressState {
    current: number;
    total: number;
    message: string;
}

export const useScriptGenerator = (options: UseScriptGeneratorOptions) => {
    const { promptsLibrary, selectedPromptIds, apiKey, sceneCount, wordCountMin, wordCountMax } = options;

    const [stepOutputs, setStepOutputs] = useState<StepOutputs>({});
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState<ProgressState | null>(null);
    const [error, setError] = useState<string | null>(null);

    const getPrompt = useCallback((stepId: number) => {
        return getPromptContentById(selectedPromptIds[stepId], promptsLibrary);
    }, [promptsLibrary, selectedPromptIds]);

    const getInputForStep = useCallback((stepId: number, outputs: StepOutputs, topicKeyword: string) => {
        switch (stepId) {
            case 1: return topicKeyword;
            case 2: return outputs[1];
            case 3: return outputs[2];
            case 4: case 5: case 6: return outputs[3];
            default: return null;
        }
    }, []);

    const handleGenerate = useCallback(async (
        stepId: number,
        topicKeyword: string,
        outputs: StepOutputs,
        onComplete?: (result: string) => void
    ) => {
        if (!apiKey) {
            setError("Missing API Key");
            return;
        }

        setIsLoading(true);
        setError(null);

        const promptContent = getPrompt(stepId);
        const input = getInputForStep(stepId, outputs, topicKeyword);

        if (stepId === 1) {
            if (!topicKeyword) {
                setError("Please enter a keyword");
                setIsLoading(false);
                return;
            }
            try {
                const result = await getNewsAndEvents(apiKey, topicKeyword, promptContent);
                setStepOutputs(prev => ({ ...prev, [stepId]: result }));
                if (!completedSteps.includes(stepId)) setCompletedSteps(prev => [...prev, stepId]);
                onComplete?.(result);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
            return;
        }

        if (!input) {
            setError("Missing input for this step");
            setIsLoading(false);
            return;
        }

        try {
            let result: string | undefined;

            if (stepId === 2) {
                const totalBatches = Math.ceil(sceneCount / 5);
                let fullOutline = "";
                for (let b = 0; b < totalBatches; b++) {
                    setProgress({
                        current: b + 1,
                        total: totalBatches,
                        message: `Creating Outline Batch ${b + 1}/${totalBatches}`
                    });
                    const chunk = await createOutlineBatch(apiKey, input, promptContent, fullOutline, b, sceneCount, wordCountMin, wordCountMax);
                    if (chunk === "END_OF_OUTLINE") break;
                    fullOutline += "\n" + chunk;
                }
                result = fullOutline.trim();
            } else if (stepId === 3) {
                const totalBatches = Math.ceil(sceneCount / 5);
                let fullScript = "";
                for (let i = 0; i < totalBatches; i++) {
                    setProgress({ current: i + 1, total: totalBatches, message: `Batch ${i + 1}/${totalBatches}` });
                    const chunk = await createScriptBatch(apiKey, input, promptContent, fullScript, i, sceneCount);
                    if (chunk.includes("END_OF_SCRIPT")) {
                        fullScript += "\n" + chunk.replace("END_OF_SCRIPT", "").trim();
                        break;
                    }
                    fullScript += "\n" + chunk;
                }
                result = fullScript.trim();
            } else if (stepId === 4) {
                const chunks = splitScriptIntoChunks(input);
                const jsons = [];
                for (let i = 0; i < chunks.length; i++) {
                    setProgress({ current: i + 1, total: chunks.length, message: `Prompt Batch ${i + 1}` });
                    jsons.push(await generatePromptsBatch(apiKey, chunks[i], promptContent));
                }
                result = mergePromptJsons(jsons);
            } else if (stepId === 5) {
                result = await extractVoiceOver(apiKey, input, promptContent, wordCountMin, wordCountMax);
            } else if (stepId === 6) {
                result = await createMetadata(apiKey, input, promptContent);
            }

            if (result) {
                setStepOutputs(prev => ({ ...prev, [stepId]: result as string }));
                if (!completedSteps.includes(stepId)) setCompletedSteps(prev => [...prev, stepId]);
                onComplete?.(result);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
            setProgress(null);
        }
    }, [apiKey, getPrompt, getInputForStep, sceneCount, wordCountMin, wordCountMax, completedSteps]);

    const resetOutputs = useCallback(() => {
        setStepOutputs({});
        setCompletedSteps([]);
        setError(null);
        setProgress(null);
    }, []);

    return {
        stepOutputs,
        setStepOutputs,
        completedSteps,
        setCompletedSteps,
        isLoading,
        progress,
        error,
        setError,
        handleGenerate,
        resetOutputs,
    };
};

export default useScriptGenerator;
