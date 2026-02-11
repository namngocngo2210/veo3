import React, { createContext, useContext, useState, useCallback } from 'react';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    source: string;
    message: string;
    data?: any;
}

interface LogContextType {
    logs: LogEntry[];
    addLog: (level: LogLevel, source: string, message: string, data?: any) => void;
    clearLogs: () => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export function LogProvider({ children }: { children: React.ReactNode }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((level: LogLevel, source: string, message: string, data?: any) => {
        const entry: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            level,
            source,
            message,
            data
        };
        setLogs(prev => [entry, ...prev].slice(0, 500)); // Keep last 500 logs
        console.log(`[${level.toUpperCase()}] [${source}] ${message}`, data || '');
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    return (
        <LogContext.Provider value={{ logs, addLog, clearLogs }}>
            {children}
        </LogContext.Provider>
    );
}

export function useLogger() {
    const context = useContext(LogContext);
    if (context === undefined) {
        throw new Error('useLogger must be used within a LogProvider');
    }
    return context;
}
