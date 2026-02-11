import { useState, useRef, useEffect } from 'react';
import { getApiKey, getSavePath, saveSavePath, saveVideoFileToDir, filePathToUrl } from '../lib/store';
import { fileToBase64 } from '../lib/gemini';
import { Upload, Play, Loader2, X, Image as ImageIcon, Download, FolderOpen, Trash2, Square, RectangleHorizontal, RectangleVertical, Plus, RefreshCw } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { GoogleGenAI } from '@google/genai';
import pLimit from 'p-limit';
import { translations, Language } from '../lib/i18n';

const limit = pLimit(3);

interface Props { model: string; language: string; }

type ImagenModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';

interface PromptItem {
    id: string;
    text: string;
    status: 'idle' | 'loading' | 'success' | 'error';
    resultImages: string[];
    error?: string;
}

interface RefImage {
    id: string;
    file: File;
    preview: string;
}

export function BananaTab({ model: _veoModel, language }: Props) {
    const [items, setItems] = useState<PromptItem[]>([]);
    const [input, setInput] = useState('');
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [selectedModel, setSelectedModel] = useState<ImagenModel>('gemini-2.5-flash-image');
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16'>('1:1');
    const [isProcessing, setIsProcessing] = useState(false);
    const [saveDir, setSaveDir] = useState<string | null>(null);
    const [refImages, setRefImages] = useState<RefImage[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const refImageInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const t = translations[language as Language] || translations.vi;

    useEffect(() => {
        getSavePath().then(p => { if (p) setSaveDir(p); });
    }, []);

    useEffect(() => {
        return () => { refImages.forEach(r => URL.revokeObjectURL(r.preview)); };
    }, []);

    // --- Prompt management ---
    const add = () => {
        if (!input.trim()) return;
        const newItem: PromptItem = {
            id: crypto.randomUUID(),
            text: input.trim(),
            status: 'idle',
            resultImages: [],
        };
        setItems(prev => [...prev, newItem]);
        setSelectedIndex(items.length);
        setInput('');
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
        if (selectedIndex === index) setSelectedIndex(null);
        else if (selectedIndex !== null && selectedIndex > index) setSelectedIndex(selectedIndex - 1);
    };



    const clearAll = () => {
        setItems([]);
        setSelectedIndex(null);
    };

    // --- Reference images (shared) ---
    const addRefImages = (files: File[]) => {
        const newRefs: RefImage[] = files.map(file => ({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file),
        }));
        setRefImages(prev => [...prev, ...newRefs]);
    };

    const removeRefImage = (id: string) => {
        setRefImages(prev => {
            const item = prev.find(r => r.id === id);
            if (item) URL.revokeObjectURL(item.preview);
            return prev.filter(r => r.id !== id);
        });
    };

    const clearRefImages = () => {
        refImages.forEach(r => URL.revokeObjectURL(r.preview));
        setRefImages([]);
    };

    // --- File import (txt) ---
    const handleFileImport = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const newItems: PromptItem[] = lines.map(t => ({
                id: crypto.randomUUID(), text: t, status: 'idle', resultImages: [],
            }));
            setItems(prev => [...prev, ...newItems]);
            if (selectedIndex === null && newItems.length > 0) setSelectedIndex(items.length);
        };
        reader.readAsText(file);
    };

    // --- Save dir ---
    const handleChooseSaveDir = async () => {
        const selected = await open({ directory: true, title: 'Chọn thư mục lưu ảnh' });
        if (selected) { setSaveDir(selected as string); await saveSavePath(selected as string); }
    };

    // --- Generate ---
    const handleStop = () => {
        if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
        setIsProcessing(false);
    };

    const generateSingle = async (index: number, apiKey: string, signal: AbortSignal) => {
        const item = items[index];
        setItems(prev => { const n = [...prev]; n[index] = { ...n[index], status: 'loading', resultImages: [], error: undefined }; return n; });

        try {
            const ai = new GoogleGenAI({ apiKey });

            // Build content: text + optional reference images
            const parts: any[] = [{ text: item.text }];
            if (refImages.length > 0) {
                for (const ref of refImages) {
                    const base64 = await fileToBase64(ref.file);
                    parts.push({
                        inlineData: {
                            mimeType: ref.file.type || 'image/png',
                            data: base64
                        }
                    });
                }
            }

            if (signal.aborted) throw new Error("Cancelled");

            const response = await ai.models.generateContent({
                model: selectedModel,
                contents: parts.length === 1 ? item.text : [{ role: 'user', parts }],
            });

            if (signal.aborted) throw new Error("Cancelled");

            const images: string[] = [];
            const responseParts = response.candidates?.[0]?.content?.parts || [];

            for (const part of responseParts) {
                if (part.inlineData) {
                    const b64 = part.inlineData.data!;
                    const mimeType = part.inlineData.mimeType || 'image/png';

                    if (saveDir) {
                        const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mimeType });
                        const ext = mimeType.includes('png') ? 'png' : 'jpg';
                        const filename = `imagen_${Date.now()}_1.${ext}`;
                        const filePath = await saveVideoFileToDir(blob, filename, saveDir);
                        images.push(filePathToUrl(filePath));
                    } else {
                        images.push(`data:${mimeType};base64,${b64}`);
                    }
                }
            }

            if (images.length === 0 && !signal.aborted) {
                throw new Error("Không nhận được ảnh từ API. Kiểm tra prompt hoặc settings.");
            }

            setItems(prev => {
                const n = [...prev];
                n[index] = { ...n[index], status: 'success', resultImages: images };
                return n;
            });
        } catch (e: any) {
            if (e.name === 'AbortError' || e.message === 'Cancelled') return;
            setItems(prev => {
                const n = [...prev];
                n[index] = { ...n[index], status: 'error', error: e.message };
                return n;
            });
        }
    };

    const retrySingle = async (index: number) => {
        const apiKey = await getApiKey();
        if (!apiKey) { alert(t.alertNoKey); return; }
        const controller = new AbortController();
        await generateSingle(index, apiKey, controller.signal);
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

        const tasks = pendingIndices.map(index =>
            limit(async () => {
                if (controller.signal.aborted) return;
                await generateSingle(index, apiKey, controller.signal);
            })
        );

        try { await Promise.all(tasks); } catch (e) { console.log("Batch error", e); }
        finally { setIsProcessing(false); abortControllerRef.current = null; }
    };

    const handleDownloadAll = () => {
        items.forEach(item => {
            item.resultImages.forEach((src, i) => {
                const a = document.createElement('a');
                a.href = src;
                a.download = `imagen_${Date.now()}_${i + 1}.png`;
                a.click();
            });
        });
    };

    const totalImages = items.reduce((sum, item) => sum + item.resultImages.length, 0);

    return (
        <div className="flex gap-4 h-full">
            {/* Left Panel */}
            <div className="w-[340px] shrink-0 flex flex-col gap-3">
                {/* Toolbar */}
                <div className="flex gap-2 items-center">
                    <select value={selectedModel} onChange={e => setSelectedModel(e.target.value as ImagenModel)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-blue-400">
                        <option value="gemini-2.5-flash-image">Nano Banana</option>
                        <option value="gemini-3-pro-image-preview">Nano Banana Pro</option>
                    </select>

                    <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                        {(['1:1', '16:9', '9:16'] as const).map(ar => (
                            <button key={ar} onClick={() => setAspectRatio(ar)}
                                className={`flex items-center gap-1 px-2 py-1.5 rounded-md transition font-medium ${aspectRatio === ar ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                {ar === '1:1' && <ImageIcon className="w-3 h-3" />}
                                {ar === '16:9' && <RectangleHorizontal className="w-3 h-3" />}
                                {ar === '9:16' && <RectangleVertical className="w-3 h-3" />}
                                {ar}
                            </button>
                        ))}
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

                {/* Queue (compact) */}
                <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ maxHeight: '180px' }}>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                        <span className="text-xs text-gray-500 font-medium">{t.queue} ({items.length})</span>
                        {items.length > 0 && (
                            <button onClick={clearAll} disabled={isProcessing} className="text-red-400 hover:text-red-500 disabled:opacity-40">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="flex items-center justify-center py-4 text-xs text-gray-300">
                                {t.addPromptToStart}
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {items.map((item, i) => (
                                    <div key={item.id} onClick={() => setSelectedIndex(i)}
                                        className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition ${selectedIndex === i ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50 border-l-2 border-transparent'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.status === 'idle' ? 'bg-gray-300' : item.status === 'loading' ? 'bg-blue-400 animate-pulse' : item.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <span className="text-xs text-gray-700 truncate flex-1">{item.text}</span>
                                        {item.resultImages.length > 0 && (
                                            <span className="text-[10px] text-gray-400 shrink-0">{item.resultImages.length} ảnh</span>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); removeItem(i); }} disabled={isProcessing}
                                            className="text-gray-300 hover:text-red-500 disabled:opacity-0 opacity-0 group-hover:opacity-100 transition shrink-0">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Reference Images (shared) */}
                <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white flex-1 min-h-0">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                        <span className="text-xs text-gray-500 font-medium">{t.refImagesTitle} ({refImages.length})</span>
                        <div className="flex gap-1">
                            {refImages.length > 0 && (
                                <button onClick={clearRefImages} disabled={isProcessing} className="text-red-400 hover:text-red-500 disabled:opacity-40">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {refImages.length === 0 ? (
                            <button onClick={() => refImageInputRef.current?.click()}
                                className="w-full h-full min-h-[60px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-600 transition bg-gray-50/50 text-xs">
                                <Upload className="w-4 h-4" /> {t.uploadRefImage}
                            </button>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="grid grid-cols-4 gap-1.5">
                                    {refImages.map(ref => (
                                        <div key={ref.id} className="relative group aspect-square">
                                            <img src={ref.preview} className="w-full h-full object-cover rounded border border-gray-200" />
                                            <button onClick={() => removeRefImage(ref.id)}
                                                className="absolute -top-1 -right-1 bg-white shadow p-0.5 rounded-full text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={() => refImageInputRef.current?.click()}
                                        className="aspect-square border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-600 transition">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <input ref={refImageInputRef} type="file" accept="image/*" multiple className="hidden"
                        onChange={e => { if (e.target.files) { addRefImages(Array.from(e.target.files)); e.target.value = ''; } }} />
                </div>

                {/* Actions */}
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

            {/* Right Panel: All Results Gallery */}
            <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-500 font-medium">
                        {t.saved} ({totalImages} ảnh)
                    </span>
                    {totalImages > 0 && (
                        <button onClick={handleDownloadAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium transition">
                            <Download className="w-3.5 h-3.5" />
                            {t.downloadAll} ({totalImages})
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                <ImageIcon className="w-8 h-8 text-gray-300" />
                            </div>
                            <span className="text-sm">{t.addPromptToStart}</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {items.map((item, idx) => (
                                <div key={item.id} className="flex flex-col gap-1.5">
                                    <div className="relative group aspect-square">
                                        {item.status === 'loading' && (
                                            <div className="w-full h-full bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center animate-pulse">
                                                <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
                                            </div>
                                        )}

                                        {item.status === 'error' && (
                                            <div className="w-full h-full bg-red-50 border border-red-100 rounded-lg flex items-center justify-center p-2 relative group/err">
                                                <span className="text-[10px] text-red-500 leading-tight text-center">{item.error}</span>
                                                <button onClick={() => retrySingle(idx)}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover/err:opacity-100 transition disabled:opacity-0">
                                                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow text-xs font-medium text-gray-700 hover:text-blue-600">
                                                        <RefreshCw className="w-3.5 h-3.5" /> {t.retry}
                                                    </div>
                                                </button>
                                            </div>
                                        )}

                                        {item.status === 'success' && item.resultImages.length === 0 && (
                                            <div className="w-full h-full bg-orange-50 border border-orange-100 rounded-lg flex items-center justify-center p-2 relative group/empty">
                                                <span className="text-[10px] text-orange-500 leading-tight text-center">{t.noImages}</span>
                                                <button onClick={() => retrySingle(idx)}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover/empty:opacity-100 transition disabled:opacity-0">
                                                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow text-xs font-medium text-gray-700 hover:text-blue-600">
                                                        <RefreshCw className="w-3.5 h-3.5" /> {t.retry}
                                                    </div>
                                                </button>
                                            </div>
                                        )}

                                        {item.status === 'success' && item.resultImages.length > 0 && (
                                            <>
                                                <img src={item.resultImages[0]} className="w-full h-full object-cover rounded-lg border border-gray-200 shadow-sm transition-transform duration-300 group-hover:scale-[1.02]" />
                                                <a href={item.resultImages[0]} download={`imagen_${idx + 1}.png`}
                                                    className="absolute bottom-1 right-1 bg-white/90 backdrop-blur p-1 rounded-md shadow opacity-0 group-hover:opacity-100 transition text-gray-600 hover:text-blue-600">
                                                    <Download className="w-3.5 h-3.5" />
                                                </a>
                                            </>
                                        )}

                                        {item.status === 'idle' && (
                                            <div className="w-full h-full bg-gray-50 rounded-lg border border-dashed border-gray-200" />
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-500 truncate text-center px-1" title={item.text}>
                                        <span className="font-medium">#{idx + 1}</span> {item.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
