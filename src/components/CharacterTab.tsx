import { useState, useRef } from 'react';
import { VideoResult, generateVideo, fileToBase64 } from '../lib/gemini';
import { getApiKey } from '../lib/store';
import { VideoResultList } from './VideoResultList';
import { Upload, Play, Loader2, X, Plus } from 'lucide-react';

interface Props { model: string; }

interface RefImage { file: File; preview: string; }

export function CharacterTab({ model }: Props) {
    const [prompt, setPrompt] = useState('');
    const [refImages, setRefImages] = useState<RefImage[]>([]);
    const [results, setResults] = useState<VideoResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const addImage = (file: File) => {
        if (refImages.length >= 3) return;
        setRefImages(prev => [...prev, { file, preview: URL.createObjectURL(file) }]);
    };

    const removeImage = (index: number) => {
        setRefImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerate = async () => {
        if (!prompt.trim() || refImages.length === 0) return;
        const apiKey = await getApiKey();
        if (!apiKey) { alert('Lưu API Key trong Config trước!'); return; }

        const referenceImages = await Promise.all(
            refImages.map(async (img) => ({
                base64: await fileToBase64(img.file),
                mimeType: img.file.type,
            }))
        );

        setIsProcessing(true);
        const newResult: VideoResult = { prompt, status: 'idle' };
        setResults(prev => [...prev, newResult]);
        const idx = results.length;

        await generateVideo(
            { prompt, model, apiKey, referenceImages },
            (update) => setResults(prev => { const n = [...prev]; n[idx] = { ...n[idx], ...update }; return n; })
        );
        setIsProcessing(false);
    };

    return (
        <div className="flex gap-4 h-full">
            <div className="w-[340px] shrink-0 flex flex-col gap-3">
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    placeholder="Mô tả video với nhân vật tham chiếu..."
                    rows={3} className="bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-sm resize-none" />

                <div className="border border-gray-200 rounded-lg bg-white p-3">
                    <label className="text-xs text-gray-500 font-medium block mb-2">Ảnh tham chiếu (tối đa 3)</label>
                    <div className="flex gap-2 flex-wrap">
                        {refImages.map((img, i) => (
                            <div key={i} className="relative w-20 h-20">
                                <img src={img.preview} className="w-full h-full object-cover rounded border border-gray-200" />
                                <button onClick={() => removeImage(i)}
                                    className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow text-gray-400 hover:text-red-500">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {refImages.length < 3 && (
                            <button onClick={() => fileRef.current?.click()}
                                className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-gray-500 hover:border-gray-300 transition">
                                <Plus className="w-4 h-4" />
                                <span className="text-[10px]">Thêm</span>
                            </button>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) { addImage(e.target.files[0]); e.target.value = ''; } }} />
                </div>

                <button onClick={handleGenerate} disabled={isProcessing || !prompt.trim() || refImages.length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm">
                    {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Play className="w-4 h-4" /> Generate</>}
                </button>
            </div>
            <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-500 font-medium">Results</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <VideoResultList results={results} />
                </div>
            </div>
        </div>
    );
}
