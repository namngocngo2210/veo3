import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { VideoResult, generateVideo, imagePathToBase64 } from '../lib/gemini';
import { getApiKey, filePathToUrl, getSavePath, saveSavePath, saveTabHistory, getTabHistory, SavedPrompt, openPath, getLicenseData } from '../lib/store';
import { VideoResultList } from './VideoResultList';
import { Upload, Play, Loader2, X, Trash2, RotateCcw, FolderOpen, Download, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import pLimit from 'p-limit';
import { translations, Language } from '../lib/i18n';
import { useToast } from './Toast';

interface Props { model: string; language: string; }

interface ImageItem {
    id: string;
    filePath: string;
    preview: string;
    prompt: string;
    status: VideoResult['status'];
    result?: VideoResult;
    error?: string;
}

const limit = pLimit(2);

export function ImageToVideoTab({ model, language }: Props) {
    const [items, setItems] = useState<ImageItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [saveDir, setSaveDir] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const itemsRef = useRef(items);
    itemsRef.current = items;

    const t = translations[language as Language] || translations.vi;
    const { error: toastError, success: toastSuccess } = useToast();
    const [loaded, setLoaded] = useState(false);

    // Load history + save path
    useEffect(() => {
        (async () => {
            const path = await getSavePath();
            if (path) setSaveDir(path);

            const history = await getTabHistory('image_to_video');
            if (history && history.prompts.length > 0) {
                const restored: ImageItem[] = history.prompts.map(p => ({
                    id: crypto.randomUUID(),
                    filePath: p.imageFilePath || '',
                    preview: p.imageFilePath ? filePathToUrl(p.imageFilePath) : '',
                    prompt: p.text,
                    status: (p.results[0]?.status as VideoResult['status']) || 'idle',
                    result: p.results[0] ? {
                        prompt: p.results[0].prompt,
                        status: p.results[0].status as VideoResult['status'],
                        videoFilePaths: p.results[0].videoFilePaths,
                        videoBlobUrls: p.results[0].videoFilePaths?.map(fp => filePathToUrl(fp)),
                        error: p.results[0].error
                    } : undefined,
                    error: p.results[0]?.error
                })).filter(i => i.filePath !== ''); // Filter out invalid items

                setItems(restored);
                if (restored.length > 0) setSelectedIndex(0);
            }
            setLoaded(true);
        })();
    }, []);

    // Persist history
    const persistHistory = useCallback(async (currentItems: ImageItem[]) => {
        const saved: SavedPrompt[] = currentItems.map(p => ({
            text: p.prompt,
            imageFilePath: p.filePath,
            results: p.result ? [{
                prompt: p.result.prompt,
                status: p.result.status,
                videoFilePaths: p.result.videoFilePaths,
                error: p.result.error
            }] : []
        }));
        await saveTabHistory('image_to_video', { prompts: saved });
    }, []);

    useEffect(() => {
        if (!loaded) return;
        const timer = setTimeout(() => persistHistory(items), 1000);
        return () => clearTimeout(timer);
    }, [items, loaded, persistHistory]);

    // Cleanup previews? No need for filePathToUrl (managed by Tauri).
    // But if we createObjectURL manually? No, we use filePathToUrl exclusively now.

    // --- Actions ---
    const handleFilesSelect = async () => {
        const selected = await open({
            multiple: true,
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        });

        if (!selected) return;

        // selected is string[] or string inside string[]? 
        // Type definition says string | string[] | null.
        const paths = Array.isArray(selected) ? selected : [selected];

        const newItems: ImageItem[] = paths.map(path => ({
            id: crypto.randomUUID(),
            filePath: path,
            preview: filePathToUrl(path),
            prompt: '',
            status: 'idle',
        }));

        setItems(prev => [...prev, ...newItems]);
        if (selectedIndex === null && newItems.length > 0) setSelectedIndex(items.length);
    };

    const removeItem = useCallback((index: number) => {
        setItems(prev => {
            const n = prev.filter((_, i) => i !== index);
            return n;
        });
        setSelectedIndex(prev => {
            if (prev === index) return null;
            if (prev !== null && prev > index) return prev - 1;
            return prev;
        });
    }, []);

    const clearAll = () => {
        setItems([]);
        setSelectedIndex(null);
    };

    const updatePrompt = useCallback((index: number, text: string) => {
        setItems(prev => {
            const n = [...prev];
            n[index] = { ...n[index], prompt: text };
            return n;
        });
    }, []);

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
        setIsProcessing(false);
        setItems(prev => prev.map(p => p.status === 'loading' || p.status === 'queued' ? { ...p, status: 'idle' } : p));
    };

    const processItem = async (index: number, apiKey: string, signal: AbortSignal) => {
        // We use itemsRef to access latest state if needed, but here we pass index
        // However, we rely on state updates.

        // 1. Read base64
        let base64 = "";
        const currentItem = itemsRef.current[index]; // Access latest via ref to get path
        if (!currentItem) return;

        try {
            base64 = await imagePathToBase64(currentItem.filePath);
        } catch (e) {
            console.error("Failed to read image", e);
            setItems(prev => {
                const n = [...prev];
                if (n[index]) n[index] = { ...n[index], status: 'error', error: "Failed to read image" };
                return n;
            });
            return;
        }

        if (signal.aborted) return;

        setItems(prev => {
            const n = [...prev];
            if (n[index]) n[index] = { ...n[index], status: 'loading' };
            return n;
        });

        // 2. Generate
        await generateVideo(
            {
                prompt: currentItem.prompt,
                model,
                apiKey,
                image: { base64, mimeType: 'image/png' }, // Assume png/jpeg, MIME detection in helper? Helper returns base64. 
                // We should probably detect mime type from ext.
                // gemini.ts params.image needs mimeType.
                aspectRatio,
                saveDir: saveDir ?? undefined,
                signal
            },
            (update) => {
                setItems(prev => {
                    const n = [...prev];
                    if (!n[index]) return n;

                    const currentResult = n[index].result || { prompt: n[index].prompt, status: 'loading' };
                    if (update.status) n[index].status = update.status;
                    if (update.videoFilePaths) {
                        update.videoBlobUrls = update.videoFilePaths.map(fp => filePathToUrl(fp));
                    }
                    n[index].result = { ...currentResult, ...update };
                    return n;
                });
            }
        );
    };

    const handleGenerateAll = async () => {
        const pendingIndices = items.map((item, i) => ({ item, i }))
            .filter(({ item }) => item.status !== 'loading' && item.status !== 'success') // Only idle or error? Or just everything not processing?
            // "Generate All" usually implies processing pending items.
            // Let's filter for 'idle' or 'error'.
            .filter(({ item }) => item.status === 'idle' || item.status === 'error')
            .map(({ i }) => i);

        if (pendingIndices.length === 0) return;

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

        setIsProcessing(true);
        setItems(prev => {
            const n = [...prev];
            pendingIndices.forEach(idx => { n[idx].status = 'queued'; });
            return n;
        });

        const tasks = pendingIndices.map(index =>
            limit(async () => {
                if (controller.signal.aborted) return;
                await processItem(index, apiKey, controller.signal);
            })
        );

        try {
            await Promise.all(tasks);
        } catch (e) {
            console.log("Batch error or cancelled", e);
        } finally {
            if (!controller.signal.aborted) {
                toastSuccess(t.batchComplete || "Batch generation completed!");
            }
            setIsProcessing(false);
            abortControllerRef.current = null;
        }
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

        setItems(prev => {
            const n = [...prev];
            n[index] = { ...n[index], status: 'queued', result: undefined, error: undefined };
            return n;
        });

        try {
            await processItem(index, apiKey, controller.signal);
        } catch (e) {
            console.log('Retry error:', e);
        }
    }, [language, model, aspectRatio, saveDir]);

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
        const allVideos = items.flatMap(item =>
            item.result?.videoFilePaths?.map(fp => filePathToUrl(fp)) || []
        );
        allVideos.forEach((url, i) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `veo3_img2vid_${Date.now()}_${i + 1}.mp4`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    };

    const totalVideos = items.reduce((sum, item) => sum + (item.result?.videoFilePaths?.length || 0), 0);

    return (
        <div className="flex gap-4 h-full">
            <div className="w-[360px] shrink-0 flex flex-col gap-3">
                {/* Toolbar */}
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

                {/* Add Images */}
                <button onClick={handleFilesSelect}
                    className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition bg-gray-50/50">
                    <Upload className="w-4 h-4" />
                    <span className="text-xs font-medium">{t.addImages}</span>
                </button>

                {/* Queue List */}
                <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                        <span className="text-xs text-gray-500 font-medium">{t.queue} ({items.length})</span>
                        {items.length > 0 && (
                            <button onClick={clearAll} disabled={isProcessing} className="text-red-400 hover:text-red-500 disabled:opacity-40">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-xs text-gray-300 gap-1">
                                <span>{t.selectImages}</span>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {items.map((item, i) => (
                                    <ImageItemRow
                                        key={item.id}
                                        index={i}
                                        item={item}
                                        isSelected={selectedIndex === i}
                                        onSelect={() => setSelectedIndex(i)}
                                        onRemove={removeItem}
                                        onUpdatePrompt={updatePrompt}
                                        t={t}
                                        disabled={isProcessing}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Actions */}
                <div className="flex gap-2">
                    {isProcessing ? (
                        <button onClick={handleStop}
                            className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm animate-pulse">
                            <Square className="w-4 h-4 fill-current" /> {t.stop}
                        </button>
                    ) : (
                        <button onClick={handleGenerateAll} disabled={items.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm">
                            <Play className="w-4 h-4" /> {t.generateAll} ({items.filter(i => i.status !== 'loading' && i.status !== 'success').length})
                        </button>
                    )}
                </div>
            </div>

            {/* Right Panel: All Results */}
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
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                <Upload className="w-8 h-8 text-gray-300" />
                            </div>
                            <span className="text-sm">{t.selectImages}</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {items.map((item, i) => (
                                <div key={item.id} className="px-4 py-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 shrink-0 rounded overflow-hidden border border-gray-200 bg-gray-100">
                                            <img src={item.preview} className="w-full h-full object-cover" />
                                        </div>
                                        <span className="text-xs font-medium text-gray-600 truncate flex-1">
                                            {item.filePath.split(/[/\\]/).pop()}
                                        </span>
                                        {item.status !== 'loading' && item.status !== 'queued' && (
                                            <button onClick={() => retrySingle(i)}
                                                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 shrink-0">
                                                <RotateCcw className="w-3 h-3" /> {t.retry}
                                            </button>
                                        )}
                                    </div>
                                    {item.status === 'idle' && (
                                        <div className="text-xs text-gray-300 italic">{t.noResults}</div>
                                    )}
                                    {item.status === 'queued' && (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-transparent" />
                                            Trong hàng đợi...
                                        </div>
                                    )}
                                    {item.status === 'loading' && (
                                        <div className="flex items-center gap-2 text-xs text-blue-500">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            {t.generating}
                                        </div>
                                    )}
                                    {item.status === 'error' && (
                                        <div className="text-xs text-red-500">
                                            Error: {item.error}
                                        </div>
                                    )}
                                    {item.status === 'success' && item.result && (
                                        <VideoResultList results={[item.result]} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const ImageItemRow = memo(({ index, item, isSelected, onSelect, onRemove, onUpdatePrompt, t, disabled }: {
    index: number,
    item: ImageItem,
    isSelected: boolean,
    onSelect: () => void,
    onRemove: (i: number) => void,
    onUpdatePrompt: (i: number, val: string) => void,
    t: any,
    disabled: boolean
}) => {
    return (
        <div onClick={onSelect}
            className={`group flex items-start gap-3 p-3 cursor-pointer transition ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50 border-l-2 border-transparent'}`}>

            {/* Thumbnail */}
            <div className="w-16 h-16 shrink-0 rounded overflow-hidden border border-gray-200 bg-gray-100 relative">
                <img src={item.preview} className="w-full h-full object-cover" />
                {item.status === 'loading' && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                )}
                {item.status === 'queued' && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="text-[10px] text-white">Queue</div>
                    </div>
                )}
                {item.status === 'success' && (
                    <div className="absolute bottom-0 right-0 bg-green-500 text-white text-[8px] px-1 py-0.5 rounded-tl">DONE</div>
                )}
                {item.status === 'error' && (
                    <div className="absolute bottom-0 right-0 bg-red-500 text-white text-[8px] px-1 py-0.5 rounded-tl">ERR</div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex justify-between items-start">
                    <span className="text-[10px] text-gray-400 truncate max-w-[100px]" title={item.filePath}>
                        {item.filePath.split(/[/\\]/).pop()}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); onRemove(index); }} disabled={disabled}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-0 opacity-0 group-hover:opacity-100 transition">
                        <X className="w-3 h-3" />
                    </button>
                </div>
                <textarea
                    value={item.prompt}
                    onChange={e => onUpdatePrompt(index, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder={t.refImagePlaceholder}
                    rows={2}
                    className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-400 resize-none transaction"
                />
            </div>
        </div>
    );
});
