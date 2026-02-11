import React, { useState, useEffect } from 'react';
import { getApiKey, saveApiKey } from '../lib/store';
import { Key, Save, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function ApiKeySection() {
    const [apiKey, setApiKey] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        getApiKey().then((key) => {
            if (key) setApiKey(key);
        });
    }, []);

    const handleSave = async () => {
        await saveApiKey(apiKey);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    return (
        <section className="glass p-6 rounded-2xl mb-6">
            <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold">Gemini API Configuration</h2>
            </div>
            <div className="flex gap-3">
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Gemini API Key..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                <button
                    onClick={handleSave}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2 rounded-xl font-medium transition-all",
                        isSaved
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-blue-600 hover:bg-blue-500 text-white"
                    )}
                >
                    {isSaved ? (
                        <>
                            <CheckCircle2 className="w-4 h-4" />
                            Saved
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4" />
                            Save Key
                        </>
                    )}
                </button>
            </div>
        </section>
    );
}
