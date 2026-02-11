import React from 'react';
import { BatchResult } from '../lib/gemini';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface ResultSectionProps {
    results: BatchResult[];
}

export function ResultSection({ results }: ResultSectionProps) {
    if (results.length === 0) return null;

    return (
        <section className="glass p-6 rounded-2xl">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
                Results
                <span className="text-xs bg-white/10 px-2 py-1 rounded-full text-white/60">
                    {results.filter(r => r.status === 'success').length} / {results.length} Completed
                </span>
            </h2>
            <div className="space-y-4">
                {results.map((result, index) => (
                    <div
                        key={index}
                        className="border border-white/5 bg-white/[0.02] rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
                    >
                        <div className="px-4 py-3 bg-white/5 flex items-center gap-3 border-b border-white/5">
                            {result.status === 'loading' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                            {result.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                            {result.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                            {result.status === 'idle' && <Clock className="w-4 h-4 text-white/30" />}

                            <span className="text-sm font-medium text-white/80 truncate flex-1">
                                {result.prompt}
                            </span>

                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${result.status === 'loading' ? 'bg-blue-500/20 text-blue-400' :
                                    result.status === 'success' ? 'bg-green-500/20 text-green-400' :
                                        result.status === 'error' ? 'bg-red-500/20 text-red-400' :
                                            'bg-white/10 text-white/40'
                                }`}>
                                {result.status}
                            </span>
                        </div>
                        <div className="p-4">
                            {result.status === 'loading' && (
                                <div className="flex flex-col gap-2">
                                    <div className="h-4 bg-white/5 rounded animate-pulse w-3/4" />
                                    <div className="h-4 bg-white/5 rounded animate-pulse w-1/2" />
                                </div>
                            )}
                            {result.status === 'success' && (
                                <div className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                                    {result.response}
                                </div>
                            )}
                            {result.status === 'error' && (
                                <div className="text-sm text-red-400/80 bg-red-400/5 p-3 rounded-lg border border-red-400/10">
                                    {result.error}
                                </div>
                            )}
                            {result.status === 'idle' && (
                                <div className="text-sm text-white/30 italic">
                                    Waiting in queue...
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
