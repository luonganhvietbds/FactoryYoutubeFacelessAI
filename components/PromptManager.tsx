
'use client';

import React, { useState, useEffect, useRef } from 'react';
import CopyIcon from './icons/CopyIcon';
import CheckIcon from './icons/CheckIcon';
import TrashIcon from './icons/TrashIcon';
import EditIcon from './icons/EditIcon';
import SaveIcon from './icons/SaveIcon';
import SearchIcon from './icons/SearchIcon';

interface PromptManagerProps {
  title: string;
  prompts: string[];
  onUpdate: (newPrompts: string[]) => void;
  icon?: React.ReactNode;
  className?: string;
}

const PromptManager: React.FC<PromptManagerProps> = ({ title, prompts, onUpdate, icon, className }) => {
  const [editablePrompts, setEditablePrompts] = useState(prompts);
  const [editedIndex, setEditedIndex] = useState<number | null>(null);
  const [tempPrompt, setTempPrompt] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [filter, setFilter] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const newPromptTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditablePrompts(prompts);
    if (isAdding) setIsAdding(false);
  }, [prompts]);

  useEffect(() => {
    if (editedIndex !== null && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [editedIndex, tempPrompt]);

  useEffect(() => {
    if (isAdding && newPromptTextareaRef.current) {
      newPromptTextareaRef.current.focus();
    }
  }, [isAdding]);


  const handleEdit = (index: number) => {
    setEditedIndex(index);
    setTempPrompt(filteredPrompts[index].original);
    setIsAdding(false);
  };

  const handleSave = (index: number) => {
    const originalIndex = filteredPrompts[index].originalIndex;
    const newPromptsList = [...editablePrompts];
    newPromptsList[originalIndex] = tempPrompt;
    setEditablePrompts(newPromptsList);
    onUpdate(newPromptsList);
    setEditedIndex(null);
  };

  const handleCancel = () => {
    setEditedIndex(null);
    setTempPrompt('');
  }

  const handleDelete = (index: number) => {
    if (window.confirm('Bạn có chắc muốn xóa prompt này không?')) {
      const originalIndex = filteredPrompts[index].originalIndex;
      const newPromptsList = editablePrompts.filter((_, i) => i !== originalIndex);
      setEditablePrompts(newPromptsList);
      onUpdate(newPromptsList);
    }
  };

  const handleCopy = (index: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = () => {
    // Cập nhật: Nối các prompt bằng 2 ký tự xuống dòng (tạo 1 dòng trống ở giữa)
    navigator.clipboard.writeText(editablePrompts.join('\n\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  const handleDownloadAll = () => {
    // Tải về file text, các prompt cách nhau 1 dòng trống
    const content = editablePrompts.join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_Prompts.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveNew = () => {
    if (newPrompt.trim()) {
      const newPromptsList = [...editablePrompts, newPrompt.trim()];
      onUpdate(newPromptsList);
      setNewPrompt('');
      setIsAdding(false);
    }
  };

  const handleStartAdding = () => {
    setIsAdding(true);
    setEditedIndex(null);
  };

  const filteredPrompts = editablePrompts
    .map((p, i) => ({ original: p, originalIndex: i }))
    .filter(p => p.original.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className={`flex flex-col h-full ${className} p-3`}>
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-700">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          {icon}
          {title}
          <span className="text-sm font-normal bg-slate-700 text-slate-300 rounded-full px-2 py-0.5">{prompts.length}</span>
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={handleDownloadAll} title="Tải xuống file text" className="p-1.5 rounded-md hover:bg-slate-700 transition-colors flex items-center gap-1 text-xs text-slate-300">
            <SaveIcon className="h-4 w-4 text-sky-400" />
          </button>
          <button onClick={handleCopyAll} title="Copy tất cả (cách dòng)" className="p-1.5 rounded-md hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-xs text-slate-300">
            {copiedAll ? <CheckIcon className="h-4 w-4 text-green-400" /> : <CopyIcon className="h-4 w-4 text-slate-400" />}
            {copiedAll ? 'Copied' : 'All'}
          </button>
          <button onClick={handleStartAdding} title="Thêm prompt mới" className="p-1.5 rounded-md hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-xs text-slate-300 bg-slate-700/50 border border-slate-600 ml-1">
            <span>+ Add</span>
          </button>
        </div>
      </div>
      <div className="relative mb-2">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
          <SearchIcon className="h-4 w-4 text-slate-500" />
        </span>
        <input
          type="text"
          placeholder={`Lọc qua ${prompts.length} prompts...`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-slate-700/50 border border-slate-600 rounded-md py-1.5 pl-9 pr-3 text-white focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm"
        />
      </div>
      <div className="flex-grow overflow-y-auto space-y-2 pr-2 -mr-2">
        {filteredPrompts.length > 0 ? filteredPrompts.map(({ original, originalIndex }, i) => (
          <div key={originalIndex} className="bg-slate-800/70 border border-slate-700 p-3 rounded-lg group relative flex items-start gap-3 transition-colors hover:border-slate-600">
            <span className="text-sm font-mono text-slate-500 select-none pt-0.5">{originalIndex + 1}.</span>
            <div className="flex-grow">
              {editedIndex === i ? (
                <div>
                  <textarea
                    ref={textareaRef}
                    value={tempPrompt}
                    onChange={(e) => setTempPrompt(e.target.value)}
                    className="w-full bg-slate-900 border border-sky-500 rounded-md p-2 text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm resize-none overflow-hidden"
                    rows={1}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => handleSave(i)} className="flex items-center gap-1 text-sm px-2 py-1 bg-sky-600 hover:bg-sky-700 rounded-md"> <SaveIcon className="h-4 w-4" /> Lưu</button>
                    <button onClick={handleCancel} className="text-sm px-2 py-1 hover:bg-slate-700 rounded-md">Hủy</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{original}</p>
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-slate-800 p-1 rounded-md border border-slate-700 opacity-20 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                    <button onClick={() => handleEdit(i)} title="Chỉnh sửa" className="p-1.5 hover:bg-slate-600 rounded"><EditIcon className="h-4 w-4 text-slate-400" /></button>
                    <button onClick={() => handleCopy(i, original)} title="Copy" className="p-1.5 hover:bg-slate-600 rounded">
                      {copiedIndex === i ? <CheckIcon className="h-4 w-4 text-green-400" /> : <CopyIcon className="h-4 w-4 text-slate-400" />}
                    </button>
                    <button onClick={() => handleDelete(i)} title="Xóa" className="p-1.5 hover:bg-slate-600 rounded"><TrashIcon className="h-4 w-4 text-red-400" /></button>
                  </div>
                </>
              )}
            </div>
          </div>
        )) : <p className="text-slate-500 text-center py-4">{filter ? 'Không tìm thấy prompt khớp.' : 'Không có prompt.'}</p>}

        {isAdding && (
          <div className="mt-2 p-3 bg-slate-800 border border-sky-500 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-slate-300">Thêm prompt mới</h4>
            <textarea
              ref={newPromptTextareaRef}
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm resize-y"
              placeholder="Nhập nội dung prompt mới..."
              rows={3}
            />
            <div className="flex items-center gap-2 mt-2">
              <button onClick={handleSaveNew} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-sky-600 hover:bg-sky-700 rounded-md">
                <SaveIcon className="h-4 w-4" /> Lưu Prompt
              </button>
              <button onClick={() => setIsAdding(false)} className="text-sm px-3 py-1.5 hover:bg-slate-700 rounded-md">Hủy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptManager;
