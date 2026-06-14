import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Cpu, Database, Moon, Palette, Settings as SettingsIcon, Sun, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { ToastContainer, useToast } from './Toast';

type ConfirmModal = {
    target: 'main' | 'test' | 'restore';
    step: 1 | 2;
    payload?: string;
};

const COLOR_THEMES = [
    { id: 'twilight', label: 'Twilight', primary: '#905ea9', secondary: '#a884f3' },
    { id: 'crimson', label: 'Crimson', primary: '#e83b3b', secondary: '#fb6b1d' },
    { id: 'citrus', label: 'Citrus', primary: '#a2a947', secondary: '#d5e04b' },
    { id: 'ocean', label: 'Ocean', primary: '#1ebc73', secondary: '#30e1b9' },
    { id: 'sapphire', label: 'Sapphire', primary: '#4d9be6', secondary: '#8fd3ff' },
    { id: 'magenta', label: 'Magenta', primary: '#cf657f', secondary: '#ed8099' },
];

function getApiErrorMessage(err: unknown, fallback: string) {
    if (axios.isAxiosError(err)) {
        const detail = err.response?.data && typeof err.response.data === 'object' && 'detail' in err.response.data
            ? err.response.data.detail
            : undefined;
        return typeof detail === 'string' ? detail : err.message || fallback;
    }
    return err instanceof Error ? err.message : fallback;
}

export default function SettingsPage() {
    const [apiError, setApiError] = useState('');
    const [appVersion, setAppVersion] = useState('0.0.0');
    const [models, setModels] = useState<{ name: string, is_vision: boolean }[]>([]);
    const [activeModel, setActiveModel] = useState(() => localStorage.getItem('activeModel') || '');
    const [loadingModels, setLoadingModels] = useState(true);
    const [backups, setBackups] = useState<{ filename: string, size: number, created: number }[]>([]);
    const [selectedBackup, setSelectedBackup] = useState('');
    const [backupLoading, setBackupLoading] = useState(false);
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => (localStorage.getItem('themeMode') as 'dark' | 'light') || 'dark');
    const [themeColor, setThemeColor] = useState(() => localStorage.getItem('themeColor') || 'twilight');
    const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
    const { toasts, dismiss, success: toastSuccess, error: toastError } = useToast();

    const applyTheme = (mode: 'dark' | 'light', color: string) => {
        document.documentElement.setAttribute('data-mode', mode);
        document.documentElement.setAttribute('data-color', color);
        localStorage.setItem('themeMode', mode);
        localStorage.setItem('themeColor', color);
    };

    const fetchModels = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/models`);
            setModels(res.data.models);

            const savedModel = localStorage.getItem('activeModel');
            if (savedModel && res.data.models.some((m: { name: string }) => m.name === savedModel)) {
                setActiveModel(savedModel);
            } else if (!savedModel && res.data.active) {
                setActiveModel(res.data.active);
                localStorage.setItem('activeModel', res.data.active);
            }
        } catch {
            console.error("Failed to fetch models");
        } finally {
            setLoadingModels(false);
        }
    };

    const refreshModelList = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/models`);
            setModels(res.data.models);
        } catch {
            console.error("Failed to refresh model list");
        }
    };

    const fetchVersion = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/version`);
            setAppVersion(res.data.version);
        } catch {
            console.error("Failed to fetch version");
        }
    };

    const fetchBackups = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/database/backups`);
            setBackups(res.data.backups);
            if (res.data.backups.length > 0 && !selectedBackup) {
                setSelectedBackup(res.data.backups[0].filename);
            }
        } catch {
            console.error("Failed to fetch backups");
        }
    };

    useEffect(() => {
        fetchModels();
        fetchVersion();
        fetchBackups();
        applyTheme(themeMode, themeColor);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newModel = e.target.value;
        setActiveModel(newModel);
        localStorage.setItem('activeModel', newModel);
        try {
            await axios.post(`${API_BASE_URL}/api/settings/model`, { active_model: newModel });
        } catch {
            console.error("Failed to update model");
        }
    };

    const handleCreateBackup = async () => {
        setBackupLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/api/database/backup`);
            await fetchBackups();
            toastSuccess('Backup created successfully!');
        } catch (err: unknown) {
            toastError(getApiErrorMessage(err, 'Failed to create backup'));
        } finally {
            setBackupLoading(false);
        }
    };

    const executeRestore = async (filename: string) => {
        try {
            setApiError('');
            await axios.post(`${API_BASE_URL}/api/database/restore`, { filename });
            toastSuccess(`Successfully restored DB to version: ${filename}`);
        } catch (err: unknown) {
            setApiError(getApiErrorMessage(err, "Failed to restore database"));
        }
    };

    const executeCleanDatabase = async (target: 'main' | 'test') => {
        try {
            setApiError('');
            await axios.post(`${API_BASE_URL}/api/database/clean`, { target });
            toastSuccess(target === 'main' ? 'Main gallery database cleaned.' : 'Test database cleaned.');
        } catch (err: unknown) {
            setApiError(getApiErrorMessage(err, "Failed to clean database"));
        }
    };

    const handleConfirmNext = () => {
        if (!confirmModal) return;

        if (confirmModal.target === 'main' && confirmModal.step === 1) {
            setConfirmModal({ target: 'main', step: 2 });
            return;
        }

        if (confirmModal.target === 'restore') {
            executeRestore(confirmModal.payload!);
        } else {
            executeCleanDatabase(confirmModal.target);
        }
        setConfirmModal(null);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <SettingsIcon className="text-primary w-8 h-8" />
                    Settings
                </h1>
                <p className="text-gray-400 mt-2 text-lg">Configure local AI models, backups, appearance, and database maintenance.</p>
            </div>

            <div className="bg-surface rounded-2xl p-8 shadow-2xl border border-[#262626]">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Cpu className="w-6 h-6 text-gray-400" />
                    AI Engine Selection
                </h2>
                <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Active Vision Model</label>
                    {loadingModels ? (
                        <div className="h-12 bg-[#111] animate-pulse rounded-xl border border-gray-800"></div>
                    ) : (
                        <select
                            value={activeModel}
                            onChange={handleModelChange}
                            onClick={refreshModelList}
                            className="w-full bg-[#111] border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none"
                        >
                            {models.map(m => (
                                <option key={m.name} value={m.name} disabled={!m.is_vision} className={!m.is_vision ? "text-gray-500" : "text-white"}>
                                    {m.name} {!m.is_vision ? "(Not a Vision Model)" : ""}
                                </option>
                            ))}
                        </select>
                    )}
                    <p className="mt-2 text-xs text-gray-500">Only models that support image processing (vision) can be used. Other local models are greyed out.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-6">
                    <div className="bg-[#111] p-4 rounded-xl border border-gray-800">
                        <p className="text-sm text-gray-400 mb-1">Ollama Connection</p>
                        <p className="text-emerald-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Available (Network Available)
                        </p>
                    </div>
                    <div className="bg-[#111] p-4 rounded-xl border border-gray-800">
                        <p className="text-sm text-gray-400 mb-1">DeepFace Engine</p>
                        <p className="text-emerald-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Enabled
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-8 bg-surface rounded-2xl p-8 shadow-2xl border border-[#262626]">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Database className="w-6 h-6 text-blue-400" />
                    Database Integrity & Backups
                </h2>

                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between bg-[#111] p-4 rounded-xl border border-gray-800">
                        <div>
                            <h3 className="text-gray-200 font-medium">Create New Backup</h3>
                            <p className="text-gray-500 text-sm mt-1">Safely duplicate your entire processed gallery metadata.</p>
                        </div>
                        <button
                            onClick={handleCreateBackup}
                            disabled={backupLoading}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors shadow-lg"
                        >
                            {backupLoading ? "Creating..." : "Create Backup Now"}
                        </button>
                    </div>

                    <div className="bg-[#111] p-4 rounded-xl border border-gray-800">
                        <h3 className="text-gray-200 font-medium mb-3">Restore from Backup</h3>
                        <div className="flex gap-4">
                            <select
                                value={selectedBackup}
                                onChange={(e) => setSelectedBackup(e.target.value)}
                                className="flex-1 bg-[#161616] border border-gray-700 rounded-lg px-3 py-2 text-gray-300 outline-none focus:border-blue-500"
                                disabled={backups.length === 0}
                            >
                                {backups.length === 0 && <option>No backups found</option>}
                                {backups.map(b => (
                                    <option key={b.filename} value={b.filename}>
                                        {b.filename} ({(b.size / 1024 / 1024).toFixed(2)} MB) - {new Date(b.created * 1000).toLocaleString()}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => selectedBackup && setConfirmModal({ target: 'restore', step: 1, payload: selectedBackup })}
                                disabled={backups.length === 0 || !selectedBackup}
                                className="bg-red-900/30 hover:bg-red-800/50 border border-red-800/50 text-red-400 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                <AlertTriangle className="w-4 h-4" /> Restore
                            </button>
                        </div>
                        <p className="text-red-500/80 text-xs mt-3 bg-red-900/10 p-2 rounded border border-red-900/30">
                            Warning: Restoring will completely overwrite your current gallery database with the backup copy!
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-8 bg-surface rounded-2xl p-8 shadow-2xl border border-[#262626]">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Palette className="w-6 h-6 text-primary" />
                    Appearance
                </h2>

                <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-300 mb-3">Mode</label>
                    <div className="flex gap-3">
                        {(['dark', 'light'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => { setThemeMode(mode); applyTheme(mode, themeColor); }}
                                className={`flex items-center gap-2 px-5 py-3 rounded-xl border transition-all font-medium capitalize ${themeMode === mode
                                    ? 'bg-primary text-white border-primary shadow-lg'
                                    : 'bg-[#111] border-gray-700 text-gray-400 hover:border-gray-500'
                                    }`}
                            >
                                {mode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                {mode === 'dark' ? 'Dark' : 'Light'}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">Accent Color</label>
                    <div className="flex flex-wrap gap-4">
                        {COLOR_THEMES.map(theme => (
                            <button
                                key={theme.id}
                                title={theme.label}
                                onClick={() => { setThemeColor(theme.id); applyTheme(themeMode, theme.id); }}
                                className="group flex flex-col items-center gap-2 transition-transform hover:scale-105"
                            >
                                <div
                                    className={`w-12 h-12 rounded-full border-4 transition-all shadow-md ${themeColor === theme.id
                                        ? 'border-white scale-110 shadow-white/30'
                                        : 'border-transparent opacity-70 hover:opacity-100'
                                        }`}
                                    style={{ background: `linear-gradient(135deg, ${theme.primary} 50%, ${theme.secondary} 50%)` }}
                                />
                                <span className={`text-xs font-medium ${themeColor === theme.id ? 'text-white' : 'text-gray-500'}`}>{theme.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-8 bg-[#160000] rounded-2xl p-8 shadow-2xl border border-red-900/50">
                <h2 className="text-xl font-semibold text-red-400 mb-6 flex items-center gap-2">
                    <Trash2 className="w-6 h-6 text-red-500" />
                    Danger Zone
                </h2>
                <div className="flex gap-4">
                    <button
                        onClick={() => setConfirmModal({ target: 'test', step: 1 })}
                        className="flex-1 bg-red-900/20 hover:bg-red-900/40 border border-red-800 text-red-400 font-medium px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" /> Clean Test Database
                    </button>
                    <button
                        onClick={() => setConfirmModal({ target: 'main', step: 1 })}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                    >
                        <AlertTriangle className="w-5 h-5" /> Clean Main Gallery Database
                    </button>
                </div>
            </div>

            {apiError && (
                <div className="mt-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex items-start gap-3 text-red-400">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">Action Failed</p>
                        <p className="text-sm opacity-90">{apiError}</p>
                    </div>
                </div>
            )}

            {confirmModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setConfirmModal(null)}>
                    <div className="bg-surface border border-[#333] shadow-2xl rounded-2xl p-8 max-w-md w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-4 text-red-500 mb-4">
                            <AlertTriangle className="w-8 h-8" />
                            <h2 className="text-2xl font-bold text-white">Warning: Destructive Action</h2>
                        </div>
                        <div className="text-gray-300 text-lg mb-8 leading-relaxed">
                            {confirmModal.target === 'restore' ? (
                                <p>Are you sure you want to completely <strong>OVERWRITE</strong> the current database with the backup: <code className="text-red-400 bg-[#161616] px-2 py-1 rounded">{confirmModal.payload}</code>?</p>
                            ) : confirmModal.target === 'test' ? (
                                <p>Are you sure you want to completely <strong>WIPE</strong> the Test Database? This will erase all uploaded test scans.</p>
                            ) : confirmModal.step === 1 ? (
                                <p>Are you sure you want to completely <strong>WIPE</strong> the Main Gallery Database? This will erase all history and metadata.</p>
                            ) : (
                                <p className="text-red-400 font-semibold">Are you REALLY sure? This will delete all processed metadata forever. This cannot be undone.</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 font-medium">
                            <button onClick={() => setConfirmModal(null)} className="px-5 py-2.5 rounded-xl bg-[#262626] hover:bg-[#333] text-gray-300 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleConfirmNext} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 transition-colors flex items-center gap-2">
                                <Trash2 className="w-4 h-4" />
                                {confirmModal.step === 1 && confirmModal.target === 'main' ? "Yes, Proceed" : "CONFIRM WIPE"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-8 text-center text-gray-600 text-xs font-mono pb-4">
                Local LLM Photo Scanner v{appVersion}
            </div>
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
