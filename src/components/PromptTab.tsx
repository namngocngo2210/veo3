import { useState } from 'react';
import { VideoResult, generateBatch } from '../lib/gemini';
import { getApiKey } from '../lib/store';
import { Plus, Trash2, Play, X, Loader2, CheckCircle2, AlertCircle, Clock, Download } from 'lucide-react';

interface PromptTabProps {
    model: string;
}

export function PromptTab({ model }: PromptTabProps) {
    const [prompts, setPrompts] = useState<string[]>([]);
    const [currentInput, setCurrentInput] = useState('');
    const [results, setResults] = useState<VideoResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const addPrompt = () => {
        const text = currentInput.trim();
        if (!text) return;
        setPrompts(prev => [...prev, text]);
        setCurrentInput('');
    };

    const removePrompt = (index: number) => {
        setPrompts(prev => prev.filter((_, i) => i !== index));
    };

    const clearAll = () => {
        setPrompts([]);
        setResults([]);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addPrompt();
        }
    };

    const handleProcess = async () => {
        if (prompts.length === 0) return;
        const apiKey = await getApiKey();
        if (!apiKey) {
            alert('Vui lòng lưu API Key trong tab Config trước!');
            return;
        }
        setIsProcessing(true);
        setResults(prompts.map(p => ({ prompt: p, status: 'idle' })));

        const params = prompts.map(p => ({ prompt: p, model, apiKey }));
        await generateBatch(params, (index, update) => {
            setResults(prev => {
                const next = [...prev];
                next[index] = { ...next[index], ...update };
                return next;
            });
        });
        setIsProcessing(false);
    };

    const statusIcon = (status: string) => {
        switch (status) {
            case 'loading': return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
            case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
            case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
            default: return <Clock className="w-3.5 h-3.5 text-gray-300" />;
        }
    };

    return (
        <div className="flex gap-5 h-full">
            {/* Left - prompt input & queue */}
            <div className="w-[380px] shrink-0 flex flex-col gap-3">
                <div className="flex gap-2">
                    <input
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập prompt, nhấn Enter để thêm..."
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm"
                    />
                    <button
                        onClick={addPrompt}
                        disabled={!currentInput.trim()}
                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition text-sm"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                        <span className="text-xs text-gray-500 font-medium">Queue ({prompts.length})</span>
                        {prompts.length > 0 && (
                            <button onClick={clearAll} disabled={isProcessing} className="text-xs text-red-400 hover:text-red-500 disabled:opacity-40">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {prompts.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-xs text-gray-300">
                                Chưa có prompt nào
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {prompts.map((prompt, i) => (
                                    <div key={i} className="group flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition">
                                        <span className="text-[10px] text-gray-300 w-5 shrink-0 font-mono">{i + 1}</span>
                                        <span className="text-xs text-gray-600 flex-1 truncate">{prompt}</span>
                                        <button
                                            onClick={() => removePrompt(i)}
                                            disabled={isProcessing}
                                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition disabled:opacity-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleProcess}
                    disabled={isProcessing || prompts.length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition text-white font-medium py-2.5 rounded-lg text-sm shrink-0"
                >
                    {isProcessing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Generating videos...</>
                    ) : (
                        <><Play className="w-4 h-4" /> Generate ({prompts.length} videos)</>
                    )}
                </button>
            </div>

            {/* Right - results */}
            <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-500 font-medium">
                        Results {results.length > 0 && `(${results.filter(r => r.status === 'success').length}/${results.length})`}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {results.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-xs text-gray-300">
                            Video sẽ hiển thị ở đây
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {results.map((r, i) => (
                                <div key={i} className="px-4 py-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        {statusIcon(r.status)}
                                        <span className="text-xs font-medium text-gray-500 truncate flex-1">{r.prompt}</span>
                                    </div>
                                    {r.status === 'loading' && (
                                        <div className="flex items-center gap-2 pl-5 text-xs text-blue-500">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Đang tạo video... (có thể mất 1-3 phút)
                                        </div>
                                    )}
                                    {r.status === 'success' && r.videoBlobUrls && r.videoBlobUrls.length > 0 && (
                                        <div className="pl-5 space-y-2">
                                            <video
                                                src={r.videoBlobUrls[0]}
                                                controls
                                                className="w-full max-w-md rounded-lg border border-gray-200"
                                            />
                                            <a
                                                href={r.videoBlobUrls[0]}
                                                download={`veo3_${i + 1}.mp4`}
                                                target="_blank"
                                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
                                            >
                                                <Download className="w-3 h-3" />
                                                Download video
                                            </a>
                                        </div>
                                    )}
                                    {r.status === 'error' && (
                                        <div className="text-xs text-red-500 pl-5">{r.error}</div>
                                    )}
                                    {r.status === 'idle' && (
                                        <div className="text-xs text-gray-300 pl-5 italic">Waiting...</div>
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
