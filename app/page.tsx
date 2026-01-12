'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { STEPS_CONFIG } from '@/lib/constants';
import { StepOutputs, BatchJob, SystemPromptData, PromptPackManifest, SceneWarning, JobQualityScore } from '@/lib/types';
import { getPromptContentById } from '@/lib/prompt-utils';
import { RegistryService } from '@/lib/prompt-registry/client-registry';
import {
  getNewsAndEvents,
  createOutlineBatch,
  createScriptBatch,
  splitScriptIntoChunks,
  generatePromptsBatch,
  mergePromptJsons,
  extractVoiceOver,
  createMetadata
} from '@/services/aiService';
import { apiKeyManager, ApiKeyInfo, KeyManagerState } from '@/lib/apiKeyManager';
import { queuePersistence } from '@/lib/queuePersistence'; // NEW: Persistence
import { Language, LANGUAGE_CONFIGS, getLanguageConfig } from '@/lib/languageConfig';
import { useAuth } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { UserData } from '@/lib/types';

import StepProgressBar from '@/components/StepProgressBar';
import BatchResumeModal from '@/components/BatchResumeModal'; // NEW: Resume UI
import QualityReport from '@/components/QualityReport'; // NEW: Quality Report
import WandIcon from '@/components/icons/WandIcon';
import LoadingSpinnerIcon from '@/components/icons/LoadingSpinnerIcon';
import CopyIcon from '@/components/icons/CopyIcon';
import RefreshCwIcon from '@/components/icons/RefreshCwIcon';
import PromptManager from '@/components/PromptManager';
import ImageIcon from '@/components/icons/ImageIcon';
import VideoIcon from '@/components/icons/VideoIcon';
import AdminPanel from '@/components/AdminPanel';
import SaveIcon from '@/components/icons/SaveIcon';
import DownloadIcon from '@/components/icons/DownloadIcon';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// --- HELPERS ---
const INPUT_SOURCE_MAP: { [key: number]: number } = {
  2: 1, // Outline cần News
  3: 2, // Script cần Outline
  4: 3, // Prompts cần Script
  5: 3, // Voice Over cần Script
  6: 3, // Metadata cần Script
};

interface ProgressState {
  current: number;
  total: number;
  message: string;
}

const MAX_QUEUE_SIZE = 20;

export default function Home() {
  // --- STATE ---
  const [currentStep, setCurrentStep] = useState(1);
  const [viewingStep, setViewingStep] = useState(1);
  const [stepOutputs, setStepOutputs] = useState<StepOutputs>({});
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Settings & Inputs
  const [topicKeyword, setTopicKeyword] = useState<string>('');
  const [sceneCount, setSceneCount] = useState<number>(45);
  const [singleTargetWords, setSingleTargetWords] = useState<number>(20);
  const [singleTolerance, setSingleTolerance] = useState<number>(2);
  const [apiKey, setApiKey] = useState<string>('');
  const [saveApiKey, setSaveApiKey] = useState<boolean>(false);

  // Prompt Management
  const [promptsLibrary, setPromptsLibrary] = useState<SystemPromptData[]>([]);
  const [availablePacks, setAvailablePacks] = useState<PromptPackManifest[]>([]);
  const [selectedPromptIds, setSelectedPromptIds] = useState<{ [key: number]: string }>({});

  // Language Selection (Phase 11)
  const [language, setLanguage] = useState<Language>('vi');
  const langConfig = getLanguageConfig(language);

  // Permission checks
  const { currentUser, userData, isAdmin, logout, addToast } = useAuth();
  const canUseBatchMode = userData?.permissions?.batchModeEnabled === true;
  const hasAllPackAccess = userData?.permissions?.allowedPackIds?.includes('*');
  const allowedPackIds = userData?.permissions?.allowedPackIds || [];

  // Filter packs by language AND user permissions
  const filteredPacks = useMemo(() => {
    return availablePacks.filter(pack => {
      const packLang = (pack as any).language || 'vi';
      const hasLangAccess = packLang === language;
      const hasPackAccess = hasAllPackAccess || allowedPackIds.includes(pack.id);
      return hasLangAccess && hasPackAccess;
    });
  }, [availablePacks, language, hasAllPackAccess, allowedPackIds]);

  // Admin & UI
  const [showAdmin, setShowAdmin] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  // --- BATCH MODE STATE ---
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchInputRaw, setBatchInputRaw] = useState('');
  const [batchQueue, setBatchQueue] = useState<BatchJob[]>([]);
  const [processedJobs, setProcessedJobs] = useState<BatchJob[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Resume State
  const [resumeState, setResumeState] = useState<{ visible: boolean, age: string, jobCount: number } | null>(null);

  // Delays
  const [delayBetweenSteps, setDelayBetweenSteps] = useState(2000); // ms
  const [delayBetweenJobs, setDelayBetweenJobs] = useState(5000); // ms

  // ========== ISOLATED BATCH MODE STATE (New - Completely Separate) ==========
  const [batchSceneCount, setBatchSceneCount] = useState<number>(45);
  const [batchTargetWords, setBatchTargetWords] = useState<number>(20);  // NEW: Target word count
  const [batchWordTolerance, setBatchWordTolerance] = useState<number>(3); // NEW: Tolerance ±
  const [batchDelaySeconds, setBatchDelaySeconds] = useState<number>(5);
  const [batchProgress, setBatchProgress] = useState<{
    jobIndex: number;
    totalJobs: number;
    currentStep: number;
    message: string;
  } | null>(null);

  // ========== PHASE 9: API KEY POOL STATE ==========
  const [keyPoolInput, setKeyPoolInput] = useState<string>('');
  const [keyPoolState, setKeyPoolState] = useState<KeyManagerState>({ keys: [], currentIndex: 0, isChecking: false });
  const [maxConcurrent, setMaxConcurrent] = useState<number>(3); // Parallel processing

  // Subscribe to API Key Manager updates
  useEffect(() => {
    const unsubscribe = apiKeyManager.subscribe(setKeyPoolState);
    return unsubscribe;
  }, []);

  const [editableInput, setEditableInput] = useState('');
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState('');

  // --- INITIALIZATION ---
  useEffect(() => {
    const initApp = async () => {
      // 1. Fetch Full Registry (Prompts + Packs)
      const { prompts: serverPrompts, packs } = await RegistryService.fetchFullRegistry();

      // 2. Merge with LocalStorage Custom Prompts
      const finalLibrary = RegistryService.mergeWithLocal(serverPrompts);

      setPromptsLibrary(finalLibrary);
      setAvailablePacks(packs);

      // 3. Setup Default Selections (Fallback Logic)
      const defaults: { [key: number]: string } = {};
      STEPS_CONFIG.forEach(step => {
        const exists = finalLibrary.find(p => p.id === step.defaultPromptId);
        if (!exists) {
          const fallback = finalLibrary.find(p => p.stepId === step.id);
          defaults[step.id] = fallback ? fallback.id : step.defaultPromptId;
        } else {
          defaults[step.id] = step.defaultPromptId;
        }
      });

      // 4. Load Saved Selection
      try {
        const savedIds = localStorage.getItem('selectedPromptIds');
        if (savedIds) setSelectedPromptIds({ ...defaults, ...JSON.parse(savedIds) });
        else setSelectedPromptIds(defaults);
      } catch { setSelectedPromptIds(defaults); }

      // 5. Check for Resumable State
      const hasState = await queuePersistence.hasSavedState();
      if (hasState) {
        const age = await queuePersistence.getStateAge();
        const state = await queuePersistence.loadState();
        if (state && age) {
          setResumeState({ visible: true, age, jobCount: state.jobs.length });
        }
      }
    };

    initApp();

    const savedApiKey = localStorage.getItem('geminiApiKey');
    if (savedApiKey) { setApiKey(savedApiKey); setSaveApiKey(true); }
  }, []);

  // --- SAVING EFFECTS ---
  useEffect(() => {
    if (saveApiKey) localStorage.setItem('geminiApiKey', apiKey);
  }, [apiKey, saveApiKey]);

  useEffect(() => {
    localStorage.setItem('selectedPromptIds', JSON.stringify(selectedPromptIds));
  }, [selectedPromptIds]);

  // --- HANDLERS ---
  const handleUpdatePrompts = (newPrompts: SystemPromptData[]) => {
    setPromptsLibrary(newPrompts);
    localStorage.setItem('systemPromptsLibrary', JSON.stringify(newPrompts));
  };

  const handleResetPrompts = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục về cài đặt mặc định gốc?\nMọi thay đổi cục bộ sẽ bị mất.')) {
      localStorage.removeItem('systemPromptsLibrary');
      localStorage.removeItem('selectedPromptIds'); // Also reset selection
      window.location.reload();
    }
  };

  const handleApplyPack = (packId: string) => {
    if (!packId) return;
    const pack = availablePacks.find(p => p.id === packId);
    if (!pack) return;

    const newSelection = { ...selectedPromptIds };

    // Update steps based on Pack Manifest
    pack.prompts.forEach(pAsset => {
      // Verify prompt exists in library
      const exists = promptsLibrary.find(libP => libP.id === pAsset.id);
      if (exists) {
        newSelection[pAsset.stepId] = pAsset.id;
      }
    });

    setSelectedPromptIds(newSelection);
    alert(`Đã kích hoạt bộ Workforce: "${pack.name}"`);
  };

  const handleToggleBatchMode = () => {
    if (!canUseBatchMode) {
      addToast('error', 'Bạn không có quyền sử dụng Batch Mode. Liên hệ Admin để được cấp quyền.');
      return;
    }
    setIsBatchMode(!isBatchMode);
  };

  const handleAdminLogin = () => {
    if (!currentUser) {
      addToast('error', 'Vui lòng đăng nhập để truy cập Admin Dashboard');
      return;
    }
    if (!userData) {
      addToast('error', 'Đang tải thông tin tài khoản...');
      return;
    }
    if (!isAdmin) {
      addToast('error', 'Bạn không có quyền Admin. Liên hệ quản trị viên để được cấp quyền.');
      return;
    }
    setShowAdmin(true);
  };

  // --- BATCH PROCESSING LOGIC ---
  const handleAddToQueue = () => {
    if (!batchInputRaw.trim()) return;
    const inputs = batchInputRaw.split(/\n\s*\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (inputs.length === 0) return;
    if (batchQueue.length + inputs.length > MAX_QUEUE_SIZE) {
      alert(`Hàng chờ chỉ chứa tối đa ${MAX_QUEUE_SIZE} kịch bản.`); return;
    }
    const newJobs: BatchJob[] = inputs.map((input, idx) => ({
      id: `JOB_${Date.now()}_${batchQueue.length + idx}`, input: input, status: 'pending', outputs: {}
    }));
    setBatchQueue(prev => [...prev, ...newJobs]);
    setBatchInputRaw('');
  };

  const processSingleScript = async (input: string, jobIndex: number, totalJobs: number) => {
    if (!apiKey) throw new Error("Missing API Key");
    const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
    const outputs: StepOutputs = {};
    try {
      // Step 2 (single-mode) - Note: warnings ignored in single mode for simplicity
      const totalOutlineBatches = Math.ceil(sceneCount / 3);
      let fullOutline = "";
      for (let b = 0; b < totalOutlineBatches; b++) {
        setProgress({ current: 2, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Outline Batch ${b + 1}/${totalOutlineBatches}...` });
        const result = await createOutlineBatch(apiKey, input, getPromptContentById(selectedPromptIds[2], promptsLibrary), fullOutline, b, sceneCount, batchTargetWords, batchWordTolerance);
        if (result.content === "END_OF_OUTLINE") break;
        fullOutline += "\n" + result.content;
      } outputs[2] = fullOutline.trim();
      await wait(delayBetweenSteps);

      // Step 3
      const totalBatches = Math.ceil(sceneCount / 3); // Synchronized with SCENES_PER_BATCH = 3
      let fullScript = "";
      for (let b = 0; b < totalBatches; b++) {
        setProgress({ current: 3, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Viết Script Batch ${b + 1}/${totalBatches}...` });
        const chunk = await createScriptBatch(apiKey, outputs[2], getPromptContentById(selectedPromptIds[3], promptsLibrary), fullScript, b, sceneCount);
        if (chunk.includes("END_OF_SCRIPT")) { fullScript += "\n" + chunk.replace("END_OF_SCRIPT", "").trim(); break; }
        fullScript += "\n" + chunk;
      }
      outputs[3] = fullScript.trim();
      await wait(delayBetweenSteps);

      // Step 4
      setProgress({ current: 4, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Trích xuất Prompts...` });
      const chunks = splitScriptIntoChunks(outputs[3]);
      const jsons = [];
      for (const chunk of chunks) jsons.push(await generatePromptsBatch(apiKey, chunk, getPromptContentById(selectedPromptIds[4], promptsLibrary)));
      outputs[4] = mergePromptJsons(jsons);
      await wait(delayBetweenSteps);

      // Step 5
      setProgress({ current: 5, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Tách Voice...` });
      const minVO = batchTargetWords - batchWordTolerance;
      const maxVO = batchTargetWords + batchWordTolerance;
      outputs[5] = await extractVoiceOver(apiKey, outputs[3], getPromptContentById(selectedPromptIds[5], promptsLibrary), minVO, maxVO);
      await wait(delayBetweenSteps);

      // Step 6
      setProgress({ current: 6, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Metadata...` });
      outputs[6] = await createMetadata(apiKey, outputs[3], getPromptContentById(selectedPromptIds[6], promptsLibrary));
      return outputs;
    } catch (e: any) { throw new Error(e.message); }
  };

  const runBatchQueue = async () => {
    if (!apiKey) { alert("Thiếu API Key."); return; }
    if (batchQueue.length === 0) return;
    setIsProcessingBatch(true);
    const queueCopy = [...batchQueue];
    for (let i = 0; i < queueCopy.length; i++) {
      const job = queueCopy[i];
      setBatchQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j));
      try {
        const outputs = await processSingleScript(job.input, i + 1, queueCopy.length);
        setProcessedJobs(prev => [...prev, { ...job, status: 'completed', outputs }]);
        setBatchQueue(prev => prev.filter(j => j.id !== job.id));
      } catch (e: any) {
        setProcessedJobs(prev => [...prev, { ...job, status: 'failed', error: e.message, outputs: {} }]);
        setBatchQueue(prev => prev.filter(j => j.id !== job.id));
      }
      if (i < queueCopy.length - 1) {
        setProgress({ current: 0, total: 0, message: `Waiting ${delayBetweenJobs}ms...` });
        await new Promise(r => setTimeout(r, delayBetweenJobs));
      }
    }
    setIsProcessingBatch(false); setProgress(null);
  };

  // ========== PHASE 9: API KEY POOL HANDLERS ==========
  const handleAddKeysToPool = () => {
    if (!keyPoolInput.trim()) {
      alert('⚠️ Vui lòng nhập API Keys (mỗi key một dòng)');
      return;
    }
    const count = apiKeyManager.addKeysFromInput(keyPoolInput);
    setKeyPoolInput('');
    alert(`✅ Đã thêm ${count} API Key(s) vào pool`);
  };

  const handleCheckAllKeys = async () => {
    if (keyPoolState.keys.length === 0) {
      alert('⚠️ Chưa có API Key nào trong pool');
      return;
    }
    const results = await apiKeyManager.checkAllKeys();
    alert(`✅ Kiểm tra hoàn tất!\n🟢 Active: ${results.active}\n🟡 Rate Limited: ${results.rateLimited}\n🔴 Dead: ${results.dead}`);
  };

  const handleRemoveKey = (key: string) => {
    if (confirm('Xác nhận xóa API Key này?')) {
      apiKeyManager.removeKey(key);
    }
  };

  const handleClearAllKeys = () => {
    if (confirm('⚠️ Xóa TẤT CẢ API Keys khỏi pool?')) {
      apiKeyManager.clearKeys();
    }
  };

  // Get status badge color
  const getKeyStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-600';
      case 'rate_limited': return 'bg-yellow-600';
      case 'dead': return 'bg-red-600';
      case 'checking': return 'bg-blue-600 animate-pulse';
      default: return 'bg-gray-600';
    }
  };

  // ========== ISOLATED BATCH MODE FUNCTIONS (New - Completely Separate) ==========

  // 1. Parse Input: Tách các kịch bản bằng dòng trống
  const handleBatchParseInput = () => {
    if (!batchInputRaw.trim()) {
      alert('⚠️ Vui lòng nhập nội dung kịch bản');
      return;
    }

    const scripts = batchInputRaw
      .split(/\n\s*\n/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    if (scripts.length === 0) {
      alert('⚠️ Không tìm thấy kịch bản hợp lệ');
      return;
    }

    const newJobs: BatchJob[] = scripts.map((script: string, idx: number) => ({
      id: `JOB_${Date.now()}_${idx}`,
      input: script,
      status: 'pending',
      outputs: {},
      createdAt: Date.now()
    }));

    setBatchQueue(prev => [...prev, ...newJobs]);
    setBatchInputRaw('');
    alert(`✅ Đã thêm ${newJobs.length} kịch bản vào hàng chờ`);
  };

  // Result type for batch job processing (Graceful Accept Mode)
  interface BatchJobResult {
    outputs: StepOutputs;
    warnings: SceneWarning[];
    qualityScore: JobQualityScore;
  }

  // 2. Process Single Job: Chạy Steps 2-6 cho 1 job (Graceful Accept Mode)
  const processBatchJob = async (job: BatchJob, jobIndex: number, totalJobs: number): Promise<BatchJobResult> => {
    const outputs: StepOutputs = {};

    // Helper: Update job progress in queue and SAVE TO DB
    const updateJobProgress = async (step: number, progress: string, partialData?: { completedBatches?: number, outline?: string, script?: string }) => {
      setBatchQueue(prev => {
        const newQueue = prev.map(j =>
          j.id === job.id ? {
            ...j,
            currentStep: step,
            stepProgress: progress,
            ...(partialData?.completedBatches !== undefined ? { completedBatches: partialData.completedBatches } : {}),
            ...(partialData?.outline || partialData?.script ? {
              partialOutputs: {
                ...j.partialOutputs,
                ...(partialData.outline ? { outline: partialData.outline } : {}),
                ...(partialData.script ? { script: partialData.script } : {})
              }
            } : {})
          } : j
        );
        // Auto-save to IndexedDB (Fire and forget)
        queuePersistence.saveState({
          jobs: newQueue.filter(j => j.status === 'pending' || j.id === job.id), // Save pending and current
          processedJobs: processedJobs,
          config: {
            sceneCount: batchSceneCount,
            wordMin: batchTargetWords - batchWordTolerance,
            wordMax: batchTargetWords + batchWordTolerance,
            delaySeconds: batchDelaySeconds
          },
          lastUpdated: Date.now(),
          version: '1.0'
        }).catch(err => console.warn('Auto-save failed:', err));

        return newQueue;
      });
      setBatchProgress({ jobIndex, totalJobs, currentStep: step, message: `Job ${jobIndex}/${totalJobs} - ${progress}` });
    };

    try {
      // Collect all warnings across batches
      const allWarnings: SceneWarning[] = job.warnings || [];

      // Step 2: Tạo Outline (Graceful Accept + Resume)
      const totalOutlineBatches = Math.ceil(batchSceneCount / 3);

      // Resume logic verification
      let startBatch = 0;
      let fullOutline = "";

      // Only resume if we are successfully in Step 2 progress
      if (job.currentStep === 2 && job.completedBatches && job.partialOutputs?.outline) {
        startBatch = job.completedBatches;
        fullOutline = job.partialOutputs.outline;
        console.log(`🔄 Resuming Job ${job.id} Step 2 from Batch ${startBatch}`);
      }

      for (let b = startBatch; b < totalOutlineBatches; b++) {
        await updateJobProgress(2, `Outline ${b + 1}/${totalOutlineBatches}`, { completedBatches: b });

        const result = await createOutlineBatch(apiKey, job.input, getPromptContentById(selectedPromptIds[2], promptsLibrary), fullOutline, b, batchSceneCount, batchTargetWords, batchWordTolerance, (r, a) => updateJobProgress(2, `Outline ${b + 1}/${totalOutlineBatches} (Retry ${a}: ${r})`));

        if (result.content === "END_OF_OUTLINE") break;
        fullOutline += "\n" + result.content;
        allWarnings.push(...result.warnings);

        // CHECKPOINT: Save partial outline
        await updateJobProgress(2, `Outline ${b + 1}/${totalOutlineBatches} (Saved)`, {
          completedBatches: b + 1,
          outline: fullOutline
        });
      }
      outputs[2] = fullOutline.trim();

      // Step 3: Viết Script (Resume Logic)
      const totalScriptBatches = Math.ceil(batchSceneCount / 3);
      let scriptStartBatch = 0;
      let fullScript = "";

      // Resume logic for Step 3
      if (job.currentStep === 3 && job.completedBatches && job.partialOutputs?.script) {
        scriptStartBatch = job.completedBatches;
        fullScript = job.partialOutputs.script;
        console.log(`🔄 Resuming Job ${job.id} Step 3 from Batch ${scriptStartBatch}`);
      }

      for (let b = scriptStartBatch; b < totalScriptBatches; b++) {
        await updateJobProgress(3, `Script ${b + 1}/${totalScriptBatches}`, { completedBatches: b });

        const chunk = await createScriptBatch(apiKey, outputs[2], getPromptContentById(selectedPromptIds[3], promptsLibrary), fullScript, b, batchSceneCount, (r, a) => updateJobProgress(3, `Script ${b + 1}/${totalScriptBatches} (Retry ${a}: ${r})`));

        if (chunk.includes("END_OF_SCRIPT")) { fullScript += "\n" + chunk.replace("END_OF_SCRIPT", "").trim(); break; }
        fullScript += "\n" + chunk;

        // CHECKPOINT: Save partial script
        await updateJobProgress(3, `Script ${b + 1}/${totalScriptBatches} (Saved)`, {
          completedBatches: b + 1,
          script: fullScript
        });
      }
      outputs[3] = fullScript.trim();

      // Step 4: Trích xuất Prompts
      const chunks = splitScriptIntoChunks(outputs[3]);
      const jsons = [];
      for (let i = 0; i < chunks.length; i++) {
        await updateJobProgress(4, `Prompts ${i + 1}/${chunks.length}`);
        jsons.push(await generatePromptsBatch(apiKey, chunks[i], getPromptContentById(selectedPromptIds[4], promptsLibrary), (r, a) => updateJobProgress(4, `Prompts ${i + 1}/${chunks.length} (Retry ${a}: ${r})`)));
      }
      outputs[4] = mergePromptJsons(jsons);

      // Step 5: Tách Voice Over
      await updateJobProgress(5, 'Voice Over...');
      outputs[5] = await extractVoiceOver(apiKey, outputs[3], getPromptContentById(selectedPromptIds[5], promptsLibrary), batchTargetWords - batchWordTolerance, batchTargetWords + batchWordTolerance, (r, a) => updateJobProgress(5, `Voice Over (Retry ${a}: ${r})`));

      // Step 6: Tạo Metadata
      await updateJobProgress(6, 'Metadata...');
      outputs[6] = await createMetadata(apiKey, outputs[3], getPromptContentById(selectedPromptIds[6], promptsLibrary), (r, a) => updateJobProgress(6, `Metadata (Retry ${a}: ${r})`));

      // Calculate quality score from warnings
      const qualityScore: JobQualityScore = {
        totalScenes: batchSceneCount,
        withinTarget: batchSceneCount - allWarnings.length,
        withinTolerance: 0, // All are either perfect or out of tolerance
        outOfTolerance: allWarnings.length,
        score: Math.round(((batchSceneCount - allWarnings.length) / batchSceneCount) * 100)
      };

      return { outputs, warnings: allWarnings, qualityScore };
    } catch (error: any) {
      throw new Error(`Lỗi khi xử lý Job ${jobIndex}: ${error.message}`);
    }
  };

  // 3. Run Batch Queue: Chạy toàn bộ queue (Parallel với maxConcurrent)
  const handleRunBatchQueue = async () => {
    // Check API Key availability (single key or pool)
    const hasKeyPool = keyPoolState.keys.length > 0 && keyPoolState.keys.some(k => k.status === 'active' || k.status === 'unknown');
    if (!apiKey && !hasKeyPool) {
      alert('⚠️ Vui lòng nhập API Key hoặc thêm API Keys vào pool');
      return;
    }
    if (batchQueue.length === 0) { alert('⚠️ Hàng chờ trống. Hãy thêm kịch bản trước.'); return; }

    setIsProcessingBatch(true);
    const queueCopy = [...batchQueue];
    const totalJobs = queueCopy.length;

    // Helper: Process a single job with retry
    const processJobWithRetry = async (job: BatchJob, jobIndex: number) => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          setBatchQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j));
          const result = await processBatchJob(job, jobIndex, totalJobs);

          // Success - Extract outputs, warnings, qualityScore from result
          setProcessedJobs(prev => [...prev, {
            ...job,
            status: 'completed',
            outputs: result.outputs,
            warnings: result.warnings,
            qualityScore: result.qualityScore
          }]);
          setBatchQueue(prev => prev.filter(j => j.id !== job.id));
          return true; // Exit on success

        } catch (error: any) {
          lastError = error;
          console.warn(`Job ${jobIndex} attempt ${attempt} failed: `, error.message);

          // Exponential backoff before retry
          if (attempt < maxRetries) {
            const backoffMs = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }

      // All retries failed
      setProcessedJobs(prev => [...prev, {
        ...job,
        status: 'failed',
        outputs: {},
        error: `Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'} `
      }]);
      setBatchQueue(prev => prev.filter(j => j.id !== job.id));
      return false; // Failed
    };

    // Helper: Split array into chunks
    const chunkArray = <T,>(arr: T[], size: number): T[][] => {
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    };

    // Process in parallel chunks
    const chunks = chunkArray(queueCopy, maxConcurrent);
    let processedCount = 0;
    let consecutiveChunkFailures = 0;

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];

      // Update progress
      setBatchProgress({
        jobIndex: processedCount + 1,
        totalJobs,
        currentStep: 0,
        message: `Đang chạy ${chunk.length} jobs song song(Chunk ${chunkIdx + 1}/${chunks.length})...`
      });

      // Run chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map((job, idx) => processJobWithRetry(job, processedCount + idx + 1))
      );

      // Circuit Breaker: If all jobs in chunk failed, increment counter
      if (chunkResults.every(r => r === false)) {
        consecutiveChunkFailures++;
      } else {
        consecutiveChunkFailures = 0;
      }

      // If 2 consecutive chunks ALL failed -> Pause/Stop
      if (consecutiveChunkFailures >= 2) {
        setIsProcessingBatch(false);
        setBatchProgress({
          jobIndex: processedCount,
          totalJobs,
          currentStep: 0,
          message: "⚠️ TẠM DỪNG: Quá nhiều lỗi liên tiếp (Có thể do API Limit)."
        });
        alert("⚠️ Hệ thống tạm dừng do lỗi liên tiếp (Khả năng cao do API Rate Limit). Đã lưu tiến độ. Vui lòng thử lại sau!");
        break;
      }

      processedCount += chunk.length;

      // Delay between chunks (not after last chunk)
      if (chunkIdx < chunks.length - 1 && batchDelaySeconds > 0) {
        setBatchProgress({
          jobIndex: processedCount,
          totalJobs,
          currentStep: 0,
          message: `Chờ ${batchDelaySeconds}s trước khi chạy chunk tiếp...`
        });
        await new Promise(resolve => setTimeout(resolve, batchDelaySeconds * 1000));
      }
    }

    setIsProcessingBatch(false);
    setBatchProgress(null);

    const completedCount = processedJobs.filter(j => j.status === 'completed').length;
    const failedCount = processedJobs.filter(j => j.status === 'failed').length;
    alert(`✅ Hoàn thành! ${completedCount} thành công, ${failedCount} thất bại`);
  };

  // 4. Download Job ZIP: Tải kết quả 1 job
  const handleDownloadBatchJob = async (job: BatchJob) => {
    const zip = new JSZip();
    const folderName = `script_${job.id} `;
    const folder = zip.folder(folderName);

    if (job.outputs[2]) folder?.file('step2_outline.txt', job.outputs[2]);
    if (job.outputs[3]) folder?.file('step3_script.txt', job.outputs[3]);
    if (job.outputs[4]) folder?.file('step4_prompts.json', job.outputs[4]);
    if (job.outputs[5]) folder?.file('step5_voiceover.txt', job.outputs[5]);
    if (job.outputs[6]) folder?.file('step6_metadata.txt', job.outputs[6]);
    folder?.file('input_original.txt', job.input);

    // Generate Quality Report
    const report = {
      jobId: job.id,
      timestamp: new Date().toISOString(),
      status: job.status,
      qualityScore: job.qualityScore,
      warnings: job.warnings || [],
      inputOriginal: job.input
    };
    folder?.file('quality_report.json', JSON.stringify(report, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${folderName}.zip`);
  };

  // --- SINGLE MODE HANDLERS ---
  const handleGenerate = async () => {
    if (!apiKey) { setError("Thiếu API Key."); return; }
    setIsLoading(true); setError(null);
    const promptContent = getPromptContentById(selectedPromptIds[currentStep], promptsLibrary);
    let result: string | undefined;
    try {
      if (currentStep === 1) {
        if (!topicKeyword) throw new Error("Nhập từ khóa.");
        result = await getNewsAndEvents(apiKey, topicKeyword, promptContent);
      } else {
        const input = getInputForStep(currentStep);
        if (!input) throw new Error("Thiếu input.");
        if (currentStep === 2) {
          // Single-mode Step 2
          const totalBatches = Math.ceil(sceneCount / 3);
          let fullOutline = "";

          // Use direct Target/Tolerance mechanism
          const targetWords = singleTargetWords;
          const tolerance = singleTolerance;

          for (let b = 0; b < totalBatches; b++) {
            setProgress({
              current: b + 1, total: totalBatches, message: `Creating Outline Batch ${b + 1}/${totalBatches}...`
            });
            const result = await createOutlineBatch(apiKey, input, promptContent, fullOutline, b, sceneCount, targetWords, tolerance);
            if (result.content === "END_OF_OUTLINE") break;
            fullOutline += "\n" + result.content;
          }
          result = fullOutline.trim();
        } else if (currentStep === 3) {
          const totalBatches = Math.ceil(sceneCount / 3); // Synchronized with SCENES_PER_BATCH = 3
          let fullScript = "";
          for (let i = 0; i < totalBatches; i++) {
            setProgress({ current: i + 1, total: totalBatches, message: `Batch ${i + 1}/${totalBatches}` });
            const chunk = await createScriptBatch(apiKey, input, promptContent, fullScript, i, sceneCount);
            if (chunk.includes("END_OF_SCRIPT")) { fullScript += "\n" + chunk.replace("END_OF_SCRIPT", "").trim(); break; }
            fullScript += "\n" + chunk;
          }
          result = fullScript.trim();
        } else if (currentStep === 4) {
          const chunks = splitScriptIntoChunks(input);
          const jsons = [];
          for (let i = 0; i < chunks.length; i++) {
            setProgress({ current: i + 1, total: chunks.length, message: `Prompt Batch ${i + 1}` });
            jsons.push(await generatePromptsBatch(apiKey, chunks[i], promptContent));
          }
          result = mergePromptJsons(jsons);
        } else if (currentStep === 5) {
          const min = singleTargetWords - singleTolerance;
          const max = singleTargetWords + singleTolerance;
          result = await extractVoiceOver(apiKey, input, promptContent, min, max);
        }
        else if (currentStep === 6) result = await createMetadata(apiKey, input, promptContent);
      }
      if (result) {
        setStepOutputs(prev => ({ ...prev, [currentStep]: result as string }));
        if (!completedSteps.includes(currentStep)) setCompletedSteps(prev => [...prev, currentStep]);
        if (currentStep < 6) { setCurrentStep(currentStep + 1); setViewingStep(currentStep + 1); }
      }
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); setProgress(null); }
  };

  // --- COMMON UI LOGIC ---
  const activeStepConfig = useMemo(() => STEPS_CONFIG.find(step => step.id === viewingStep)!, [viewingStep]);
  const availablePromptsForStep = useMemo(() => promptsLibrary.filter(p => p.stepId === viewingStep), [viewingStep, promptsLibrary]);
  const handlePromptSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPromptIds(prev => ({ ...prev, [viewingStep]: e.target.value }));

  const getInputForStep = useCallback((stepId: number) => {
    switch (stepId) {
      case 1: return topicKeyword;
      case 2: return stepOutputs[1];
      case 3: return stepOutputs[2];
      case 4: case 5: case 6: return stepOutputs[3];
      default: return null;
    }
  }, [stepOutputs, topicKeyword]);

  useEffect(() => { setEditableInput(getInputForStep(viewingStep) ?? ''); setUpdateSuccessMessage(''); }, [viewingStep, stepOutputs, getInputForStep]);

  const handleUpdateInput = () => {
    const src = INPUT_SOURCE_MAP[viewingStep];
    if (src) { setStepOutputs(prev => ({ ...prev, [src]: editableInput })); setUpdateSuccessMessage('Cập nhật thành công!'); setTimeout(() => setUpdateSuccessMessage(''), 3000); }
  };

  // --- DOWNLOAD LOGIC ---
  const handleDownloadSingle = (stepId: number, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `step-${stepId}-result.txt`);
  };

  const handleDownloadAllZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder("script_factory_output");

    // Add all existing outputs to zip
    STEPS_CONFIG.forEach(step => {
      if (stepOutputs[step.id]) {
        folder?.file(`step-${step.id}-${step.id === 1 ? 'research' : step.id === 2 ? 'outline' : step.id === 3 ? 'script' : step.id === 4 ? 'prompts' : step.id === 5 ? 'voice' : 'meta'}.txt`, stepOutputs[step.id]!);
      }
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "ai_script_factory_full_project.zip");
  };

  const handleCopyResult = () => {
    if (stepOutputs[viewingStep]) { navigator.clipboard.writeText(stepOutputs[viewingStep]!); setCopiedResult(true); setTimeout(() => setCopiedResult(false), 2000); }
  };

  const renderSplitPromptView = (output: string) => {
    let imagePrompts: string[] = [], videoPrompts: string[] = [];
    let originalJson = {};
    let jsonString = output.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      const start = jsonString.indexOf('{'), end = jsonString.lastIndexOf('}');
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(jsonString.substring(start, end + 1));
        originalJson = parsed;
        imagePrompts = parsed.imagePrompts || []; videoPrompts = parsed.videoPrompts || [];
      }
    } catch (e) { }

    const handleUpdate = (type: 'image' | 'video', val: string[]) => {
      const newData = { ...originalJson, imagePrompts: type === 'image' ? val : imagePrompts, videoPrompts: type === 'video' ? val : videoPrompts };
      setStepOutputs(prev => ({ ...prev, 4: JSON.stringify(newData, null, 2) }));
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
        <PromptManager title="Image Prompts" prompts={imagePrompts} onUpdate={v => handleUpdate('image', v)} icon={<ImageIcon className="h-5 w-5 text-sky-400" />} />
        <PromptManager title="Video Prompts" prompts={videoPrompts} onUpdate={v => handleUpdate('video', v)} icon={<VideoIcon className="h-5 w-5 text-teal-400" />} />
      </div>
    );
  };

  // --- RESUME LOGIC ---
  const handleResumeSession = async () => {
    const state = await queuePersistence.loadState();
    if (state) {
      // 1. Restore Jobs
      setBatchQueue(state.jobs);
      setProcessedJobs(state.processedJobs);

      // 2. Restore Config
      setBatchSceneCount(state.config.sceneCount);
      // Derive target/tolerance from min/max (approximate)
      const restoredTarget = Math.floor((state.config.wordMin + state.config.wordMax) / 2);
      const restoredTolerance = Math.floor((state.config.wordMax - state.config.wordMin) / 2);
      setBatchTargetWords(restoredTarget);
      setBatchWordTolerance(restoredTolerance);
      setBatchDelaySeconds(state.config.delaySeconds);

      alert(`✅ Đã khôi phục ${state.jobs.length} jobs từ phiên trước!`);
    }
    setResumeState(null);
  };

  const handleDiscardSession = async () => {
    await queuePersistence.clearState();
    setResumeState(null);
  };

  // Note: useAuth() is now called above at line ~230 to get isAdmin, userData, etc.

  const handleLogout = async () => {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      await logout();
    }
  };

  return (
    <ProtectedRoute>
      <div className="bg-slate-900 text-white min-h-screen font-sans">
        {/* Resume Modal */}
        {resumeState && (
          <BatchResumeModal
            age={resumeState.age}
            jobCount={resumeState.jobCount}
            onResume={handleResumeSession}
            onDiscard={handleDiscardSession}
          />
        )}
        {showAdmin && <AdminPanel prompts={promptsLibrary} onUpdatePrompts={handleUpdatePrompts} onClose={() => setShowAdmin(false)} />}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <header className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-slate-700 pb-6 gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-400">AI SCRIPT FACTORY</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-slate-400 text-sm">Xin chào, <span className="text-sky-400 font-medium">{currentUser?.displayName || currentUser?.email}</span></p>
                <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 transition-colors">(Đăng xuất)</button>
              </div>
              {/* Permission Badges */}
              <div className="flex items-center gap-2 mt-2">
                {isAdmin && (
                  <span className="px-2 py-0.5 bg-purple-600/80 text-white text-[10px] rounded-full font-medium">👑 Admin</span>
                )}
                {!canUseBatchMode && (
                  <span className="px-2 py-0.5 bg-slate-700/80 text-slate-400 text-[10px] rounded-full font-medium" title="Batch Mode bị vô hiệu hóa">🔒 Single Mode Only</span>
                )}
                {!hasAllPackAccess && allowedPackIds.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-700/80 text-amber-200 text-[10px] rounded-full font-medium" title={`Chỉ được truy cập: ${allowedPackIds.join(', ')}`}>📦 Limited Packs</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* LANGUAGE SELECTOR */}
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value as Language);
                  // Reset prompt selections when language changes
                  setSelectedPromptIds({});
                }}
                className="bg-slate-800 border border-amber-500 rounded px-3 py-2 text-sm font-bold focus:ring-amber-500 cursor-pointer hover:bg-slate-700 transition-colors"
              >
                {Object.values(LANGUAGE_CONFIGS).map(config => (
                  <option key={config.id} value={config.id}>
                    {config.flag} {config.name}
                  </option>
                ))}
              </select>

              {/* PACK SELECTOR */}
              <div className="relative group">
                <select
                  onChange={(e) => handleApplyPack(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-sky-400 font-bold focus:ring-sky-500 cursor-pointer hover:bg-slate-700 transition-colors appearance-none pr-8"
                  defaultValue=""
                  disabled={filteredPacks.length === 0}
                >
                  <option value="" disabled>
                    {filteredPacks.length === 0 
                      ? (hasAllPackAccess 
                          ? '⏳ Đang tải packs...' 
                          : '🔒 Chưa có pack được cấp quyền')
                      : (language === 'vi' ? '--- Chọn Bộ AI Workforce ---' : '--- Select AI Workforce ---')
                    }
                  </option>
                  {filteredPacks.map(pack => (
                    <option key={pack.id} value={pack.id}>{pack.name} (v{pack.version})</option>
                  ))}
                </select>
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 ${filteredPacks.length === 0 ? 'opacity-50' : ''}`}>▼</div>
              </div>
              {!hasAllPackAccess && allowedPackIds.length > 0 && filteredPacks.length === 0 && (
                <div className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded">
                  ⚠️ Liên hệ Admin để được cấp quyền packs
                </div>
              )}

              <div className="h-6 w-px bg-slate-700 mx-2"></div>

              <button onClick={handleResetPrompts} title="Reset về mặc định" className="text-slate-500 hover:text-red-400 p-2"><RefreshCwIcon className="h-5 w-5" /></button>
              <button
                onClick={handleToggleBatchMode}
                disabled={!canUseBatchMode}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${isBatchMode ? 'bg-amber-600 text-white shadow-lg' : canUseBatchMode ? 'bg-slate-800 text-slate-300 border border-slate-600' : 'bg-slate-800/50 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'}`}
                title={!canUseBatchMode ? 'Bạn không có quyền sử dụng Batch Mode' : ''}
              >
                {isBatchMode ? '📦 Batch Mode' : '📦 Batch Mode'}
              </button>
              <button onClick={handleAdminLogin} className="text-slate-500 hover:text-sky-400 p-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M8 11h8" /><path d="M12 7v8" /></svg></button>
              <button
                onClick={handleDownloadAllZip}
                className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg"
                title="Tải toàn bộ kết quả (.zip)"
              >
                <DownloadIcon className="w-5 h-5" /> <span>ZIP ALL</span>
              </button>
            </div>
          </header>

          {/* API KEY */}
          <div className="max-w-3xl mx-auto mb-6 p-3 bg-slate-800 rounded border border-slate-700 flex gap-4 items-center">
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="flex-grow bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" placeholder="Type Gemini API Key..." />
            <label className="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" checked={saveApiKey} onChange={e => setSaveApiKey(e.target.checked)} /> Save Key</label>
          </div>

          {isBatchMode ? (
            /* ========== ISOLATED BATCH MODE UI ==========  */
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-4 rounded-lg">
                <h2 className="text-2xl font-bold text-white">📦 Batch Mode - Xử Lý Hàng Loạt</h2>
                <p className="text-amber-100 text-sm mt-1">Viết nhiều kịch bản cùng lúc (Steps 2-6)</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT COLUMN: Config & Input */}
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
                  <h3 className="text-lg font-bold text-amber-400 mb-3">⚙️ Cấu Hình</h3>

                  {/* Scene Count */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase flex justify-between mb-2">
                      <span>Số Cảnh</span>
                      <span className="text-sky-400">{batchSceneCount} scenes</span>
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="300"
                      value={batchSceneCount}
                      onChange={e => setBatchSceneCount(Number(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Word Count Target + Tolerance (Simplified UX) */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase flex justify-between mb-2">
                        <span>🎯 Target Words</span>
                        <span className="text-amber-400">{batchTargetWords} từ</span>
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="40"
                        value={batchTargetWords}
                        onChange={e => setBatchTargetWords(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase flex justify-between mb-2">
                        <span>📊 Tolerance</span>
                        <span className="text-sky-400">±{batchWordTolerance}</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={batchWordTolerance}
                        onChange={e => setBatchWordTolerance(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>
                    {/* Preview Range */}
                    <div className="bg-slate-900 p-2 rounded flex justify-center items-center gap-2">
                      <span className="text-xs text-slate-500">Chấp nhận:</span>
                      <span className="text-sm font-bold text-green-400">
                        {batchTargetWords - batchWordTolerance} - {batchTargetWords + batchWordTolerance} từ
                      </span>
                    </div>
                  </div>

                  {/* Delay Config */}
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Delay Giữa Jobs (giây)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={batchDelaySeconds}
                      onChange={e => setBatchDelaySeconds(Number(e.target.value))}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>

                  {/* Max Concurrent Jobs */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase flex justify-between mb-2">
                      <span>Song Song</span>
                      <span className="text-green-400">{maxConcurrent} jobs</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={maxConcurrent}
                      onChange={e => setMaxConcurrent(Number(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <hr className="border-slate-700" />

                  {/* API Key Pool Section */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-bold text-amber-400">🔑 API Key Pool</h4>
                      <span className="text-xs text-slate-400">
                        {keyPoolState.keys.filter(k => k.status === 'active').length} / {keyPoolState.keys.length} active
                      </span>
                    </div>

                    <textarea
                      value={keyPoolInput}
                      onChange={e => setKeyPoolInput(e.target.value)}
                      rows={3}
                      placeholder="Nhập API Keys (mỗi key 1 dòng)..."
                      className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-xs text-white font-mono"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={handleAddKeysToPool}
                        className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded text-xs font-bold text-white"
                      >
                        ➕ Thêm Key
                      </button>
                      <button
                        onClick={handleCheckAllKeys}
                        disabled={keyPoolState.isChecking}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-xs font-bold text-white disabled:opacity-50"
                      >
                        {keyPoolState.isChecking ? '🔄...' : '🔍 Check'}
                      </button>
                      <button
                        onClick={handleClearAllKeys}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-xs font-bold text-white"
                      >
                        🗑️
                      </button>
                    </div>

                    {/* Key Status List */}
                    {keyPoolState.keys.length > 0 && (
                      <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
                        {keyPoolState.keys.map((keyInfo, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-slate-900 p-2 rounded text-xs">
                            <span className={`w-2 h-2 rounded-full ${getKeyStatusColor(keyInfo.status)}`}></span>
                            <span className="flex-1 font-mono text-slate-300 truncate">
                              {keyInfo.key.substring(0, 8)}...{keyInfo.key.substring(keyInfo.key.length - 4)}
                            </span>
                            <span className="text-slate-500">{keyInfo.usageCount}×</span>
                            <button
                              onClick={() => handleRemoveKey(keyInfo.key)}
                              className="text-red-400 hover:text-red-300"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <hr className="border-slate-700" />

                  {/* Input Textarea */}
                  <div>
                    <label className="text-sm font-bold text-white mb-2 block">Nhập Kịch Bản</label>
                    <textarea
                      value={batchInputRaw}
                      onChange={e => setBatchInputRaw(e.target.value)}
                      rows={8}
                      placeholder="Kịch bản 1: Nội dung...&#10;&#10;Kịch bản 2: Nội dung khác...&#10;&#10;(Cách nhau 1 dòng trống)"
                      className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-sm text-white font-mono"
                    />
                  </div>

                  <button
                    onClick={handleBatchParseInput}
                    disabled={isProcessingBatch}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    ➕ Thêm Vào Hàng Chờ
                  </button>
                </div>

                {/* RIGHT COLUMNS: Queue & Results */}
                <div className="lg:col-span-2 bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
                  {/* Header with Run Button */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">
                      📋 Hàng Chờ: {batchQueue.length} | ✅ Hoàn Thành: {processedJobs.filter(j => j.status === 'completed').length}
                    </h3>
                    <button
                      onClick={handleRunBatchQueue}
                      disabled={isProcessingBatch || batchQueue.length === 0}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isProcessingBatch ? '🔄 Đang Chạy...' : '▶️ RUN BATCH'}
                    </button>
                  </div>

                  {/* Progress Indicator */}
                  {batchProgress && (
                    <div className="bg-slate-900 p-4 rounded border border-amber-500">
                      <p className="text-amber-400 font-bold mb-2">{batchProgress.message}</p>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                          style={{ width: `${(batchProgress.currentStep / 6) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Queue List */}
                  <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                    {/* Pending/Processing Jobs */}
                    {batchQueue.map((job, idx) => (
                      <div key={job.id} className={`p-3 rounded border ${job.status === 'processing'
                        ? 'bg-amber-900/20 border-amber-500'
                        : 'bg-slate-900 border-slate-700'
                        }`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className={job.status === 'processing' ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                            {job.status === 'processing' ? '🔄' : '⏳'} Job {idx + 1}
                          </span>
                          <span className="text-xs text-slate-500 truncate max-w-[200px]">{job.input.slice(0, 40)}...</span>
                        </div>
                        {/* Per-job progress display */}
                        {job.status === 'processing' && job.currentStep && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-amber-300">Step {job.currentStep}/6</span>
                              <span className="text-amber-400">{job.stepProgress}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                                style={{ width: `${((job.currentStep - 1) / 5) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Processed Jobs */}
                    {processedJobs.map((job, idx) => (
                      <div key={job.id} className={`p-3 rounded border ${job.status === 'completed'
                        ? 'bg-green-900/20 border-green-600'
                        : 'bg-red-900/20 border-red-600'
                        }`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={job.status === 'completed' ? 'text-green-400' : 'text-red-400'}>
                                {job.status === 'completed' ? '✅' : '❌'} Job {idx + 1}
                              </span>
                              {/* Quality Score Badge */}
                              {job.status === 'completed' && job.qualityScore && (
                                <span className={`text-xs px-2 py-0.5 rounded ${job.qualityScore.score >= 90 ? 'bg-green-900/50 text-green-400' :
                                  job.qualityScore.score >= 70 ? 'bg-amber-900/50 text-amber-400' :
                                    'bg-red-900/50 text-red-400'
                                  }`}>
                                  ⭐ {job.qualityScore.score}%
                                </span>
                              )}
                              {/* Warning count */}
                              {job.warnings && job.warnings.length > 0 && (
                                <span className="text-xs text-amber-400">
                                  ⚠️ {job.warnings.length} warnings
                                </span>
                              )}
                            </div>
                            {/* Enhanced Error Display */}
                            {job.error && (
                              <div className="mt-2 p-3 bg-red-950/50 border border-red-800 rounded max-h-40 overflow-y-auto custom-scrollbar">
                                <pre className="text-red-300 text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                  {job.error}
                                </pre>
                              </div>
                            )}
                          </div>

                          {job.status === 'completed' && (
                            <button
                              onClick={() => handleDownloadBatchJob(job)}
                              className="ml-4 bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-bold text-white flex items-center gap-2 transition"
                            >
                              <DownloadIcon className="w-4 h-4" /> ZIP
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* SINGLE MODE UI */
            <>
              <div className="mb-10"><StepProgressBar steps={STEPS_CONFIG} currentStep={viewingStep} completedSteps={completedSteps} onStepClick={setViewingStep} /></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col h-[750px]">
                  <h2 className="text-2xl font-bold mb-1 text-sky-400">{activeStepConfig.title}</h2>
                  <div className="mb-4">
                    <label className="text-xs font-bold text-slate-500 uppercase">AI Persona</label>
                    <select value={selectedPromptIds[viewingStep] || ''} onChange={handlePromptSelectionChange} className="w-full bg-slate-700 border border-slate-600 rounded py-2 px-3 text-white text-sm">
                      {availablePromptsForStep.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="flex-grow overflow-auto mb-4 custom-scrollbar">
                    {viewingStep === 1 && <input type="text" value={topicKeyword} onChange={e => setTopicKeyword(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-3" placeholder="Keyword..." />}

                    {viewingStep === 2 && (
                      <div className="space-y-4 mb-4">
                        <div>
                          <label className="text-xs font-bold text-slate-400 uppercase flex justify-between">
                            <span>Scene Count (Số cảnh)</span>
                            <span className="text-sky-400">{sceneCount} scenes</span>
                          </label>
                          <input type="range" min="5" max="300" value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer mt-2" />
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1"><span>Min: 5</span><span>Max: 300</span></div>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-400 uppercase flex justify-between">
                            <span>Word Count Target (Số từ mục tiêu)</span>
                          </label>
                          <div className="flex gap-4 mt-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-slate-500 mb-1 block">Target (Mục tiêu)</label>
                              <input
                                type="number"
                                min="10"
                                max="100"
                                value={singleTargetWords}
                                onChange={e => setSingleTargetWords(Number(e.target.value))}
                                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-sky-500 outline-none"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-slate-500 mb-1 block">Tolerance (± Dung sai)</label>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                value={singleTolerance}
                                onChange={e => setSingleTolerance(Number(e.target.value))}
                                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-sky-500 outline-none"
                              />
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1 font-mono text-center">
                            Range: {singleTargetWords - singleTolerance} - {singleTargetWords + singleTolerance} words
                          </div>
                        </div>
                      </div>
                    )}

                    {getInputForStep(viewingStep) && viewingStep !== 1 && (
                      <textarea value={editableInput} onChange={e => setEditableInput(e.target.value)} rows={10} className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm text-slate-300" />
                    )}
                    {getInputForStep(viewingStep) && viewingStep !== 1 && <button onClick={handleUpdateInput} className="text-xs bg-green-700 mt-2 px-2 py-1 rounded">Update Input</button>}
                    {updateSuccessMessage && <span className="text-green-400 text-xs ml-2">{updateSuccessMessage}</span>}
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-700">
                    {viewingStep === currentStep && <button onClick={handleGenerate} disabled={isLoading} className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded shadow-lg flex justify-center items-center gap-2">{isLoading ? <LoadingSpinnerIcon className="animate-spin h-5 w-5" /> : <WandIcon className="h-5 w-5" />} {activeStepConfig.buttonText}</button>}
                    {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
                  </div>
                </div>
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col h-[750px] relative">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white">Result</h2>
                    <div className="flex gap-2">
                      {stepOutputs[viewingStep] && (
                        <button onClick={() => handleDownloadSingle(viewingStep, stepOutputs[viewingStep]!)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors" title="Download .txt">
                          <DownloadIcon className="h-4 w-4" />
                        </button>
                      )}
                      {stepOutputs[viewingStep] && <button onClick={handleCopyResult} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"><CopyIcon className="h-4 w-4" /></button>}
                    </div>
                  </div>
                  <div className={`bg-slate-900 rounded p-4 flex-grow overflow-auto border border-slate-700 relative ${viewingStep === 4 ? 'p-0' : ''}`}>
                    {/* PROGRESS OVERLAY */}
                    {isLoading && progress && (
                      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-6 text-center">
                        <LoadingSpinnerIcon className="h-10 w-10 animate-spin text-sky-500 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">{progress.message}</h3>
                        <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 ease-out"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Đang xử lý bước {progress.current}/{progress.total}</p>
                      </div>
                    )}

                    {isLoading && viewingStep === currentStep && !progress ? <LoadingSpinnerIcon className="h-10 w-10 animate-spin text-sky-500 m-auto" /> :
                      (viewingStep === 4 && stepOutputs[viewingStep] ? renderSplitPromptView(stepOutputs[viewingStep]!) : <div className="whitespace-pre-wrap text-sm text-slate-200">{stepOutputs[viewingStep]}</div>)
                    }
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
