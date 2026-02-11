import { useState, useRef } from 'react';
import { VideoResult, generateVideo, fileToBase64 } from '../lib/gemini';
import { getApiKey } from '../lib/store';
import { VideoResultList } from './VideoResultList';
import { Upload, Play, Loader2, X } from 'lucide-react';

interface Props { model: string; }

export function StartEndTab({ model }: Props) {
    const [prompt, setPrompt] = useState('');
    const [firstFrame, setFirstFrame] = useState<{ file: File; preview: string } | null>(null);
    const [lastFrame, setLastFrame] = useState<{ file: File; preview: string } | null>(null);
    const [results, setResults] = useState<VideoResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const firstRef = useRef<HTMLInputElement>(null);
    const lastRef = useRef<HTMLInputElement>(null);

    const handleGenerate = async () => {
        if (!prompt.trim() || !firstFrame) return;
        const apiKey = await getApiKey();
        if (!apiKey) { alert('Lưu API Key trong Config trước!'); return; }

        const firstBase64 = await fileToBase64(firstFrame.file);
        const image = { base64: firstBase64, mimeType: firstFrame.file.type };

        let lastFrameData;
        if (lastFrame) {
            const lastBase64 = await fileToBase64(lastFrame.file);
            lastFrameData = { base64: lastBase64, mimeType: lastFrame.file.type };
        }

        setIsProcessing(true);
        const newResult: VideoResult = { prompt, status: 'idle' };
        setResults(prev => [...prev, newResult]);
        const idx = results.length;

        await generateVideo(
            { prompt, model, apiKey, image, lastFrame: lastFrameData },
            (update) => setResults(prev => { const n = [...prev]; n[idx] = { ...n[idx], ...update }; return n; })
        );
        setIsProcessing(false);
    };

    const FramePicker = ({ label, value, onSet, onClear, inputRef }: {
        label: string; value: { file: File; preview: string } | null;
        onSet: (f: File) => void; onClear: () => void; inputRef: React.RefObject<HTMLInputElement | null>;
    }) => (
        <div className="flex-1">
            <label className="text-xs text-gray-500 font-medium block mb-1.5">{label}</label>
            {value ? (
                <div className="relative">
                    <img src={value.preview} className="w-full h-24 object-cover rounded border border-gray-200" />
                    <button onClick={onClear} className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-gray-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ) : (
                <button onClick={() => inputRef.current?.click()}
                    className="w-full h-24 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-500 hover:border-gray-300 transition">
                    <Upload className="w-4 h-4" />
                    <span className="text-[10px]">Chọn ảnh</span>
                </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) onSet(e.target.files[0]); }} />
        </div>
    );

    return (
        <div className="flex gap-4 h-full">
            <div className="w-[340px] shrink-0 flex flex-col gap-3">
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Mô tả chuyển động giữa 2 frame..."
                    rows={3} className="bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-sm resize-none" />

                <div className="border border-gray-200 rounded-lg bg-white p-3">
                    <div className="flex gap-3">
                        <FramePicker label="Frame đầu *" value={firstFrame}
                            onSet={f => setFirstFrame({ file: f, preview: URL.createObjectURL(f) })}
                            onClear={() => { setFirstFrame(null); if (firstRef.current) firstRef.current.value = ''; }}
                            inputRef={firstRef} />
                        <FramePicker label="Frame cuối" value={lastFrame}
                            onSet={f => setLastFrame({ file: f, preview: URL.createObjectURL(f) })}
                            onClear={() => { setLastFrame(null); if (lastRef.current) lastRef.current.value = ''; }}
                            inputRef={lastRef} />
                    </div>
                </div>

                <button onClick={handleGenerate} disabled={isProcessing || !prompt.trim() || !firstFrame}
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
