import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { getApiKey, getVisualPromptsHistory, saveVisualPromptsHistory, getVisualStyles, saveVisualStyles, VisualStyle } from '../lib/store';
import { Upload, Play, Loader2, Copy, Send, Clock, Image as BananaIcon, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
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

    // Style Manager State
    const [styles, setStyles] = useState<VisualStyle[]>([]);
    const [selectedStyleId, setSelectedStyleId] = useState<string>('default');
    const [isEditingStyle, setIsEditingStyle] = useState(false);
    const [editingStyleName, setEditingStyleName] = useState('');
    const [editingStyleJson, setEditingStyleJson] = useState('');
    const [editingStyleId, setEditingStyleId] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const t = translations[language as Language] || translations.vi;
    const { error: toastError, success: toastSuccess } = useToast();

    // Load initial data
    useEffect(() => {
        // Load Styles
        getVisualStyles().then(loaded => {
            if (loaded.length === 0) {
                const defaultStyle: VisualStyle = { id: 'default', name: 'Default', config: {} };
                setStyles([defaultStyle]);
                saveVisualStyles([defaultStyle]);
            } else {
                setStyles(loaded);
            }
        });

        // Load History
        getVisualPromptsHistory().then(history => {
            if (history) {
                setScript(history.script);
                setPrompts(history.prompts);
                if (history.selectedStyleId) setSelectedStyleId(history.selectedStyleId);
            }
        });
    }, []);

    // Auto-save history
    useEffect(() => {
        const timer = setTimeout(() => {
            saveVisualPromptsHistory({ script, prompts, selectedStyleId });
        }, 1000);
        return () => clearTimeout(timer);
    }, [script, prompts, selectedStyleId]);

    const handleFileImport = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text) setScript(text);
        };
        reader.readAsText(file);
    };

    // --- Style Manager Logic ---
    const handleAddStyle = () => {
        setEditingStyleId(null); // New style
        setEditingStyleName('New Style');
        setEditingStyleJson(`{
  "art_style": "Cinematic, Photorealistic",
  "camera": "Anamorphic lens, shallow depth of field",
  "lighting": "Soft volumetric lighting, rim light",
  "color_grading": "Teal and orange, high contrast",
  "atmosphere": "Dreamy, cinematic",
  "technical": "4k, detailed, sharp focus"
}`);
        setIsEditingStyle(true);
    };

    const handleEditStyle = () => {
        const style = styles.find(s => s.id === selectedStyleId);
        if (!style) return;
        setEditingStyleId(style.id);
        setEditingStyleName(style.name);
        setEditingStyleJson(JSON.stringify(style.config, null, 2));
        setIsEditingStyle(true);
    };

    const handleDeleteStyle = async () => {
        if (selectedStyleId === 'default') return;
        if (!confirm('Are you sure you want to delete this style?')) return;

        const newStyles = styles.filter(s => s.id !== selectedStyleId);
        setStyles(newStyles);
        setSelectedStyleId('default');
        await saveVisualStyles(newStyles);
        toastSuccess('Style deleted');
    };

    const handleSaveStyle = async () => {
        try {
            const config = JSON.parse(editingStyleJson);

            if (editingStyleId) {
                // Update existing
                const newStyles = styles.map(s => s.id === editingStyleId ? { ...s, name: editingStyleName, config } : s);
                setStyles(newStyles);
                await saveVisualStyles(newStyles);
            } else {
                // Create new
                const newStyle: VisualStyle = {
                    id: crypto.randomUUID(),
                    name: editingStyleName,
                    config
                };
                setStyles([...styles, newStyle]);
                setSelectedStyleId(newStyle.id);
                await saveVisualStyles([...styles, newStyle]);
            }
            setIsEditingStyle(false);
            toastSuccess('Style saved');
        } catch (e) {
            toastError('Invalid JSON format');
        }
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
            const modelId = 'gemini-2.0-flash'; // Or 'gemini-2.0-flash-lite-preview-02-05' if available/cheaper

            // Get Style Config
            const currentStyle = styles.find(s => s.id === selectedStyleId);
            const styleConfig = currentStyle?.config || {};
            const styleJsonString = JSON.stringify(styleConfig, null, 2);
            const hasStyle = Object.keys(styleConfig).length > 0;

            // Build System Prompt
            // Detect list vs script heuristic
            const inputLines = script.split('\n').filter(l => l.trim().length > 0);
            const isList = inputLines.length > numPrompts * 0.5;

            let systemPrompt = `Role: Professional Video Director.\n`;

            if (hasStyle) {
                systemPrompt += `\nVisual Style Guidelines (MUST FOLLOW STRICTLY):
\`\`\`json
${styleJsonString}
\`\`\`
Ensure all generated prompts adhere to these visual constraints (camera, lighting, vibe, etc.).\n\n`;
            }

            if (isList) {
                if (inputLines.length > numPrompts) {
                    systemPrompt += `Task: Format and enhance a list of ${inputLines.length} scenes for AI video generation (Veo).
IMPORTANT: Keep ALL ${inputLines.length} scenes. Do NOT remove/summarize.
Return exactly one prompt per line. No numbering.\n\nInput:\n${script}`;
                } else {
                    systemPrompt += `Task: Expand a list of scenes to exactly ${numPrompts} prompts for a ${durationSec}s video (~8s each).
1. Keep original meaning.
2. Expand if short.
3. Return ONLY list of prompts, one per line. No numbering.\n\nInput:\n${script}`;
                }
            } else {
                systemPrompt += `Task: Break down the script into exactly ${numPrompts} distinct visual scenes for a ${durationSec}s video (~8s each).
1. Tell the story step-by-step.
2. Vivid, standalone English visual descriptions.
3. Smooth transitions.
4. Focus on visual details.
5. Return ONLY list of prompts, one per line. No numbering.\n\nScript:\n${script}`;
            }

            const response = await ai.models.generateContent({
                model: modelId,
                contents: systemPrompt,
            });

            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const lines = text.split('\n')
                    .map((l: string) => l.trim())
                    .filter((l: string) => l.length > 0 && !l.startsWith('Script:') && !l.startsWith('Role:') && !l.startsWith('```'));
                setPrompts(lines);
                toastSuccess(`Generated ${lines.length} prompts`);
            }
        } catch (e: any) {
            console.error("Failed to generate prompts", e);
            if (e.message?.includes('429') || e.status === 429) {
                toastError(language === 'vi' ? 'Thao tác quá nhanh...' : 'Too many requests...');
            } else {
                toastError("Error: " + (e.message || 'Unknown error'));
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
        <div className="flex gap-4 h-full relative">
            {/* Style Editor Modal/Overlay */}
            {isEditingStyle && (
                <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex items-center justify-center p-10 rounded-lg border border-gray-200 shadow-xl">
                    <div className="w-full max-w-2xl flex flex-col gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-2xl h-full max-h-[600px]">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-lg">{editingStyleId ? t.editStyle : t.newStyle}</h3>
                            <button onClick={() => setIsEditingStyle(false)} className="hover:text-red-500 cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500">{t.styleNameLabel}</label>
                            <input
                                value={editingStyleName}
                                onChange={e => setEditingStyleName(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex flex-col gap-1 flex-1 min-h-0">
                            <label className="text-xs font-medium text-gray-500">{t.styleConfigLabel}</label>
                            <textarea
                                value={editingStyleJson}
                                onChange={e => setEditingStyleJson(e.target.value)}
                                className="flex-1 border border-gray-300 rounded-lg p-3 font-mono text-sm resize-none outline-none focus:border-blue-500"
                                placeholder='{ "vibes": "cinematic" }'
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsEditingStyle(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Cancel</button>
                            <button onClick={handleSaveStyle} className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-500 rounded-lg flex items-center gap-2 cursor-pointer">
                                <Save className="w-4 h-4" /> {t.saveStyle}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Left Input Panel */}
            <div className="w-1/2 flex flex-col gap-3">
                <div className="flex flex-col gap-3">
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
                                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600 transition text-sm cursor-pointer">
                                <Upload className="w-4 h-4" /> Import .txt
                            </button>
                            <input ref={fileInputRef} type="file" accept=".txt" className="hidden"
                                onChange={e => { if (e.target.files?.[0]) handleFileImport(e.target.files[0]); }} />
                        </div>
                    </div>

                    {/* Visual Style Selector */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500">{t.visualStyleLabel}</label>
                        <div className="flex gap-2">
                            <select
                                value={selectedStyleId}
                                onChange={e => setSelectedStyleId(e.target.value)}
                                className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 cursor-pointer"
                            >
                                {styles.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>

                            <button onClick={handleAddStyle} title={t.newStyle} className="p-2 border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 bg-white text-gray-500 transition cursor-pointer">
                                <Plus className="w-4 h-4" />
                            </button>

                            {selectedStyleId !== 'default' && (
                                <>
                                    <button onClick={handleEditStyle} title={t.editStyle} className="p-2 border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 bg-white text-gray-500 transition cursor-pointer">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={handleDeleteStyle} title={t.deleteStyle} className="p-2 border border-gray-200 rounded-lg hover:border-red-400 hover:text-red-500 bg-white text-gray-500 transition cursor-pointer">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
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
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm cursor-pointer"
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
                            className="p-2 text-gray-400 hover:text-blue-600 transition cursor-pointer">
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
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm cursor-pointer"
                    >
                        <Send className="w-4 h-4" /> {t.sendToTextTab}
                    </button>
                    {onAddBananaPrompts && (
                        <button
                            onClick={() => onAddBananaPrompts(prompts)}
                            disabled={prompts.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm cursor-pointer"
                        >
                            <BananaIcon className="w-4 h-4" /> {t.sendToBananaTab || "Send to Nano Banana"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
