import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    show: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const remove = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const show = useCallback((message: string, type: ToastType = 'info') => {
        const id = crypto.randomUUID();
        const newToast = { id, message, type };
        setToasts(prev => [...prev, newToast]);
        setTimeout(() => remove(id), 3000); // Auto dismiss
    }, [remove]);

    const success = useCallback((msg: string) => show(msg, 'success'), [show]);
    const error = useCallback((msg: string) => show(msg, 'error'), [show]);
    const info = useCallback((msg: string) => show(msg, 'info'), [show]);

    return (
        <ToastContext.Provider value={{ show, success, error, info }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`
                        pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium transition-all animate-in slide-in-from-right fade-in duration-300
                        ${t.type === 'success' ? 'bg-white border-green-200 text-green-600 shadow-green-100' : ''}
                        ${t.type === 'error' ? 'bg-white border-red-200 text-red-600 shadow-red-100' : ''}
                        ${t.type === 'info' ? 'bg-white border-blue-200 text-blue-600 shadow-blue-100' : ''}
                    `}>
                        {t.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                        {t.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                        {t.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                        <span>{t.message}</span>
                        <button onClick={() => remove(t.id)} className="ml-2 hover:opacity-70 text-gray-400"><X className="w-3 h-3" /></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within ToastProvider");
    return context;
}
