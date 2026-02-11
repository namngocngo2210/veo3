import { useState, useRef, useEffect } from 'react';
import { VideoResult, generateVideo, fileToBase64 } from '../lib/gemini';
import { getApiKey, filePathToUrl, getSavePath, saveSavePath } from '../lib/store';
import { VideoResultList } from './VideoResultList';
import { Upload, Play, Loader2, X, Trash2, RotateCcw, FolderOpen, Download, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import pLimit from 'p-limit';
import { translations, Language } from '../lib/i18n';

interface Props { model: string; language: string; }

interface ImageItem {
    id: string;
    file: File;
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const t = translations[language as Language] || translations.vi;

    // Load save path
    useEffect(() => {
        (async () => {
            const path = await getSavePath();
            if (path) setSaveDir(path);
        })();
    }, []);

    // Cleanup previews
    useEffect(() => {
        return () => {
            items.forEach(item => URL.revokeObjectURL(item.preview));
        };
    }, []);

    // --- Actions ---
    const handleFilesSelect = (files: File[]) => {
        if (!files.length) return;
        const newItems: ImageItem[] = Array.from(files).map(file => ({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file), // create sync preview
            prompt: '',
            status: 'idle',
        }));
        setItems(prev => [...prev, ...newItems]);
        if (selectedIndex === null) setSelectedIndex(items.length); // select first of new batch
    };

    const removeItem = (index: number) => {
        const item = items[index];
        URL.revokeObjectURL(item.preview);
        setItems(prev => prev.filter((_, i) => i !== index));
        if (selectedIndex === index) setSelectedIndex(null);
        else if (selectedIndex !== null && selectedIndex > index) setSelectedIndex(selectedIndex - 1);
    };

    const clearAll = () => {
        items.forEach(item => URL.revokeObjectURL(item.preview));
        setItems([]);
        setSelectedIndex(null);
    };

    const updatePrompt = (index: number, text: string) => {
        setItems(prev => {
            const n = [...prev];
            n[index] = { ...n[index], prompt: text };
            return n;
        });
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
        setIsProcessing(false);
    };

    const processItem = async (index: number, apiKey: string, signal: AbortSignal) => {
        setItems(prev => {
            const n = [...prev];
            if (n[index]) n[index] = { ...n[index], status: 'loading' };
            return n;
        });

        const item = items[index];

        // 1. Read base64 (lazy)
        let base64 = "";
        try {
            base64 = await fileToBase64(item.file);
        } catch (e) {
            console.error("Failed to read image", e);
            setItems(prev => {
                const n = [...prev];
                n[index] = { ...n[index], status: 'error', error: "Failed to read image" };
                return n;
            });
            return;
        }
        if (signal.aborted) return;

        // 2. Generate
        await generateVideo(
            {
                prompt: item.prompt,
                model,
                apiKey,
                image: { base64, mimeType: item.file.type },
                aspectRatio,
                saveDir: saveDir ?? undefined,
                signal
            },
            (update) => {
                setItems(prev => {
                    const n = [...prev];
                    if (!n[index]) return n;
                    // Merge update into result
                    const currentResult = n[index].result || { prompt: n[index].prompt, status: 'loading' };
                    // If update has status, update item status too
                    if (update.status) n[index].status = update.status;

                    // Correctly map file paths to urls if present
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
            .filter(({ item }) => item.status !== 'loading')
            .map(({ i }) => i);

        if (pendingIndices.length === 0) return;

        const apiKey = await getApiKey();
        if (!apiKey) { alert(t.alertNoKey); return; }

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
            setIsProcessing(false);
            abortControllerRef.current = null;
        }
    };

    const retrySingle = async (index: number) => {
        const apiKey = await getApiKey();
        if (!apiKey) { alert(t.alertNoKey); return; }
        const controller = new AbortController();

        setItems(prev => {
            const n = [...prev];
            n[index] = { ...n[index], status: 'loading', result: undefined, error: undefined };
            return n;
        });

        try {
            await processItem(index, apiKey, controller.signal);
        } catch (e) {
            console.log('Retry error:', e);
        }
    };

    // --- Download All ---
    const handleDownloadAll = () => {
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
                <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition bg-gray-50/50">
                    <Upload className="w-4 h-4" />
                    <span className="text-xs font-medium">{t.addImages}</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) handleFilesSelect(Array.from(e.target.files)); e.target.value = ''; }} />

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
                                    <div key={item.id} onClick={() => setSelectedIndex(i)}
                                        className={`group flex items-start gap-3 p-3 cursor-pointer transition ${selectedIndex === i ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50 border-l-2 border-transparent'}`}>

                                        {/* Thumbnail */}
                                        <div className="w-16 h-16 shrink-0 rounded overflow-hidden border border-gray-200 bg-gray-100 relative">
                                            <img src={item.preview} className="w-full h-full object-cover" />
                                            {item.status === 'loading' && (
                                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                                    <Loader2 className="w-5 h-5 text-white animate-spin" />
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
                                                <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{item.file.name}</span>
                                                <button onClick={(e) => { e.stopPropagation(); removeItem(i); }} disabled={isProcessing}
                                                    className="text-gray-300 hover:text-red-500 disabled:opacity-0 opacity-0 group-hover:opacity-100 transition">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <textarea
                                                value={item.prompt}
                                                onChange={e => updatePrompt(i, e.target.value)}
                                                onClick={e => e.stopPropagation()}
                                                placeholder={t.refImagePlaceholder}
                                                rows={2}
                                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-400 resize-none transaction"
                                            />
                                        </div>
                                    </div>
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
                            <Play className="w-4 h-4" /> {t.generateAll} ({items.filter(i => i.status !== 'loading').length})
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
                        <button onClick={handleDownloadAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium transition">
                            <Download className="w-3.5 h-3.5" />
                            {t.downloadAll} ({totalVideos})
                        </button>
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
                                            {item.file.name}
                                        </span>
                                        {item.status !== 'loading' && (
                                            <button onClick={() => retrySingle(i)}
                                                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 shrink-0">
                                                <RotateCcw className="w-3 h-3" /> {t.retry}
                                            </button>
                                        )}
                                    </div>
                                    {item.status === 'idle' && (
                                        <div className="text-xs text-gray-300 italic">{t.noResults}</div>
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
