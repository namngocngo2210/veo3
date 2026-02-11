import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { getApiKey, getVisualPromptsHistory, saveVisualPromptsHistory } from '../lib/store';
import { Upload, Play, Loader2, Copy, Send, Clock, Image as BananaIcon } from 'lucide-react';
import { translations, Language } from '../lib/i18n';
import { useToast } from './Toast';

interface Props {
    model: string;
    language: string;
    onAddPrompts: (prompts: string[]) => void;
    onAddBananaPrompts?: (prompts: string[]) => void;
}

export function VisualPromptsTab({ model: _model, language, onAddPrompts, onAddBananaPrompts }: Props) {
    const [script, setScript] = useState('');
    const [duration, setDuration] = useState<string>('60');
    const [prompts, setPrompts] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const t = translations[language as Language] || translations.vi;
    const { error: toastError, success: toastSuccess } = useToast();

    // Persistence
    useEffect(() => {
        getVisualPromptsHistory().then(history => {
            if (history) {
                setScript(history.script);
                setPrompts(history.prompts);
            }
        });
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            saveVisualPromptsHistory({ script, prompts });
        }, 1000);
        return () => clearTimeout(timer);
    }, [script, prompts]);

    const handleFileImport = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text) setScript(text);
        };
        reader.readAsText(file);
    };

    const handleGenerate = async () => {
        if (!script.trim()) return;
        const apiKey = await getApiKey();
        if (!apiKey) { toastError(t.alertNoKey); return; }

        const durationSec = parseInt(duration) || 0;
        if (durationSec < 8) {
            toastError("Duration must be at least 8 seconds");
            return;
        }

        setIsGenerating(true);
        setPrompts([]); // Clear old results
        try {
            const numPrompts = Math.ceil(durationSec / 8);
            const ai = new GoogleGenAI({ apiKey });

            // Use a cheaper model for text logic if available, or just use the same key
            // We use gemini-2.0-flash or similar for text tasks usually, but here we might not have it configured in "model" prop.
            // Let's assume the user key has access to standard Gemini models.
            // Using 'gemini-2.0-flash' is a safe bet for text.
            const modelId = 'gemini-2.0-flash';

            // Detect if script is already a list of prompts (many newlines)
            const inputLines = script.split('\n').filter(l => l.trim().length > 0);
            const isList = inputLines.length > numPrompts * 0.5; // Heuristic: if input has > 50% of target lines, treat as list

            let systemPrompt = '';
            if (isList) {
                if (inputLines.length > numPrompts) {
                    // Input has MORE lines than target -> Keep all lines
                    systemPrompt = `Role: Professional Video Director.
Task: The user has provided a list of ${inputLines.length} distinct visual scenes.
Your job is to format and slightly enhance them for AI video generation (Veo).
IMPORTANT: You must keep ALL ${inputLines.length} scenes. Do NOT remove any. Do NOT summarize.
Return exactly one prompt per line corresponding to the input lines.
Do NOT number the lines.

Input:
${script}`;
                } else {
                    // Input has FEWER lines -> Expand to target
                    systemPrompt = `Role: Professional Video Director.
Task: The user has provided a list of distinct visual scenes. Your job is to format and slightly enhance them for AI video generation (Veo).
Target Count: Approximately ${numPrompts} prompts.
Total Duration: ${durationSec} seconds (approx 8s per prompt).

Instructions:
1. Keep the original meaning of each line.
2. Ensure each line is a standalone visual description.
3. If the input is short, expand it to meet the target count of ${numPrompts}.
4. Return ONLY the list of prompts, one per line. No numbering.

Input:
${script}`;
                }
            } else {
                systemPrompt = `Role: Professional Video Director.
Task: Analyze the following story/script and break it down into exactly ${numPrompts} distinct visual scenes for ai video generation.
The total duration is ${durationSec} seconds (${numPrompts} scenes x ~8s each).

Instructions:
1. Understand the full context, mood, and narrative flow of the text.
2. Create a sequence of visual prompts that tells the story step-by-step.
3. Each prompt must be a vivid, standalone English visual description suitable for Veo.
4. Ensure smooth transitions between scenes.
5. Focus on visual details (lighting, camera angle, action).
6. Return ONLY the list of prompts, one per line. No numbering.

Script:
${script}`;
            }

            const response = await ai.models.generateContent({
                model: modelId,
                contents: systemPrompt,
            });

            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const lines = text.split('\n')
                    .map((l: string) => l.trim())
                    .filter((l: string) => l.length > 0 && !l.startsWith('Script:') && !l.startsWith('Role:'));
                setPrompts(lines);
                toastSuccess(`Generated ${lines.length} prompts`);
            }
        } catch (e: any) {
            console.error("Failed to generate prompts", e);
            if (e.message?.includes('429') || e.status === 429) {
                toastError(language === 'vi' ? 'Thao tác quá nhanh, vui lòng đợi 1 chút rồi thử lại.' : 'Too many requests, please wait a moment.');
            } else {
                toastError("Error generating prompts: " + (e.message || 'Unknown error'));
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(prompts.join('\n'));
        toastSuccess('Copied to clipboard');
    };

    return (
        <div className="flex gap-4 h-full">
            {/* Left Input Panel */}
            <div className="w-1/2 flex flex-col gap-3">
                <div className="flex gap-4">
                    <div className="flex-1 flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500">{t.durationLabel}</label>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <input
                                type="number"
                                value={duration}
                                onChange={e => setDuration(e.target.value)}
                                className="flex-1 text-sm outline-none"
                                min={8}
                            />
                        </div>
                    </div>
                    <div className="flex items-end">
                        <button onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600 transition text-sm">
                            <Upload className="w-4 h-4" /> Import .txt
                        </button>
                        <input ref={fileInputRef} type="file" accept=".txt" className="hidden"
                            onChange={e => { if (e.target.files?.[0]) handleFileImport(e.target.files[0]); }} />
                    </div>
                </div>

                <div className="flex-1 flex flex-col gap-1 min-h-0">
                    <label className="text-xs font-medium text-gray-500">{t.scriptLabel}</label>
                    <textarea
                        value={script}
                        onChange={e => setScript(e.target.value)}
                        placeholder={t.visualPromptPlaceholder}
                        className="flex-1 p-3 rounded-lg border border-gray-200 resize-none outline-none focus:border-blue-400 text-sm font-mono leading-relaxed"
                    />
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={!script.trim() || isGenerating}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm"
                >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {t.genPrompts}
                </button>
            </div>

            {/* Right Result Panel */}
            <div className="w-1/2 flex flex-col gap-3 h-full">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-500">
                        {t.promptsGenerated.replace('{count}', prompts.length.toString())}
                    </label>
                    <div className="flex gap-2">
                        <button onClick={handleCopy} disabled={prompts.length === 0}
                            className="p-2 text-gray-400 hover:text-blue-600 transition">
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <textarea
                    value={prompts.join('\n')}
                    readOnly={true}
                    className="flex-1 p-3 rounded-lg border border-gray-200 resize-none outline-none focus:border-blue-400 text-sm font-mono leading-relaxed bg-gray-50 text-gray-600"
                />

                <div className="flex gap-2">
                    <button
                        onClick={() => onAddPrompts(prompts)}
                        disabled={prompts.length === 0}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm"
                    >
                        <Send className="w-4 h-4" /> {t.sendToTextTab}
                    </button>
                    {onAddBananaPrompts && (
                        <button
                            onClick={() => onAddBananaPrompts(prompts)}
                            disabled={prompts.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm"
                        >
                            <BananaIcon className="w-4 h-4" /> {t.sendToBananaTab || "Send to Nano Banana"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
