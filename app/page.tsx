'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { STEPS_CONFIG } from '@/lib/constants';
import { StepOutputs, BatchJob, SystemPromptData } from '@/lib/types';
import { getPromptContentById } from '@/lib/prompt-utils'; // Use new utils
import { RegistryService } from '@/lib/prompt-registry/client-registry'; // Use new registry service
import {
  getNewsAndEvents,
  createOutline,
  createScriptBatch,
  splitScriptIntoChunks,
  generatePromptsBatch,
  mergePromptJsons,
  extractVoiceOver,
  createMetadata
} from '@/services/geminiService';
import StepProgressBar from '@/components/StepProgressBar';
import WandIcon from '@/components/icons/WandIcon';
import LoadingSpinnerIcon from '@/components/icons/LoadingSpinnerIcon';
import CopyIcon from '@/components/icons/CopyIcon';
import CheckIcon from '@/components/icons/CheckIcon';
import RefreshCwIcon from '@/components/icons/RefreshCwIcon';
import TrashIcon from '@/components/icons/TrashIcon';
import PromptManager from '@/components/PromptManager';
import ImageIcon from '@/components/icons/ImageIcon';
import VideoIcon from '@/components/icons/VideoIcon';
import AdminPanel from '@/components/AdminPanel';
import LogOutIcon from '@/components/icons/LogOutIcon';
import SaveIcon from '@/components/icons/SaveIcon';


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
  const [apiKey, setApiKey] = useState<string>('');
  const [saveApiKey, setSaveApiKey] = useState<boolean>(false);

  // Prompt Management
  const [promptsLibrary, setPromptsLibrary] = useState<SystemPromptData[]>([]); // Initialize empty
  const [selectedPromptIds, setSelectedPromptIds] = useState<{ [key: number]: string }>({});

  // Admin & UI
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [copiedAllResults, setCopiedAllResults] = useState<boolean>(false);

  // --- BATCH MODE STATE ---
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchInputRaw, setBatchInputRaw] = useState('');
  const [batchQueue, setBatchQueue] = useState<BatchJob[]>([]);
  const [processedJobs, setProcessedJobs] = useState<BatchJob[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Delays
  const [delayBetweenSteps, setDelayBetweenSteps] = useState(2000); // ms
  const [delayBetweenJobs, setDelayBetweenJobs] = useState(5000); // ms

  const [editableInput, setEditableInput] = useState('');
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState('');

  // --- INITIALIZATION ---
  useEffect(() => {
    const initApp = async () => {
      // 1. Fetch Prompts from Registry (API + LocalStorage Merge)
      const serverPrompts = await RegistryService.fetchPrompts();
      const finalLibrary = RegistryService.mergeWithLocal(serverPrompts);

      setPromptsLibrary(finalLibrary);

      // 2. Setup Default Selections
      const defaults: { [key: number]: string } = {};
      STEPS_CONFIG.forEach(step => {
        const exists = finalLibrary.find(p => p.id === step.defaultPromptId);
        if (!exists) {
          // Determine fallback: find first prompt for this step in library
          const fallback = finalLibrary.find(p => p.stepId === step.id);
          defaults[step.id] = fallback ? fallback.id : step.defaultPromptId;
        } else {
          defaults[step.id] = step.defaultPromptId;
        }
      });

      // 3. Load User Selections
      try {
        const savedIds = localStorage.getItem('selectedPromptIds');
        if (savedIds) setSelectedPromptIds({ ...defaults, ...JSON.parse(savedIds) });
        else setSelectedPromptIds(defaults);
      } catch { setSelectedPromptIds(defaults); }
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
    // Save entire library to local storage (legacy compatibility)
    // Ideally, in V2, we should only save the diffs/customs.
    localStorage.setItem('systemPromptsLibrary', JSON.stringify(newPrompts));
  };

  const handleResetPrompts = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục về cài đặt mặc định gốc?\nMọi thay đổi cục bộ sẽ bị mất.')) {
      localStorage.removeItem('systemPromptsLibrary');
      window.location.reload();
    }
  };

  const handleAdminLogin = () => {
    const pass = prompt("Nhập mật khẩu Admin (mặc định: admin123):");
    if (pass === "admin123") { setIsAdmin(true); setShowAdmin(true); }
    else { alert("Sai mật khẩu"); }
  };

  // --- BATCH PROCESSING LOGIC ---

  const handleAddToQueue = () => {
    if (!batchInputRaw.trim()) return;

    // Logic mới: Tách bằng 2 dấu xuống dòng trở lên (một hàng trống)
    const inputs = batchInputRaw.split(/\n\s*\n/).map(line => line.trim()).filter(line => line.length > 0);

    if (inputs.length === 0) return;

    // Kiểm tra giới hạn
    if (batchQueue.length + inputs.length > MAX_QUEUE_SIZE) {
      alert(`Hàng chờ chỉ chứa tối đa ${MAX_QUEUE_SIZE} kịch bản. Bạn đang thêm ${inputs.length} mục, nhưng chỉ còn trống ${MAX_QUEUE_SIZE - batchQueue.length}.`);
      return;
    }

    const newJobs: BatchJob[] = inputs.map((input, idx) => ({
      id: `JOB_${Date.now()}_${batchQueue.length + idx}`,
      input: input,
      status: 'pending',
      outputs: {}
    }));

    setBatchQueue(prev => [...prev, ...newJobs]);
    setBatchInputRaw(''); // Clear input after adding
  };

  const handleClearQueue = () => {
    if (isProcessingBatch) {
      alert("Không thể xóa hàng chờ khi đang chạy.");
      return;
    }
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ hàng chờ và danh sách đã hoàn thành?")) {
      setBatchQueue([]);
      setProcessedJobs([]);
    }
  };

  const processSingleScript = async (input: string, jobIndex: number, totalJobs: number) => {
    if (!apiKey) throw new Error("Missing API Key");

    // Helper to wait
    const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

    const outputs: StepOutputs = {};

    try {
      // --- STEP 2: OUTLINE ---
      setProgress({ current: 1, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Đang tạo Outline...` });
      const prompt2 = getPromptContentById(selectedPromptIds[2], promptsLibrary);
      const outline = await createOutline(apiKey, input, prompt2, sceneCount);
      outputs[2] = outline;
      await wait(delayBetweenSteps);

      // --- STEP 3: SCRIPT ---
      const SCENES_PER_BATCH = 5;
      const totalBatches = Math.ceil(sceneCount / SCENES_PER_BATCH);
      let fullScript = "";
      const prompt3 = getPromptContentById(selectedPromptIds[3], promptsLibrary);

      for (let b = 0; b < totalBatches; b++) {
        setProgress({
          current: 3, total: 6,
          message: `[Job ${jobIndex}/${totalJobs}] Đang viết kịch bản (Batch ${b + 1}/${totalBatches})...`
        });
        const chunk = await createScriptBatch(apiKey, outline, prompt3, fullScript, b, sceneCount);
        if (chunk.includes("END_OF_SCRIPT")) {
          fullScript += "\n" + chunk.replace("END_OF_SCRIPT", "").trim();
          break;
        }
        fullScript += "\n" + chunk;
      }
      outputs[3] = fullScript.trim();
      await wait(delayBetweenSteps);

      // --- STEP 4: PROMPTS ---
      setProgress({ current: 4, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Đang trích xuất Prompts...` });
      const prompt4 = getPromptContentById(selectedPromptIds[4], promptsLibrary);
      const scriptChunks = splitScriptIntoChunks(outputs[3]);
      const jsonResults = [];
      for (const chunk of scriptChunks) {
        const res = await generatePromptsBatch(apiKey, chunk, prompt4);
        jsonResults.push(res);
      }
      outputs[4] = mergePromptJsons(jsonResults);
      await wait(delayBetweenSteps);

      // --- STEP 5: VO ---
      setProgress({ current: 5, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Đang tách Voice Over...` });
      const prompt5 = getPromptContentById(selectedPromptIds[5], promptsLibrary);
      const vo = await extractVoiceOver(apiKey, outputs[3], prompt5);
      outputs[5] = vo;
      await wait(delayBetweenSteps);

      // --- STEP 6: METADATA ---
      setProgress({ current: 6, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Đang tạo Metadata...` });
      const prompt6 = getPromptContentById(selectedPromptIds[6], promptsLibrary);
      const meta = await createMetadata(apiKey, outputs[3], prompt6);
      outputs[6] = meta;

      return outputs;

    } catch (e: any) {
      throw new Error(e.message);
    }
  };

  const runBatchQueue = async () => {
    if (!apiKey) { alert("Vui lòng nhập API Key trước."); return; }
    if (batchQueue.length === 0) return;

    setIsProcessingBatch(true);
    const queueCopy = [...batchQueue];

    for (let i = 0; i < queueCopy.length; i++) {
      const job = queueCopy[i];
      // Update status to processing
      setBatchQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j));

      try {
        const outputs = await processSingleScript(job.input, i + 1, queueCopy.length);

        // Move to processed
        setProcessedJobs(prev => [...prev, { ...job, status: 'completed', outputs }]);
        setBatchQueue(prev => prev.filter(j => j.id !== job.id)); // Remove from queue

      } catch (e: any) {
        setProcessedJobs(prev => [...prev, { ...job, status: 'failed', error: e.message, outputs: {} }]);
        setBatchQueue(prev => prev.filter(j => j.id !== job.id));
      }

      // Delay between jobs
      if (i < queueCopy.length - 1) {
        setProgress({ current: 0, total: 0, message: `Đang đợi ${delayBetweenJobs}ms trước kịch bản tiếp theo...` });
        await new Promise(r => setTimeout(r, delayBetweenJobs));
      }
    }

    setIsProcessingBatch(false);
    setProgress(null);
  };

  // --- SINGLE MODE HANDLERS ---
  const handleGenerate = async () => {
    if (!apiKey) { setError("Vui lòng nhập API Key."); return; }
    setIsLoading(true); setError(null);

    const currentPromptId = selectedPromptIds[currentStep];
    const systemPromptContent = getPromptContentById(currentPromptId, promptsLibrary);
    let result: string | undefined;

    try {
      if (currentStep === 1) {
        if (!topicKeyword) throw new Error("Nhập từ khóa.");
        result = await getNewsAndEvents(apiKey, topicKeyword, systemPromptContent);
      } else {
        const input = getInputForStep(currentStep);
        if (!input) throw new Error("Thiếu dữ liệu đầu vào.");

        if (currentStep === 2) {
          setProgress({ current: 1, total: 1, message: 'Creating Outline...' });
          result = await createOutline(apiKey, input, systemPromptContent, sceneCount);
        } else if (currentStep === 3) {
          const SCENES_PER_BATCH = 5;
          const totalBatches = Math.ceil(sceneCount / SCENES_PER_BATCH);
          let fullScript = "";
          for (let i = 0; i < totalBatches; i++) {
            setProgress({ current: i + 1, total: totalBatches, message: `Scripting Batch ${i + 1}/${totalBatches}` });
            const chunk = await createScriptBatch(apiKey, input, systemPromptContent, fullScript, i, sceneCount);
            if (chunk.includes("END_OF_SCRIPT")) {
              fullScript += "\n" + chunk.replace("END_OF_SCRIPT", "").trim(); break;
            }
            fullScript += "\n" + chunk;
          }
          result = fullScript.trim();
        } else if (currentStep === 4) {
          const chunks = splitScriptIntoChunks(input);
          const jsons = [];
          for (let i = 0; i < chunks.length; i++) {
            setProgress({ current: i + 1, total: chunks.length, message: `Prompts Batch ${i + 1}` });
            jsons.push(await generatePromptsBatch(apiKey, chunks[i], systemPromptContent));
          }
          result = mergePromptJsons(jsons);
        } else if (currentStep === 5) {
          result = await extractVoiceOver(apiKey, input, systemPromptContent);
        } else if (currentStep === 6) {
          result = await createMetadata(apiKey, input, systemPromptContent);
        }
      }
      if (result) {
        setStepOutputs(prev => ({ ...prev, [currentStep]: result as string }));
        if (!completedSteps.includes(currentStep)) setCompletedSteps(prev => [...prev, currentStep]);
        if (currentStep < 6) { setCurrentStep(currentStep + 1); setViewingStep(currentStep + 1); }
      }
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); setProgress(null); }
  };

  // --- DOWNLOAD ---
  const downloadText = (filename: string, content: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadJob = (job: BatchJob) => {
    let content = `INPUT: ${job.input}\n\n`;
    content += `=== OUTLINE ===\n${job.outputs[2] || ''}\n\n`;
    content += `=== SCRIPT ===\n${job.outputs[3] || ''}\n\n`;
    content += `=== PROMPTS ===\n${job.outputs[4] || ''}\n\n`;
    content += `=== VOICE OVER ===\n${job.outputs[5] || ''}\n\n`;
    content += `=== METADATA ===\n${job.outputs[6] || ''}\n\n`;
    downloadText(`Script_${job.id}.txt`, content);
  };

  const handleDownloadAllJobs = () => {
    let fullContent = "";
    processedJobs.forEach(job => {
      fullContent += `\n################################################\n`;
      fullContent += `JOB ID: ${job.id} - INPUT: ${job.input}\n`;
      fullContent += `################################################\n\n`;
      fullContent += `=== OUTLINE ===\n${job.outputs[2] || ''}\n\n`;
      fullContent += `=== SCRIPT ===\n${job.outputs[3] || ''}\n\n`;
      fullContent += `=== PROMPTS ===\n${job.outputs[4] || ''}\n\n`;
      fullContent += `=== VOICE OVER ===\n${job.outputs[5] || ''}\n\n`;
      fullContent += `=== METADATA ===\n${job.outputs[6] || ''}`;
    });
    downloadText(`All_Scripts_${Date.now()}.txt`, fullContent);
  };

  // --- COMMON UI LOGIC ---
  const activeStepConfig = useMemo(() => STEPS_CONFIG.find(step => step.id === viewingStep)!, [viewingStep]);
  const availablePromptsForStep = useMemo(() => promptsLibrary.filter(p => p.stepId === viewingStep), [viewingStep, promptsLibrary]);

  const handlePromptSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPromptIds(prev => ({ ...prev, [viewingStep]: e.target.value }));
  };

  const getInputForStep = useCallback((stepId: number): string | null => {
    switch (stepId) {
      case 1: return topicKeyword;
      case 2: return stepOutputs[1];
      case 3: return stepOutputs[2];
      case 4: return stepOutputs[3];
      case 5: return stepOutputs[3];
      case 6: return stepOutputs[3];
      default: return null;
    }
  }, [stepOutputs, topicKeyword]);

  useEffect(() => {
    const inputContent = getInputForStep(viewingStep) ?? '';
    setEditableInput(inputContent);
    setUpdateSuccessMessage('');
  }, [viewingStep, stepOutputs, getInputForStep]);

  const handleUpdateInput = () => {
    const sourceStepId = INPUT_SOURCE_MAP[viewingStep];
    if (sourceStepId) {
      setStepOutputs(prev => ({ ...prev, [sourceStepId]: editableInput }));
      setUpdateSuccessMessage('Cập nhật thành công!');
      setTimeout(() => setUpdateSuccessMessage(''), 3000);
    }
  };

  // --- RENDER HELPERS ---
  const renderSplitPromptView = (output: string) => {
    let imagePrompts: string[] = [], videoPrompts: string[] = [], parseError = false;
    let originalJson = {};
    let jsonString = output.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIndex = jsonString.indexOf('{'), endIndex = jsonString.lastIndexOf('}');

    if (startIndex !== -1 && endIndex > startIndex) {
      jsonString = jsonString.substring(startIndex, endIndex + 1);
      try {
        const parsed = JSON.parse(jsonString);
        originalJson = parsed;
        imagePrompts = Array.isArray(parsed.imagePrompts) ? parsed.imagePrompts : [];
        videoPrompts = Array.isArray(parsed.videoPrompts) ? parsed.videoPrompts : [];
      } catch (e) { parseError = true; }
    } else { parseError = true; }

    if (parseError) {
      return (
        <div>
          <p className="text-red-400 mb-2">Lỗi phân tích cú pháp JSON. Hiển thị dữ liệu thô:</p>
          <p className="text-slate-300 whitespace-pre-wrap">{output}</p>
        </div>
      );
    }

    const handleUpdate = (type: 'image' | 'video', newPrompts: string[]) => {
      const updatedData = { ...originalJson, imagePrompts: type === 'image' ? newPrompts : imagePrompts, videoPrompts: type === 'video' ? newPrompts : videoPrompts };
      handleUpdateStepOutput(4, JSON.stringify(updatedData, null, 2));
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
        <PromptManager title="Image Prompts" prompts={imagePrompts} onUpdate={(newPrompts) => handleUpdate('image', newPrompts)} icon={<ImageIcon className="h-5 w-5 text-sky-400" />} />
        <PromptManager title="Video Prompts" prompts={videoPrompts} onUpdate={(newPrompts) => handleUpdate('video', newPrompts)} icon={<VideoIcon className="h-5 w-5 text-teal-400" />} />
      </div>
    );
  }

  const handleUpdateStepOutput = useCallback((stepId: number, newOutput: string) => {
    setStepOutputs(prev => ({ ...prev, [stepId]: newOutput }));
  }, []);

  const handleCopyResult = () => {
    const output = stepOutputs[viewingStep];
    if (output) {
      navigator.clipboard.writeText(output);
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    }
  };

  return (
    <div className="bg-slate-900 text-white min-h-screen font-sans">
      {/* ADMIN OVERLAY */}
      {showAdmin && (
        <AdminPanel prompts={promptsLibrary} onUpdatePrompts={handleUpdatePrompts} onClose={() => setShowAdmin(false)} />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-slate-700 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-400">
              AI SCRIPT FACTORY
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Tự động hóa quy trình sản xuất Video 5 bước (Marketplace Ready)
            </p>
          </div>

          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <button onClick={handleResetPrompts} title="Reset về mặc định" className="text-slate-500 hover:text-red-400 p-2">
              <RefreshCwIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIsBatchMode(!isBatchMode)}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${isBatchMode ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/50' : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700'}`}
            >
              {isBatchMode ? '📦 Batch Mode: ON' : '📦 Batch Mode: OFF'}
            </button>

            <button onClick={handleAdminLogin} className="text-slate-500 hover:text-sky-400 p-2" title="Admin Login">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M8 11h8" /><path d="M12 7v8" /></svg>
            </button>
          </div>
        </header>

        {/* API KEY INPUT */}
        <div className="max-w-3xl mx-auto mb-6 p-3 bg-slate-800 rounded border border-slate-700 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-grow w-full">
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:ring-sky-500" placeholder="Nhập Gemini API Key..." />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={saveApiKey} onChange={e => setSaveApiKey(e.target.checked)} className="h-4 w-4" />
            <label className="text-sm text-slate-400 whitespace-nowrap">Lưu Key</label>
          </div>
        </div>

        {/* --- BATCH MODE UI --- */}
        {isBatchMode ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Input Panel */}
            <div className="lg:col-span-1 bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg flex flex-col h-fit">
              <h2 className="text-xl font-bold text-amber-400 mb-4">📦 Nhập Liệu Hàng Loạt</h2>
              <p className="text-xs text-slate-400 mb-2">Nhập danh sách tin tức/kịch bản. <br />Mỗi kịch bản cách nhau bởi <span className="text-white font-bold">1 hàng trống (Enter 2 lần)</span>.</p>
              <textarea
                value={batchInputRaw}
                onChange={e => setBatchInputRaw(e.target.value)}
                className="w-full h-32 bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white mb-2 focus:ring-amber-500"
                placeholder="Kịch bản 1...&#10;&#10;Kịch bản 2..."
              />

              <div className="flex gap-2 mb-6">
                <button
                  onClick={handleAddToQueue}
                  disabled={batchQueue.length >= MAX_QUEUE_SIZE}
                  className="flex-grow py-2 bg-amber-700 hover:bg-amber-600 rounded text-white font-medium disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                  {batchQueue.length >= MAX_QUEUE_SIZE ? 'Đã đầy' : `Thêm vào Hàng Chờ (${batchQueue.length + 1})`}
                </button>
                <button
                  onClick={handleClearQueue}
                  className="px-3 py-2 bg-slate-700 hover:bg-red-900/50 hover:text-red-300 rounded text-slate-300 transition-colors"
                  title="Xóa tất cả"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 border-t border-slate-700 pt-4">
                <h3 className="font-bold text-slate-300 text-sm">Cấu hình:</h3>
                <div>
                  <label className="text-xs text-slate-400">Delay giữa các bước (ms):</label>
                  <input type="number" value={delayBetweenSteps} onChange={e => setDelayBetweenSteps(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Delay giữa các kịch bản (ms):</label>
                  <input type="number" value={delayBetweenJobs} onChange={e => setDelayBetweenJobs(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Số Scenes mục tiêu:</label>
                  <input type="number" value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1" />
                </div>
              </div>
            </div>

            {/* Queue & Process Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Status Bar */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-slate-400 text-sm block">Hàng chờ (Max 20)</span>
                    <span className="text-white font-bold text-2xl">{batchQueue.length} <span className="text-sm text-slate-500 font-normal">/ {MAX_QUEUE_SIZE}</span></span>
                  </div>
                  <div className="h-8 w-px bg-slate-600 mx-2"></div>
                  <div>
                    <span className="text-slate-400 text-sm block">Hoàn thành</span>
                    <span className="text-green-400 font-bold text-2xl">{processedJobs.length}</span>
                  </div>
                </div>
                <button onClick={runBatchQueue} disabled={isProcessingBatch || batchQueue.length === 0} className="w-full sm:w-auto px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform active:scale-95 flex items-center justify-center gap-2">
                  {isProcessingBatch ? <><LoadingSpinnerIcon className="inline h-4 w-4 animate-spin" /> Đang chạy...</> : '▶ CHẠY BATCH'}
                </button>
              </div>

              {processedJobs.length > 0 && (
                <div className="flex justify-end">
                  <button onClick={handleDownloadAllJobs} className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded flex items-center gap-2 shadow-md">
                    <SaveIcon className="h-4 w-4" /> Tải xuống tất cả
                  </button>
                </div>
              )}

              {/* Progress Monitor */}
              {isProcessingBatch && progress && (
                <div className="bg-slate-800 p-4 rounded-lg border border-sky-500/50 relative overflow-hidden shadow-lg shadow-sky-900/20">
                  <div className="flex justify-between text-xs text-sky-300 mb-1">
                    <span>Tiến độ xử lý</span>
                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-sky-500 transition-all duration-300 ease-out" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                  </div>
                  <p className="text-sky-200 text-sm font-medium animate-pulse text-center">{progress.message}</p>
                </div>
              )}

              {/* Job List */}
              <div className="bg-slate-900 rounded-lg border border-slate-700 h-[500px] overflow-auto p-4 space-y-3 custom-scrollbar">
                {/* Queue List */}
                {batchQueue.map((job, idx) => (
                  <div key={job.id} className={`p-4 rounded-lg border transition-all ${job.status === 'processing' ? 'border-sky-500 bg-slate-800 shadow-md shadow-sky-900/20 scale-[1.01]' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">#{idx + 1}</span>
                        <span className="text-xs font-bold text-slate-300">ID: {job.id.split('_')[2]}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${job.status === 'processing' ? 'bg-sky-900 text-sky-200 animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
                        {job.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 line-clamp-2 pl-2 border-l-2 border-slate-600">{job.input}</p>
                  </div>
                ))}

                {/* Completed List (Moved to bottom or separate section? Keeping here for history) */}
                {processedJobs.map((job) => (
                  <div key={job.id} className={`p-4 rounded-lg border ${job.status === 'completed' ? 'border-green-800 bg-green-900/10' : 'border-red-800 bg-red-900/10'}`}>
                    <div className="flex justify-between items-start">
                      <div className="w-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${job.status === 'completed' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>{job.status}</span>
                          {job.status === 'completed' && (
                            <button onClick={() => handleDownloadJob(job)} className="text-xs flex items-center gap-1 text-slate-400 hover:text-white bg-slate-800 px-2 py-1 rounded border border-slate-700 transition-colors">
                              <SaveIcon className="h-3 w-3" /> Tải về
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 line-clamp-2 mb-1">{job.input}</p>
                        {job.error && <p className="text-xs text-red-400 mt-2 bg-red-900/20 p-2 rounded border border-red-900/50">Lỗi: {job.error}</p>}
                      </div>
                    </div>
                  </div>
                ))}

                {batchQueue.length === 0 && processedJobs.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                    <p>Danh sách trống.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // --- SINGLE MODE UI (GIAO DIỆN CŨ) ---
          <>
            <div className="mb-10">
              <StepProgressBar steps={STEPS_CONFIG} currentStep={viewingStep} completedSteps={completedSteps} onStepClick={setViewingStep} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* LEFT PANEL: CONFIG & ACTION */}
              <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col h-[750px]">
                <h2 className="text-2xl font-bold mb-1 text-sky-400">{activeStepConfig.title}</h2>
                <p className="text-slate-400 mb-6 text-sm">{activeStepConfig.description}</p>

                <div className="mb-4">
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Chọn AI Persona</label>
                    {isAdmin && <span className="text-[10px] bg-green-900 text-green-300 px-1 rounded">Admin</span>}
                  </div>
                  <select
                    value={selectedPromptIds[viewingStep] || ''}
                    onChange={handlePromptSelectionChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded py-2 px-3 text-white text-sm"
                  >
                    {availablePromptsForStep.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* STEP SPECIFIC INPUTS */}
                <div className="flex-grow overflow-auto mb-4 custom-scrollbar pr-2">
                  {viewingStep === 1 && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Chủ đề / Từ khóa</label>
                      <input type="text" value={topicKeyword} onChange={e => setTopicKeyword(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-3 focus:ring-sky-500" placeholder="Nhập chủ đề..." />
                    </div>
                  )}

                  {viewingStep === 2 && (
                    <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600 mb-4">
                      <label className="flex justify-between text-sm font-medium text-sky-400 mb-2">
                        <span>Số phân cảnh (Scenes)</span>
                        <span className="text-white">{sceneCount}</span>
                      </label>
                      <input type="range" min="5" max="100" step="1" value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                    </div>
                  )}

                  {getInputForStep(viewingStep) && viewingStep !== 1 && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold text-slate-300">Dữ liệu đầu vào:</h3>
                        {editableInput !== getInputForStep(viewingStep) && (
                          <button onClick={handleUpdateInput} className="text-xs bg-green-700 hover:bg-green-600 px-2 py-1 rounded text-white">Lưu sửa đổi</button>
                        )}
                      </div>
                      <textarea
                        value={editableInput}
                        onChange={e => setEditableInput(e.target.value)}
                        rows={10}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm text-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                      {updateSuccessMessage && <p className="text-xs text-green-400 mt-1">{updateSuccessMessage}</p>}
                    </div>
                  )}
                </div>

                {/* ACTIONS */}
                <div className="mt-auto pt-4 border-t border-slate-700">
                  {viewingStep === currentStep && (
                    <button onClick={handleGenerate} disabled={isLoading || (currentStep > 1 && !completedSteps.includes(currentStep - 1))} className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
                      {isLoading ? <LoadingSpinnerIcon className="animate-spin h-5 w-5" /> : <WandIcon className="h-5 w-5" />}
                      {STEPS_CONFIG.find(s => s.id === currentStep)?.buttonText}
                    </button>
                  )}
                  {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
                </div>
              </div>

              {/* RIGHT PANEL: RESULTS */}
              <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col h-[750px]">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-700">
                  <h2 className="text-lg font-bold text-white">Kết Quả</h2>
                  {stepOutputs[viewingStep] && viewingStep !== 4 && (
                    <button onClick={handleCopyResult} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
                      {copiedResult ? <CheckIcon className="h-5 w-5 text-green-400" /> : <CopyIcon className="h-5 w-5" />}
                    </button>
                  )}
                </div>

                <div className={`bg-slate-900 rounded p-4 flex-grow overflow-auto border border-slate-700 ${viewingStep === 4 ? 'p-0' : ''}`}>
                  {isLoading && viewingStep === currentStep ? (
                    <div className="h-full flex flex-col justify-center items-center text-slate-400">
                      <LoadingSpinnerIcon className="h-10 w-10 animate-spin text-sky-500 mb-4" />
                      <p>{progress?.message || "Đang xử lý..."}</p>
                      {progress && progress.total > 0 && (
                        <div className="w-48 h-1 bg-slate-700 mt-2 rounded overflow-hidden">
                          <div className="h-full bg-sky-500 transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                        </div>
                      )}
                    </div>
                  ) : viewingStep === 4 && stepOutputs[viewingStep] ? (
                    renderSplitPromptView(stepOutputs[viewingStep]!)
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                      {stepOutputs[viewingStep] || <span className="text-slate-500 italic">Chưa có kết quả...</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
