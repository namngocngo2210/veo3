import { VideoResult } from '../lib/gemini';
import { Loader2, CheckCircle2, AlertCircle, Clock, Download, RefreshCw } from 'lucide-react';

interface VideoResultListProps {
    results: VideoResult[];
    onRetry?: (index: number) => void;
}

export function VideoResultList({ results, onRetry }: VideoResultListProps) {
    if (results.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-xs text-gray-300">
                Video sẽ hiển thị ở đây
            </div>
        );
    }

    const statusIcon = (status: string) => {
        switch (status) {
            case 'loading': return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
            case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
            case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
            default: return <Clock className="w-3.5 h-3.5 text-gray-300" />;
        }
    };

    return (
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
                            Đang tạo video... (1-3 phút)
                        </div>
                    )}
                    {r.status === 'success' && r.videoBlobUrls && r.videoBlobUrls.length > 0 && (
                        <div className="pl-5 space-y-3">
                            {r.videoBlobUrls.map((url, vi) => (
                                <div key={vi} className="space-y-1">
                                    {r.videoBlobUrls!.length > 1 && (
                                        <span className="text-[10px] text-gray-400">Video {vi + 1}</span>
                                    )}
                                    <video src={url} controls playsInline className="w-full max-w-md rounded border border-gray-200"
                                        onError={(e) => console.error('Video load error:', url, e)} />
                                    <a href={url} download={`veo3_${i + 1}_${vi + 1}.mp4`}
                                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700">
                                        <Download className="w-3 h-3" /> Download
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                    {r.status === 'success' && (!r.videoBlobUrls || r.videoBlobUrls.length === 0) && (
                        <div className="pl-5 relative group/empty">
                            <div className="text-xs text-orange-500">
                                Video đã tạo thành công nhưng URL không khả dụng. Kiểm tra thư mục lưu.
                            </div>
                            {onRetry && (
                                <button onClick={() => onRetry(i)}
                                    className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 opacity-0 group-hover/empty:opacity-100 transition">
                                    <RefreshCw className="w-3 h-3" /> Thử lại
                                </button>
                            )}
                        </div>
                    )}
                    {r.status === 'error' && (
                        <div className="pl-5 relative group/err">
                            <div className="text-xs text-red-500">{r.error}</div>
                            {onRetry && (
                                <button onClick={() => onRetry(i)}
                                    className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 opacity-0 group-hover/err:opacity-100 transition">
                                    <RefreshCw className="w-3 h-3" /> Thử lại
                                </button>
                            )}
                        </div>
                    )}
                    {r.status === 'queued' && (
                        <div className="flex items-center gap-2 pl-5 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            Trong hàng đợi...
                        </div>
                    )}
                    {(r.status === 'idle' || r.status === undefined) && (
                        <div className="text-xs text-gray-300 pl-5 italic">Sẵn sàng...</div>
                    )}
                </div>
            ))}
        </div>
    );
}
