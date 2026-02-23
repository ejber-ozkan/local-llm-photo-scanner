import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FolderSearch, Settings as SettingsIcon, CheckCircle, AlertTriangle, FolderOpen, Cpu, Terminal, ChevronDown, ChevronUp, Play, Pause, XCircle, Database, Trash2, Palette, Moon, Sun } from 'lucide-react';
import { useToast, ToastContainer } from './Toast';
import { API_BASE_URL } from '../config';

interface ScanStatus {
    state: 'idle' | 'running' | 'paused';
    total: number;
    processed: number;
    pending: number;
}

interface ScanHistoryItem {
    directory_path: string;
    last_scanned: string;
}

export default function SettingsPage() {
    const [path, setPath] = useState('');
    const [apiError, setApiError] = useState('');
    const [appVersion, setAppVersion] = useState('0.0.0');

    // Live scan state
    const [scanStatus, setScanStatus] = useState<ScanStatus>({
        state: 'idle', total: 0, processed: 0, pending: 0
    });

    // New state for Models
    const [models, setModels] = useState<{ name: string, is_vision: boolean }[]>([]);
    const [activeModel, setActiveModel] = useState('');
    const [loadingModels, setLoadingModels] = useState(true);

    // Scan History State
    const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Live logging state
    const [logs, setLogs] = useState<string[]>([]);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const logsContainerRef = useRef<HTMLDivElement>(null);

    // Confirm Modal State
    const [confirmModal, setConfirmModal] = useState<{ target: 'main' | 'test' | 'restore' | 'rescan', step: 1 | 2, payload?: string } | null>(null);

    // Backup State
    const [backups, setBackups] = useState<{ filename: string, size_bytes: number, created_at: string }[]>([]);
    const [selectedBackup, setSelectedBackup] = useState('');
    const [backupLoading, setBackupLoading] = useState(false);

    // Appearance / Theme State
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => (localStorage.getItem('themeMode') as 'dark' | 'light') || 'dark');
    const [themeColor, setThemeColor] = useState(() => localStorage.getItem('themeColor') || 'twilight');

    // Toast notifications (replaces native alert())
    const { toasts, dismiss, success: toastSuccess, error: toastError } = useToast();

    const COLOR_THEMES = [
        { id: 'twilight', label: 'Twilight', primary: '#905ea9', secondary: '#a884f3' },
        { id: 'crimson', label: 'Crimson', primary: '#e83b3b', secondary: '#fb6b1d' },
        { id: 'citrus', label: 'Citrus', primary: '#a2a947', secondary: '#d5e04b' },
        { id: 'ocean', label: 'Ocean', primary: '#1ebc73', secondary: '#30e1b9' },
        { id: 'sapphire', label: 'Sapphire', primary: '#4d9be6', secondary: '#8fd3ff' },
        { id: 'magenta', label: 'Magenta', primary: '#cf657f', secondary: '#ed8099' },
    ];

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
            setActiveModel(res.data.active);
        } catch (err) {
            console.error("Failed to fetch models");
        } finally {
            setLoadingModels(false);
        }
    };

    const fetchVersion = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/version`);
            setAppVersion(res.data.version);
        } catch (err) { }
    };

    useEffect(() => {
        fetchVersion();
    }, []);

    // Poll logs and status continuously
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        interval = setInterval(async () => {
            try {
                // Always poll status to know when a scan is happening
                const statusRes = await axios.get(`${API_BASE_URL}/api/scan/status`);
                setScanStatus(statusRes.data);

                // If the user has the log window open, or a scan is running/paused, get logs
                if (statusRes.data.state !== 'idle' || isLogOpen) {
                    const res = await axios.get(`${API_BASE_URL}/api/scan/logs`);
                    setLogs(res.data.logs);

                    // Auto-scroll localized container to bottom
                    if (logsContainerRef.current) {
                        logsContainerRef.current.scrollTo({
                            top: logsContainerRef.current.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }
            } catch (err) {
                // silently fail interval to prevent spam
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isLogOpen]);

    useEffect(() => {
        fetchModels();
        applyTheme(themeMode, themeColor); // Apply persisted theme on mount
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/scan/history`);
            setScanHistory(res.data.history);
        } catch (err) {
            console.error("Failed to fetch scan history");
        }
    };

    useEffect(() => {
        fetchHistory();
        fetchBackups();
    }, []);

    const fetchBackups = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/database/backups`);
            setBackups(res.data.backups);
            if (res.data.backups.length > 0 && !selectedBackup) {
                setSelectedBackup(res.data.backups[0].filename);
            }
        } catch (err) {
            console.error("Failed to fetch backups");
        }
    };

    const handleCreateBackup = async () => {
        setBackupLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/api/database/backup`);
            await fetchBackups();
            toastSuccess('Backup created successfully!');
        } catch (err: any) {
            toastError(err.response?.data?.detail || 'Failed to create backup');
        } finally {
            setBackupLoading(false);
        }
    };

    const handleSelectFolder = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/select-folder`);
            if (res.data.path) {
                setPath(res.data.path);
            }
        } catch (err) {
            console.error("Failed to open folder dialog", err);
        }
    };

    const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newModel = e.target.value;
        setActiveModel(newModel);
        try {
            await axios.post(`${API_BASE_URL}/api/settings/model`, { model_name: newModel });
        } catch (err) {
            console.error("Failed to update model");
        }
    };

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!path.trim()) return;

        // Check if this path was already scanned
        const alreadyScanned = scanHistory.some(item => item.directory_path.toLowerCase() === path.trim().toLowerCase());

        if (alreadyScanned) {
            // Intercept and prompt the user if they want to force rescan
            setConfirmModal({ target: 'rescan', step: 1, payload: path.trim() });
            return;
        }

        executeScan(false);
    };

    const executeScan = async (force: boolean) => {
        setApiError('');
        try {
            await axios.post(`${API_BASE_URL}/api/scan`, { directory_path: path.trim(), force_rescan: force });
            setPath('');
            setIsHistoryOpen(false); // Close history so user can see it processing
            setIsLogOpen(true);
            setConfirmModal(null);
            fetchHistory(); // Refresh history table immediately
        } catch (err: any) {
            setApiError(err.response?.data?.detail || err.message || "Failed to start scan");
        }
    };

    const handleControlAction = async (action: 'pause' | 'resume' | 'cancel') => {
        try {
            await axios.post(`${API_BASE_URL}/api/scan/control`, { action });
        } catch (err: any) {
            setApiError(err.message || `Failed to ${action} scan`);
        }
    };

    const triggerCleanWarning = (target: 'main' | 'test') => {
        setConfirmModal({ target, step: 1 });
    };

    const handleConfirmNext = () => {
        if (!confirmModal) return;
        if (confirmModal.target === 'main' && confirmModal.step === 1) {
            setConfirmModal({ target: 'main', step: 2 });
        } else if (confirmModal.target === 'restore') {
            executeRestore(confirmModal.payload!);
            setConfirmModal(null);
        } else if (confirmModal.target === 'rescan') {
            executeScan(true);
        } else {
            // Either test step 1, or main step 2. Execute.
            executeCleanDatabase(confirmModal.target as 'main' | 'test');
            setConfirmModal(null);
        }
    };

    const executeRestore = async (filename: string) => {
        try {
            setApiError('');
            await axios.post(`${API_BASE_URL}/api/database/restore`, { filename });
            const statusRes = await axios.get(`${API_BASE_URL}/api/scan/status`);
            setScanStatus(statusRes.data);
            fetchHistory();
            toastSuccess(`Successfully restored DB to version: ${filename}`);
        } catch (err: any) {
            setApiError(err.response?.data?.detail || err.message || "Failed to restore database");
        }
    };

    const executeCleanDatabase = async (target: 'main' | 'test') => {
        try {
            setApiError('');
            await axios.post(`${API_BASE_URL}/api/database/clean`, { target: target });
            // Refresh state since everything was wiped
            const statusRes = await axios.get(`${API_BASE_URL}/api/scan/status`);
            setScanStatus(statusRes.data);
            fetchHistory();
        } catch (err: any) {
            setApiError(err.response?.data?.detail || err.message || "Failed to clean database");
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <SettingsIcon className="text-primary w-8 h-8" />
                    Settings & Agent Config
                </h1>
                <p className="text-gray-400 mt-2 text-lg">Configure local directory scanning and backend parameters.</p>
            </div>

            <div className="bg-surface rounded-2xl p-8 shadow-2xl border border-[#262626]">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <FolderSearch className="w-6 h-6 text-gray-400" />
                    Scan Local Directory
                </h2>

                <form onSubmit={handleScan} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Absolute Path to Photos</label>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="e.g. C:\Users\John\Pictures"
                                className="flex-1 bg-[#111] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={handleSelectFolder}
                                className="bg-[#222] hover:bg-[#333] border border-gray-700 text-white font-medium px-4 py-3 rounded-xl transition-colors flex items-center gap-2"
                            >
                                <FolderOpen className="w-5 h-5" />
                                Browse...
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">The backend will recursively discover all .jpg, .png, and .webp files in this directory.</p>
                    </div>

                    {/* Scan History Collapsible */}
                    {scanHistory.length > 0 && (
                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                                className="flex items-center justify-between w-full bg-[#161616] hover:bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 transition-colors text-sm"
                            >
                                <div className="flex items-center gap-2">
                                    <FolderSearch className="w-4 h-4 text-gray-400" />
                                    <span className="font-medium text-gray-300">Recently Scanned Folders</span>
                                </div>
                                {isHistoryOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                            </button>

                            {isHistoryOpen && (
                                <div className="bg-black border-x border-b border-gray-800 rounded-b-lg p-2 max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-1 -mt-1 pt-3">
                                    {scanHistory.map((item, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => setPath(item.directory_path)}
                                            className="text-left w-full hover:bg-[#1a1a1a] p-2 rounded text-xs text-gray-400 hover:text-gray-200 transition-colors flex justify-between items-center group"
                                        >
                                            <span className="truncate mr-4">{item.directory_path}</span>
                                            <span className="text-[10px] text-gray-600 group-hover:text-gray-400 whitespace-nowrap">
                                                {new Date(item.last_scanned).toLocaleDateString()}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {scanStatus.state === 'idle' ? (
                        <button
                            type="submit"
                            disabled={!path.trim()}
                            className="bg-primary hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
                        >
                            Start Background Scan
                        </button>
                    ) : (
                        <div className="flex items-center gap-3">
                            {scanStatus.state === 'running' ? (
                                <button type="button" onClick={() => handleControlAction('pause')} className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2">
                                    <Pause className="w-5 h-5" /> Pause Scan
                                </button>
                            ) : (
                                <button type="button" onClick={() => handleControlAction('resume')} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2">
                                    <Play className="w-5 h-5" /> Resume Scan
                                </button>
                            )}
                            <button type="button" onClick={() => handleControlAction('cancel')} className="bg-red-500/20 hover:bg-red-500/30 text-red-500 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2">
                                <XCircle className="w-5 h-5" /> Cancel All Pending
                            </button>
                        </div>
                    )}
                </form>

                {/* Progress Indicators */}
                {scanStatus.total > 0 && (
                    <div className="mt-8 bg-[#111] p-6 rounded-xl border border-gray-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                {scanStatus.state === 'running' ? (
                                    <><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Processing Images...</>
                                ) : scanStatus.state === 'paused' ? (
                                    <><div className="w-2 h-2 rounded-full bg-yellow-500" /> Paused</>
                                ) : (
                                    scanStatus.pending > 0 ? (
                                        <><div className="w-2 h-2 rounded-full bg-gray-500" /> Pending (Ready to Resume)</>
                                    ) : (
                                        <><div className="w-2 h-2 rounded-full bg-emerald-500" /> Processing Complete</>
                                    )
                                )}
                            </span>
                            <span className="text-sm text-gray-400">
                                {scanStatus.processed} / {scanStatus.total} ({scanStatus.total > 0 ? Math.round((scanStatus.processed / scanStatus.total) * 100) : 0}%)
                            </span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                            <div
                                className={`h-2.5 rounded-full transition-all duration-500 ${scanStatus.state === 'paused' ? 'bg-yellow-500' : 'bg-primary'}`}
                                style={{ width: `${scanStatus.total > 0 ? (scanStatus.processed / scanStatus.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                        <div className="flex gap-6 mt-4 text-xs">
                            <div className="flex flex-col">
                                <span className="text-gray-500">Processed</span>
                                <span className="text-white text-lg font-medium">{scanStatus.processed}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-gray-500">Pending</span>
                                <span className="text-white text-lg font-medium">{scanStatus.pending}</span>
                            </div>
                            <div className="flex flex-col ml-auto text-right">
                                <span className="text-gray-500">Total in Database</span>
                                <span className="text-white text-lg font-medium">{scanStatus.total}</span>
                            </div>
                        </div>
                    </div>
                )}

                {scanStatus.state === 'idle' && scanStatus.pending === 0 && scanStatus.processed > 0 && !apiError && (
                    <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg flex items-start gap-3 text-emerald-400">
                        <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">All images processed successfully!</p>
                        </div>
                    </div>
                )}

                {apiError && (
                    <div className="mt-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex items-start gap-3 text-red-400">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">Action Failed</p>
                            <p className="text-sm opacity-90">{apiError}</p>
                        </div>
                    </div>
                )}

                {/* Live Log Viewer Viewer Header */}
                <div className="mt-8">
                    <button
                        onClick={() => setIsLogOpen(!isLogOpen)}
                        className="flex items-center justify-between w-full bg-[#161616] hover:bg-[#1a1a1a] border border-gray-800 rounded-t-xl px-4 py-3 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-gray-400" />
                            <span className="font-medium text-gray-300">Live Background Logs</span>
                            {scanStatus.state === 'running' && <span className="ml-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
                        </div>
                        {isLogOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                    </button>

                    {/* Collapsible Log Window */}
                    {isLogOpen && (
                        <div ref={logsContainerRef} className="bg-black border-x border-b border-gray-800 rounded-b-xl p-4 h-64 overflow-y-auto font-mono text-xs text-green-400 custom-scrollbar shadow-inner flex flex-col gap-1">
                            {logs.length === 0 ? (
                                <p className="text-gray-600 italic">No logs available...</p>
                            ) : (
                                logs.map((log, index) => (
                                    <div key={index} className="break-all border-b border-gray-900 pb-1">{log}</div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8 bg-surface rounded-2xl p-8 shadow-2xl border border-[#262626]">
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
                            onClick={fetchModels}
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

            {/* Database Integrity & Backups */}
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
                                        {b.filename} ({(b.size_bytes / 1024 / 1024).toFixed(2)} MB) - {new Date(b.created_at).toLocaleString()}
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

            {/* Appearance & Themes */}
            <div className="mt-8 bg-surface rounded-2xl p-8 shadow-2xl border border-[#262626]">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Palette className="w-6 h-6 text-primary" />
                    Appearance
                </h2>

                {/* Light / Dark Mode */}
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

                {/* Color Theme Swatches */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">Accent Color</label>
                    <div className="flex flex-wrap gap-4">
                        {COLOR_THEMES.map(theme => (
                            <button
                                key={theme.id}
                                title={theme.label}
                                onClick={() => { setThemeColor(theme.id); applyTheme(themeMode, theme.id); }}
                                className={`group flex flex-col items-center gap-2 transition-transform hover:scale-105`}
                            >
                                {/* Dual-tone swatch circle */}
                                <div
                                    className={`w-12 h-12 rounded-full border-4 transition-all shadow-md ${themeColor === theme.id
                                        ? 'border-white scale-110 shadow-white/30'
                                        : 'border-transparent opacity-70 hover:opacity-100'
                                        }`}
                                    style={{
                                        background: `linear-gradient(135deg, ${theme.primary} 50%, ${theme.secondary} 50%)`,
                                    }}
                                />
                                <span className={`text-xs font-medium ${themeColor === theme.id ? 'text-white' : 'text-gray-500'
                                    }`}>{theme.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="mt-8 bg-[#160000] rounded-2xl p-8 shadow-2xl border border-red-900/50">
                <h2 className="text-xl font-semibold text-red-400 mb-6 flex items-center gap-2">
                    <Trash2 className="w-6 h-6 text-red-500" />
                    Danger Zone
                </h2>
                <div className="flex gap-4">
                    <button
                        onClick={() => triggerCleanWarning('test')}
                        className="flex-1 bg-red-900/20 hover:bg-red-900/40 border border-red-800 text-red-400 font-medium px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" /> Clean Test Database
                    </button>
                    <button
                        onClick={() => triggerCleanWarning('main')}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                    >
                        <AlertTriangle className="w-5 h-5" /> Clean Main Gallery Database
                    </button>
                </div>
            </div>

            {/* Custom Confirm Modal Override */}
            {confirmModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setConfirmModal(null)}>
                    <div className="bg-surface border border-[#333] shadow-2xl rounded-2xl p-8 max-w-md w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-4 text-red-500 mb-4">
                            <AlertTriangle className="w-8 h-8" />
                            <h2 className="text-2xl font-bold text-white">Warning: Destructive Action</h2>
                        </div>
                        <div className="text-gray-300 text-lg mb-8 leading-relaxed">
                            {confirmModal.target === 'rescan' ? (
                                <p>You have already scanned <code className="text-blue-400 bg-[#161616] px-2 py-1 rounded break-all">{confirmModal.payload}</code> before.<br /><br />Do you want to <strong>Force Rescan</strong> it? This will re-analyze all images using the active AI models and overwrite any existing Face/Pet data.</p>
                            ) : confirmModal.target === 'restore' ? (
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
                            {confirmModal.target === 'rescan' ? (
                                <button onClick={handleConfirmNext} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-colors flex items-center gap-2">
                                    <FolderSearch className="w-4 h-4" />
                                    Force Rescan
                                </button>
                            ) : (
                                <button onClick={handleConfirmNext} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 transition-colors flex items-center gap-2">
                                    <Trash2 className="w-4 h-4" />
                                    {confirmModal.step === 1 && confirmModal.target === 'main' ? "Yes, Proceed" : "CONFIRM WIPE"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <div className="mt-8 text-center text-gray-600 text-xs font-mono pb-4">
                Local LLM Photo Scanner v{appVersion}
            </div>
            {/* Toast container */}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
