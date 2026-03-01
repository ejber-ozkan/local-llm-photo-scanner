import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Reusable confirm dialog replacing duplicate confirm modals across
 * Gallery, ScanTest, Identify, and SettingsPage.
 */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    variant = 'danger',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) return null;

    const isDanger = variant === 'danger';
    const Icon = isDanger ? Trash2 : AlertTriangle;
    const btnCls = isDanger
        ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/20'
        : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20';

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-6"
            onClick={onCancel}
        >
            <div
                className="bg-surface border border-[#333] shadow-2xl rounded-2xl p-8 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`flex items-center gap-4 ${isDanger ? 'text-red-500' : 'text-yellow-500'} mb-4`}>
                    <Icon className="w-7 h-7 shrink-0" />
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                </div>
                <div className="text-gray-300 text-base mb-8 leading-relaxed">
                    {message}
                </div>
                <div className="flex justify-end gap-3 font-medium">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-xl bg-[#262626] hover:bg-[#333] text-gray-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-5 py-2.5 rounded-xl text-white transition-colors flex items-center gap-2 ${btnCls}`}
                    >
                        <Icon className="w-4 h-4" />
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
