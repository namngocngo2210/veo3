import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, memo } from 'react';
import { VideoResult, generateVideo, generateBatch } from '../lib/gemini';
import { getApiKey, saveTabHistory, getTabHistory, filePathToUrl, SavedPrompt, getSavePath, saveSavePath, openPath, getLicenseData } from '../lib/store';
import { VideoResultList } from './VideoResultList';
import { Plus, X, Play, Loader2, Trash2, RotateCcw, Upload, FolderOpen, Download, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { translations, Language } from '../lib/i18n';
import { useToast } from './Toast';

interface Props { model: string; language: string; }

interface PromptItem {
    text: string;
    results: VideoResult[];
    isProcessing: boolean;
}

export interface TextToVideoTabHandle {
    addPrompts: (prompts: string[]) => void;
}

export const TextToVideoTab = forwardRef<TextToVideoTabHandle, Props>(({ model, language }, ref) => {
    const [prompts, setPrompts] = useState<PromptItem[]>([]);
    const [input, setInput] = useState('');
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [saveDir, setSaveDir] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const promptsRef = useRef(prompts);
    promptsRef.current = prompts;

    const t = translations[language as Language] || translations.vi;
    const { error: toastError, success: toastSuccess } = useToast();

    // Expose addPrompts to parent
    useImperativeHandle(ref, () => ({
        addPrompts: (newPrompts: string[]) => {
            const items: PromptItem[] = newPrompts.map(t => ({ text: t, results: [], isProcessing: false }));
            setPrompts(prev => [...prev, ...items]);
            setSelectedIndex(prompts.length); // Select the first of the new batch (approx)
        }
    }));

    // Load history + save path on mount
    useEffect(() => {
        (async () => {
            const history = await getTabHistory('text_to_video');
            if (history && history.prompts.length > 0) {
                const restored: PromptItem[] = history.prompts.map(p => ({
                    text: p.text,
                    isProcessing: false,
                    results: p.results.map(r => ({
                        prompt: r.prompt,
                        status: r.status as VideoResult['status'],
                        videoBlobUrls: r.videoFilePaths?.map(fp => filePathToUrl(fp)),
                        videoFilePaths: r.videoFilePaths,
                        error: r.error,
                    })),
                }));
                setPrompts(restored);
                setSelectedIndex(0);
            }
            const savedPath = await getSavePath();
            if (savedPath) setSaveDir(savedPath);
            setLoaded(true);
        })();
    }, []);

    // Save history when prompts change (debounced)
    const persistHistory = useCallback(async (items: PromptItem[]) => {
        const saved: SavedPrompt[] = items.map(p => ({
            text: p.text,
            results: p.results
                .filter(r => r.status === 'success' || r.status === 'error')
                .map(r => ({
                    prompt: r.prompt,
                    status: r.status as 'success' | 'error',
                    videoFilePaths: r.videoFilePaths,
                    error: r.error,
                })),
        }));
        await saveTabHistory('text_to_video', { prompts: saved });
    }, []);

    useEffect(() => {
        if (!loaded) return;
        const timer = setTimeout(() => persistHistory(prompts), 500);
        return () => clearTimeout(timer);
    }, [prompts, loaded, persistHistory]);

    // --- Actions ---
    const add = () => {
        const t = input.trim();
        if (!t) return;
        setPrompts(p => [...p, { text: t, results: [], isProcessing: false }]);
        setInput('');
        setSelectedIndex(prompts.length);
    };

    const remove = (index: number) => {
        setPrompts(prev => prev.filter((_, i) => i !== index));
        if (selectedIndex === index) setSelectedIndex(null);
        else if (selectedIndex !== null && selectedIndex > index) setSelectedIndex(selectedIndex - 1);
    };

    const clearAll = () => {
        setPrompts([]);
        setSelectedIndex(null);
    };

    // --- Import file ---
    const handleFileImport = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length === 0) return;
            const newItems: PromptItem[] = lines.map(t => ({ text: t, results: [], isProcessing: false }));
            setPrompts(prev => [...prev, ...newItems]);
            setSelectedIndex(prompts.length); // select first imported
        };
        reader.readAsText(file);
    };

    // --- Save location ---
    const handleChooseSaveDir = async () => {
        const selected = await open({ directory: true, title: 'Chọn thư mục lưu video' });
        if (selected) {
            setSaveDir(selected as string);
            await saveSavePath(selected as string);
        }
    };

    // --- Generate ---
    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsBatchProcessing(false);
        setPrompts(prev => prev.map(p => ({ ...p, isProcessing: false })));
    };

    const retrySingle = useCallback(async (index: number) => {
        const apiKey = await getApiKey();
        if (!apiKey) { toastError(translations[language as Language]?.alertNoKey || translations.vi.alertNoKey); return; }

        // Check License
        const license = await getLicenseData();
        if (!license || license.status !== 'active') {
            toastError(t.statusInvalid || 'License Invalid');
            return;
        }

        const controller = new AbortController();

        setPrompts(prev => {
            const n = [...prev];
            n[index] = { ...n[index], isProcessing: true };
            return n;
        });
        setSelectedIndex(index);

        // Use ref to get current state without dependency
        const currentPrompts = promptsRef.current;
        const runIndex = currentPrompts[index].results.length;

        setPrompts(prev => {
            const n = [...prev];
            n[index] = {
                ...n[index],
                results: [...n[index].results, { prompt: n[index].text, status: 'idle' }],
            };
            return n;
        });

        try {
            await generateVideo(
                {
                    prompt: currentPrompts[index].text,
                    model,
                    apiKey,
                    aspectRatio,
                    saveDir: saveDir ?? undefined,
                    signal: controller.signal
                },
                (update) => {
                    setPrompts(prev => {
                        const n = [...prev];
                        if (!n[index]) return n;
                        const results = [...n[index].results];
                        results[runIndex] = { ...results[runIndex], ...update };
                        n[index] = { ...n[index], results };
                        return n;
                    });
                }
            );
        } catch (e) {
            console.log('Retry error:', e);
        } finally {
            setPrompts(prev => {
                const n = [...prev];
                if (n[index]) n[index] = { ...n[index], isProcessing: false };
                return n;
            });
        }
    }, [model, aspectRatio, saveDir, language]);

    const handleProcessAll = async () => {
        if (prompts.length === 0) return;
        const apiKey = await getApiKey();
        if (!apiKey) { toastError(t.alertNoKey); return; }
        if (!saveDir) { toastError(t.alertNoSaveDir); return; }

        // Check License
        const license = await getLicenseData();
        if (!license || license.status !== 'active') {
            toastError(t.statusInvalid || 'License Invalid');
            return;
        }

        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsBatchProcessing(true);

        setPrompts(prev => prev.map(p => ({
            ...p,
            isProcessing: false,
            results: [...p.results, { prompt: p.text, status: 'queued' as const }],
        })));

        try {
            await generateBatch(
                prompts.map(p => ({
                    prompt: p.text,
                    model,
                    apiKey,
                    aspectRatio,
                    saveDir: saveDir ?? undefined,
                    signal: controller.signal
                })),
                (i, update) => {
                    setPrompts(prev => {
                        const n = [...prev];
                        if (!n[i]) return n;

                        if (update.status === 'loading') {
                            n[i] = { ...n[i], isProcessing: true };
                        } else if (update.status === 'success' || update.status === 'error') {
                            n[i] = { ...n[i], isProcessing: false };
                        }

                        const results = [...n[i].results];
                        const lastIdx = results.length - 1;
                        results[lastIdx] = { ...results[lastIdx], ...update };
                        n[i] = { ...n[i], results };
                        return n;
                    });
                }
            );
        } catch (e) {
            console.log('Batch cancelled or error:', e);
        } finally {
            if (!controller.signal.aborted) {
                toastSuccess(t.batchComplete || "Batch generation completed!");
            }
            setPrompts(prev => prev.map(p => ({ ...p, isProcessing: false })));
            setIsBatchProcessing(false);
            abortControllerRef.current = null;
        }
    };

    const handleOpenFolder = () => {
        if (saveDir) {
            openPath(saveDir);
        }
    };

    const handleDownloadAll = () => {
        if (saveDir) {
            openPath(saveDir);
            return;
        }
        const allVideos = prompts.flatMap(p =>
            p.results.filter(r => r.status === 'success' && r.videoBlobUrls).flatMap(r => r.videoBlobUrls || [])
        );
        allVideos.forEach((url, i) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `veo3_batch_${Date.now()}_${i + 1}.mp4`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    };

    const anyProcessing = isBatchProcessing || prompts.some(p => p.isProcessing);
    const totalVideos = prompts.reduce((sum, p) => sum + p.results.filter(r => r.status === 'success').length, 0);

    return (
        <div className="flex gap-4 h-full">
            <div className="w-[340px] shrink-0 flex flex-col gap-3">
                {/* Toolbar: aspect ratio + save dir */}
                <div className="flex gap-2 items-center">
                    <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                        <button onClick={() => setAspectRatio('16:9')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md transition font-medium ${aspectRatio === '16:9' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                            <RectangleHorizontal className="w-3.5 h-3.5" /> 16:9
                        </button>
                        <button onClick={() => setAspectRatio('9:16')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md transition font-medium ${aspectRatio === '9:16' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                            <RectangleVertical className="w-3.5 h-3.5" /> 9:16
                        </button>
                    </div>
                    <button onClick={handleChooseSaveDir} title={saveDir || t.chooseFolder}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 transition truncate flex-1 min-w-0">
                        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{saveDir ? saveDir.split('\\').pop() : t.savePathLabel}</span>
                    </button>
                </div>

                {/* Input + Add + Import */}
                <div className="flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                        placeholder={t.promptPlaceholder}
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-sm" />
                    <button onClick={add} disabled={!input.trim()} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm">
                        <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} title="Import file prompts"
                        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-blue-600 hover:border-blue-400 text-sm transition">
                        <Upload className="w-4 h-4" />
                    </button>
                    <input ref={fileInputRef} type="file" accept=".txt,.text" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) { handleFileImport(e.target.files[0]); e.target.value = ''; } }} />
                </div>

                {/* Queue */}
                <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                        <span className="text-xs text-gray-500 font-medium">{t.queue} ({prompts.length})</span>
                        {prompts.length > 0 && (
                            <button onClick={clearAll} disabled={anyProcessing} className="text-red-400 hover:text-red-500 disabled:opacity-40">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {prompts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-xs text-gray-300 gap-1">
                                <span>{t.noPrompts}</span>
                                <span className="text-[10px]">{t.manualOrImport}</span>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {prompts.map((p, i) => (
                                    <div key={i} onClick={() => setSelectedIndex(i)}
                                        className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition ${selectedIndex === i ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50 border-l-2 border-transparent'
                                            }`}>
                                        <span className="text-[10px] text-gray-300 w-5 shrink-0 font-mono">{i + 1}</span>
                                        <span className={`text-xs flex-1 truncate ${selectedIndex === i ? 'text-blue-700' : 'text-gray-600'}`}>{p.text}</span>
                                        {p.isProcessing && <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />}
                                        {!p.isProcessing && p.results.length > 0 && (
                                            <span className="text-[10px] text-gray-400 shrink-0">{p.results.filter(r => r.status === 'success').length} video</span>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); remove(i); }} disabled={anyProcessing}
                                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 disabled:opacity-0 shrink-0">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    {anyProcessing ? (
                        <button onClick={handleStop}
                            className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm animate-pulse">
                            <Square className="w-4 h-4 fill-current" /> {t.stop}
                        </button>
                    ) : (
                        <button onClick={handleProcessAll} disabled={prompts.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm">
                            <Play className="w-4 h-4" /> {t.generateAll} ({prompts.filter(p => !p.isProcessing).length})
                        </button>
                    )}
                </div>
            </div>

            {/* Right panel - results */}
            <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-500 font-medium">
                        {t.saved} ({totalVideos} video)
                    </span>
                    {totalVideos > 0 && (
                        <div className="flex gap-2">
                            <button onClick={handleOpenFolder}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition">
                                <FolderOpen className="w-3.5 h-3.5" />
                                {t.openFolder}
                            </button>
                            <button onClick={handleDownloadAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium transition">
                                <Download className="w-3.5 h-3.5" />
                                {t.downloadAll} ({totalVideos})
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {prompts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                <Play className="w-8 h-8 text-gray-300" />
                            </div>
                            <span className="text-sm">{t.noPrompts}</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {prompts.map((p, i) => (
                                <div key={i} className="px-4 py-3">
                                    <PromptResultRow
                                        index={i}
                                        item={p}
                                        onRetry={retrySingle}
                                        t={t}
                                    />
                                </div>
                            ))}

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

const PromptResultRow = memo(({ index, item, onRetry, t }: { index: number, item: PromptItem, onRetry: (i: number) => void, t: any }) => {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600 truncate flex-1">
                    <span className="text-gray-400">#{index + 1}</span> {item.text.slice(0, 60)}{item.text.length > 60 ? '...' : ''}
                </span>
                {!item.isProcessing && (
                    <button onClick={() => onRetry(index)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 ml-2 shrink-0">
                        <RotateCcw className="w-3 h-3" /> {t.retry}
                    </button>
                )}
            </div>
            {item.isProcessing && item.results.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-blue-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t.generating}
                </div>
            )}
            {item.results.length > 0 && (
                <VideoResultList onRetry={() => onRetry(index)} results={item.results} />
            )}
            {!item.isProcessing && item.results.length === 0 && (
                <div className="text-xs text-gray-300 italic">{t.noResults}</div>
            )}
        </div>
    );
});
