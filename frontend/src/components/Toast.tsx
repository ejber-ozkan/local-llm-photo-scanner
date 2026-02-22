import { useEffect, useCallback, useState, type ReactElement } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface ToastMessage { id: number; type: ToastType; message: string; }

// ─── Per-component hook ──────────────────────────────────────────────────────
let _nextId = 1;

export function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const dismiss = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
    const push = useCallback((message: string, type: ToastType = 'info') => {
        const id = _nextId++;
        setToasts(p => [...p, { id, type, message }]);
    }, []);
    return {
        toasts,
        dismiss,
        success: (msg: string) => push(msg, 'success'),
        error: (msg: string) => push(msg, 'error'),
        warning: (msg: string) => push(msg, 'warning'),
        info: (msg: string) => push(msg, 'info'),
    };
}

// ─── Toast item ──────────────────────────────────────────────────────────────
const ICONS: Record<ToastType, ReactElement> = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
};
const ACCENT: Record<ToastType, string> = {
    success: 'border-emerald-500/40',
    error: 'border-red-500/40',
    warning: 'border-yellow-500/40',
    info: 'border-blue-500/40',
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
    useEffect(() => {
        const t = setTimeout(() => onDismiss(toast.id), 4500);
        return () => clearTimeout(t);
    }, [toast.id, onDismiss]);

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md max-w-sm w-full animate-in fade-in slide-in-from-bottom-2 duration-200 ${ACCENT[toast.type]}`}
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)', color: 'var(--text-main)' }}
        >
            {ICONS[toast.type]}
            <p className="text-sm flex-1 leading-snug font-medium">{toast.message}</p>
            <button
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity ml-1"
                aria-label="Dismiss"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

// ─── Container (place once at the bottom of each page component) ─────────────
export function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
    if (!toasts.length) return null;
    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
            {toasts.map(t => (
                <div key={t.id} className="pointer-events-auto">
                    <ToastItem toast={t} onDismiss={onDismiss} />
                </div>
            ))}
        </div>
    );
}
