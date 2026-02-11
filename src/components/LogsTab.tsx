import { useLogger, LogEntry } from './LogContext';
import { Trash2, AlertCircle, Info, Bug, AlertTriangle, Monitor } from 'lucide-react';

export function LogsTab() {
    const { logs, clearLogs } = useLogger();

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'info': return <Info className="w-4 h-4 text-blue-500" />;
            case 'warn': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
            case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
            case 'debug': return <Bug className="w-4 h-4 text-gray-400" />;
            default: return <Monitor className="w-4 h-4 text-gray-500" />;
        }
    };

    const getLevelClass = (level: string) => {
        switch (level) {
            case 'info': return 'text-blue-700 bg-blue-50';
            case 'warn': return 'text-yellow-700 bg-yellow-50';
            case 'error': return 'text-red-700 bg-red-50';
            case 'debug': return 'text-gray-600 bg-gray-50';
            default: return '';
        }
    };

    return (
        <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                    <Monitor className="w-4 h-4" /> System Logs
                </h2>
                <button
                    onClick={clearLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Logs
                </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#1e1e1e] text-gray-300 font-mono text-[11px] p-2">
                {logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500 italic">
                        No logs available
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {logs.map((entry: LogEntry) => (
                            <div key={entry.id} className="flex gap-2 py-1 px-2 border-l-2 border-transparent hover:bg-white/5 transition-colors group">
                                <span className="text-gray-500 shrink-0 select-none">[{entry.timestamp}]</span>
                                <span className={`px-1 rounded uppercase flex items-center gap-1 shrink-0 ${getLevelClass(entry.level)}`}>
                                    {getLevelIcon(entry.level)}
                                    {entry.level}
                                </span>
                                <span className="text-blue-400 shrink-0">[{entry.source}]</span>
                                <span className="break-words flex-1 group-hover:text-white transition-colors">{entry.message}</span>
                                {entry.data && (
                                    <div className="hidden group-hover:block max-w-xs overflow-hidden text-gray-500">
                                        {JSON.stringify(entry.data)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
