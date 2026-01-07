'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { STEPS_CONFIG } from '@/lib/constants';
import { StepOutputs, BatchJob, SystemPromptData, PromptPackManifest } from '@/lib/types';
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
} from '@/services/geminiService';

import StepProgressBar from '@/components/StepProgressBar';
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
  const [wordCountMin, setWordCountMin] = useState<number>(18);
  const [wordCountMax, setWordCountMax] = useState<number>(22);
  const [apiKey, setApiKey] = useState<string>('');
  const [saveApiKey, setSaveApiKey] = useState<boolean>(false);

  // Prompt Management
  const [promptsLibrary, setPromptsLibrary] = useState<SystemPromptData[]>([]);
  const [availablePacks, setAvailablePacks] = useState<PromptPackManifest[]>([]);
  const [selectedPromptIds, setSelectedPromptIds] = useState<{ [key: number]: string }>({});

  // Admin & UI
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

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

  const handleAdminLogin = () => {
    const pass = prompt("Nhập mật khẩu Admin (mặc định: admin123):");
    if (pass === "admin123") { setIsAdmin(true); setShowAdmin(true); }
    else { alert("Sai mật khẩu"); }
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
      // Step
      const totalOutlineBatches = Math.ceil(sceneCount / 5); // Batch size reduced to 5 in Service
      let fullOutline = "";
      for (let b = 0; b < totalOutlineBatches; b++) {
        setProgress({ current: 2, total: 6, message: `[Job ${jobIndex}/${totalJobs}] Outline Batch ${b + 1}/${totalOutlineBatches} (Strict Word Count)...` });
        // Pass Min/Max
        const chunk = await createOutlineBatch(apiKey, input, getPromptContentById(selectedPromptIds[2], promptsLibrary), fullOutline, b, sceneCount, wordCountMin, wordCountMax);
        if (chunk === "END_OF_OUTLINE") break;
        fullOutline += "\n" + chunk;
      } outputs[2] = fullOutline.trim();
      await wait(delayBetweenSteps);

      // Step 3
      const totalBatches = Math.ceil(sceneCount / 5);
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
      outputs[5] = await extractVoiceOver(apiKey, outputs[3], getPromptContentById(selectedPromptIds[5], promptsLibrary), wordCountMin, wordCountMax);
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
          const totalBatches = Math.ceil(sceneCount / 10);
          let fullOutline = "";
          for (let b = 0; b < totalBatches; b++) {
            setProgress({ current: b + 1, total: totalBatches, message: `Creating Outline Batch ${b + 1}/${totalBatches} (Validate Word Count)...` });
            // Pass Min/Max to validation logic
            const chunk = await createOutlineBatch(apiKey, input, promptContent, fullOutline, b, sceneCount, wordCountMin, wordCountMax);
            if (chunk === "END_OF_OUTLINE") break;
            fullOutline += "\n" + chunk;
          }
          result = fullOutline.trim();
        } else if (currentStep === 3) {
          const totalBatches = Math.ceil(sceneCount / 5);
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
        } else if (currentStep === 5) result = await extractVoiceOver(apiKey, input, promptContent, wordCountMin, wordCountMax);
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

  return (
    <div className="bg-slate-900 text-white min-h-screen font-sans">
      {showAdmin && <AdminPanel prompts={promptsLibrary} onUpdatePrompts={handleUpdatePrompts} onClose={() => setShowAdmin(false)} />}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-slate-700 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-400">AI SCRIPT FACTORY</h1>
            <p className="text-slate-400 text-sm mt-1">Marketplace Ready - Phase 3</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* PACK SELECTOR */}
            <div className="relative group">
              <select
                onChange={(e) => handleApplyPack(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-sky-400 font-bold focus:ring-sky-500 cursor-pointer hover:bg-slate-700 transition-colors appearance-none pr-8"
                defaultValue=""
              >
                <option value="" disabled>--- Chọn Bộ AI Workforce ---</option>
                {availablePacks.map(pack => (
                  <option key={pack.id} value={pack.id}>{pack.name} (v{pack.version})</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
            </div>

            <div className="h-6 w-px bg-slate-700 mx-2"></div>

            <button onClick={handleResetPrompts} title="Reset về mặc định" className="text-slate-500 hover:text-red-400 p-2"><RefreshCwIcon className="h-5 w-5" /></button>
            <button onClick={() => setIsBatchMode(!isBatchMode)} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${isBatchMode ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-800 text-slate-300 border border-slate-600'}`}>
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
          /* BATCH UI */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <h2 className="text-xl font-bold text-amber-400 mb-4">Inputs</h2>
              <textarea value={batchInputRaw} onChange={e => setBatchInputRaw(e.target.value)} className="w-full h-32 bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white mb-4" placeholder="Input 1...&#10;&#10;Input 2..." />
              <button onClick={handleAddToQueue} className="w-full py-2 bg-amber-700 rounded text-white font-bold">Add to Queue</button>
            </div>
            <div className="col-span-2 space-y-4">
              <div className="flex justify-between items-center bg-slate-800 p-4 rounded border border-slate-700">
                <div>Queue: {batchQueue.length} | Done: {processedJobs.length}</div>
                <button onClick={runBatchQueue} disabled={isProcessingBatch} className="px-6 py-2 bg-green-600 rounded font-bold text-white">RUN BATCH</button>
              </div>
              <div className="h-96 bg-slate-900 rounded border border-slate-700 p-4 overflow-auto">
                {batchQueue.map((j, i) => <div key={j.id} className="p-2 border-b border-slate-800 text-sm text-slate-400">#{i + 1} {j.status}</div>)}
                {processedJobs.map((j, i) => <div key={j.id} className="p-2 border-b border-slate-800 text-sm text-green-400">DONE: {j.id}</div>)}
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
                        <input type="range" min="5" max="100" value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer mt-2" />
                        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1"><span>Min: 5</span><span>Max: 100</span></div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase flex justify-between">
                          <span>Word Limit / VO (Giới hạn từ/câu)</span>
                        </label>
                        <div className="flex gap-4 mt-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-slate-500 mb-1 block">Min Words</label>
                            <input
                              type="number"
                              min="5"
                              max="100"
                              value={wordCountMin}
                              onChange={e => setWordCountMin(Number(e.target.value))}
                              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-sky-500 outline-none"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-slate-500 mb-1 block">Max Words</label>
                            <input
                              type="number"
                              min="10"
                              max="200"
                              value={wordCountMax}
                              onChange={e => setWordCountMax(Number(e.target.value))}
                              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-sky-500 outline-none"
                            />
                          </div>
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
  );
}
