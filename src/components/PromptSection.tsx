import React, { useState } from 'react';
import { MessageSquarePlus, Play } from 'lucide-react';

interface PromptSectionProps {
    onGenerate: (prompts: string[]) => void;
    disabled: boolean;
}

export function PromptSection({ onGenerate, disabled }: PromptSectionProps) {
    const [input, setInput] = useState('');

    const handleGenerate = () => {
        const prompts = input.split('\n').map(p => p.trim()).filter(p => p !== '');
        if (prompts.length > 0) {
            onGenerate(prompts);
        }
    };

    return (
        <section className="glass p-6 rounded-2xl mb-6">
            <div className="flex items-center gap-3 mb-4">
                <MessageSquarePlus className="w-5 h-5 text-purple-400" />
                <h2 className="text-xl font-semibold">Batch Input</h2>
                <span className="text-xs text-white/40 ml-auto">One prompt per line</span>
            </div>
            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter your prompts here...&#10;Prompt 1&#10;Prompt 2&#10;..."
                rows={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono text-sm resize-none mb-4"
            />
            <button
                onClick={handleGenerate}
                disabled={disabled || !input.trim()}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:grayscale transition-all text-white font-bold py-3 rounded-xl shadow-lg shadow-purple-500/20"
            >
                <Play className="w-5 h-5" />
                Process Batch (Concurrent: 5)
            </button>
        </section>
    );
}
