import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, FolderSearch, Pause, Play, Terminal, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { FolderScanStatus, ScanHistoryItem, ScanStatus } from '../types';

type ScanMode = 'ai' | 'folder';

type ConfirmModal = {
    target: 'rescan' | 'folder-rescan';
    payload?: string;
};

type ScanLog = {
    time: string;
    message: string;
};

function getApiErrorMessage(err: unknown, fallback: string) {
    if (axios.isAxiosError(err)) {
        const detail = err.response?.data && typeof err.response.data === 'object' && 'detail' in err.response.data
            ? err.response.data.detail
            : undefined;
        return typeof detail === 'string' ? detail : err.message || fallback;
    }
    return err instanceof Error ? err.message : fallback;
}

export default function ScanPage() {
    const [scanMode, setScanMode] = useState<ScanMode>('ai');
    const [path, setPath] = useState('');
    const [folderPath, setFolderPath] = useState('');
    const [ignoreScreenshots, setIgnoreScreenshots] = useState(false);
    const [useOllama, setUseOllama] = useState(true);
    const [useClip, setUseClip] = useState(true);
    const [extractFolderMetadata, setExtractFolderMetadata] = useState(true);
    const [apiError, setApiError] = useState('');
    const [activeModel] = useState(() => localStorage.getItem('activeModel') || '');

    const [scanStatus, setScanStatus] = useState<ScanStatus>({
        state: 'idle',
        total_gallery: 0,
        total_duplicates: 0,
        scan_total: 0,
        scan_processed: 0,
    });
    const [folderScanStatus, setFolderScanStatus] = useState<FolderScanStatus>({
        state: 'idle',
        scan_total: 0,
        scan_processed: 0,
    });

    const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
    const [folderScanHistory, setFolderScanHistory] = useState<ScanHistoryItem[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isFolderHistoryOpen, setIsFolderHistoryOpen] = useState(false);
    const [logs, setLogs] = useState<ScanLog[]>([]);
    const [folderLogs, setFolderLogs] = useState<ScanLog[]>([]);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);

    const isAiMode = scanMode === 'ai';
    const selectedPath = isAiMode ? path : folderPath;
    const selectedStatus = isAiMode ? scanStatus : folderScanStatus;
    const selectedHistory = isAiMode ? scanHistory : folderScanHistory;
    const selectedLogs = isAiMode ? logs : folderLogs;
    const isSelectedHistoryOpen = isAiMode ? isHistoryOpen : isFolderHistoryOpen;
    const accentClass = isAiMode ? 'text-primary' : 'text-indigo-400';
    const activeBorderClass = isAiMode ? 'border-primary bg-primary/5' : 'border-indigo-500 bg-indigo-500/5';
    const progressClass = selectedStatus.state === 'paused' ? 'bg-yellow-500' : isAiMode ? 'bg-primary' : 'bg-indigo-500';
    const runningDotClass = isAiMode ? 'bg-blue-500' : 'bg-indigo-500';
    const logTextClass = isAiMode ? 'text-green-400' : 'text-indigo-400';

    const setSelectedPath = (value: string) => {
        if (isAiMode) {
            setPath(value);
        } else {
            setFolderPath(value);
        }
    };

    const toggleHistory = () => {
        if (isAiMode) {
            setIsHistoryOpen(open => !open);
        } else {
            setIsFolderHistoryOpen(open => !open);
        }
    };

    const selectHistoryPath = (directoryPath: string) => {
        if (isAiMode) {
            setPath(directoryPath);
        } else {
            setFolderPath(directoryPath);
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/scan/history`);
            setScanHistory(res.data.history);
        } catch {
            console.error("Failed to fetch scan history");
        }
    };

    const fetchFolderHistory = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/folder-scan/history`);
            setFolderScanHistory(res.data.history);
        } catch {
            console.error("Failed to fetch folder scan history");
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchHistory();
        fetchFolderHistory();
    }, []);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const statusRes = await axios.get(`${API_BASE_URL}/api/scan/status`);
                setScanStatus(statusRes.data);

                if (statusRes.data.state !== 'idle' || (isLogOpen && scanMode === 'ai')) {
                    const res = await axios.get(`${API_BASE_URL}/api/scan/logs`);
                    setLogs(res.data.logs);
                }
            } catch {
                // Background polling should not interrupt the page.
            }

            try {
                const folderStatusRes = await axios.get(`${API_BASE_URL}/api/folder-scan/status`);
                setFolderScanStatus(folderStatusRes.data);

                if (folderStatusRes.data.state !== 'idle' || (isLogOpen && scanMode === 'folder')) {
                    const folderLogsRes = await axios.get(`${API_BASE_URL}/api/folder-scan/logs`);
                    setFolderLogs(folderLogsRes.data.logs);
                }
            } catch {
                // Background polling should not interrupt the page.
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isLogOpen, scanMode]);

    useEffect(() => {
        if (isLogOpen && logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
    }, [selectedLogs, isLogOpen]);

    const executeScan = async (force: boolean) => {
        setApiError('');
        try {
            await axios.post(`${API_BASE_URL}/api/scan`, {
                directory_path: path.trim(),
                force_rescan: force,
                ignore_screenshots: ignoreScreenshots,
                use_ollama: useOllama,
                use_clip: useClip,
                active_model: activeModel,
            });
            setPath('');
            setIsHistoryOpen(false);
            setIsLogOpen(true);
            setConfirmModal(null);
            fetchHistory();
        } catch (err: unknown) {
            setApiError(getApiErrorMessage(err, "Failed to start scan"));
        }
    };

    const executeFolderScan = async (force: boolean) => {
        setApiError('');
        try {
            await axios.post(`${API_BASE_URL}/api/folder-scan`, {
                directory_path: folderPath.trim(),
                force_rescan: force,
                extract_metadata: extractFolderMetadata,
            });
            setFolderPath('');
            setIsFolderHistoryOpen(false);
            setIsLogOpen(true);
            setConfirmModal(null);
            fetchFolderHistory();
        } catch (err: unknown) {
            setApiError(getApiErrorMessage(err, "Failed to start folder scan"));
        }
    };

    const handleScan = async (e: FormEvent) => {
        e.preventDefault();
        if (!path.trim()) return;

        const alreadyScanned = scanHistory.some(item => item.directory_path.toLowerCase() === path.trim().toLowerCase());
        if (alreadyScanned) {
            setConfirmModal({ target: 'rescan', payload: path.trim() });
            return;
        }

        executeScan(false);
    };

    const handleFolderScan = async (e: FormEvent) => {
        e.preventDefault();
        if (!folderPath.trim()) return;

        const alreadyScanned = folderScanHistory.some(item => item.directory_path.toLowerCase() === folderPath.trim().toLowerCase());
        if (alreadyScanned) {
            setConfirmModal({ target: 'folder-rescan', payload: folderPath.trim() });
            return;
        }

        executeFolderScan(false);
    };

    const handleSubmit = (e: FormEvent) => {
        if (isAiMode) {
            handleScan(e);
        } else {
            handleFolderScan(e);
        }
    };

    const handleControlAction = async (action: 'pause' | 'resume' | 'cancel') => {
        try {
            await axios.post(`${API_BASE_URL}/api/scan/control`, { action, active_model: activeModel });
        } catch (err: unknown) {
            setApiError(getApiErrorMessage(err, `Failed to ${action} scan`));
        }
    };

    const handleFolderControlAction = async (action: 'pause' | 'resume' | 'cancel') => {
        try {
            await axios.post(`${API_BASE_URL}/api/folder-scan/control`, { action });
        } catch (err: unknown) {
            setApiError(getApiErrorMessage(err, `Failed to ${action} folder scan`));
        }
    };

    const handleSelectedControlAction = (action: 'pause' | 'resume' | 'cancel') => {
        if (isAiMode) {
            handleControlAction(action);
        } else {
            handleFolderControlAction(action);
        }
    };

    const handleConfirmNext = () => {
        if (!confirmModal) return;
        if (confirmModal.target === 'rescan') {
            executeScan(true);
        } else {
            executeFolderScan(true);
        }
        setConfirmModal(null);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <FolderSearch className="text-primary w-8 h-8" />
                    Scan
                </h1>
                <p className="text-gray-400 mt-2 text-lg">Run AI-powered gallery scans or local folder metadata scans.</p>
            </div>

            <div className="bg-surface rounded-2xl p-8 shadow-2xl border border-[#262626]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <FolderSearch className={`w-6 h-6 ${accentClass}`} />
                        Local Scan
                    </h2>
                    <div className="flex rounded-xl border border-gray-800 bg-[#111] p-1">
                        <button
                            type="button"
                            aria-pressed={isAiMode}
                            onClick={() => setScanMode('ai')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isAiMode ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            AI Gallery
                        </button>
                        <button
                            type="button"
                            aria-pressed={!isAiMode}
                            onClick={() => setScanMode('folder')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!isAiMode ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Non-AI Folder
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            {isAiMode ? 'Photo Directory' : 'Scan Folder Path'}
                        </label>
                        <div
                            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-text ${selectedPath
                                ? activeBorderClass
                                : 'border-gray-700 bg-surface hover:border-gray-500'
                                }`}
                            onClick={() => {
                                const input = document.getElementById('scan-path-input');
                                if (input) input.focus();
                            }}
                        >
                            <FolderSearch className={`w-8 h-8 mb-3 ${selectedPath ? accentClass : 'text-gray-500'}`} />
                            <input
                                id="scan-path-input"
                                type="text"
                                value={selectedPath}
                                onChange={(e) => setSelectedPath(e.target.value)}
                                placeholder={isAiMode ? 'Type or paste folder path...' : 'Type or paste folder path to scan...'}
                                className="w-full bg-transparent text-center text-white font-mono text-sm placeholder-gray-500 focus:outline-none border-none"
                            />
                            <p className="text-xs text-gray-500 mt-3">
                                {selectedPath
                                    ? isAiMode ? 'All images in this directory will be scanned recursively' : 'Folder and nested subfolders will be recursively indexed'
                                    : isAiMode ? 'e.g. C:\\Users\\John\\Pictures or /home/john/Pictures' : 'e.g. D:\\Photos\\2026 or /home/user/Pictures'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        {isAiMode && (
                            <>
                                <div className="flex items-center gap-3 bg-[#111] p-4 rounded-xl border border-gray-800">
                                    <input
                                        type="checkbox"
                                        id="useOllama"
                                        checked={useOllama}
                                        onChange={(e) => setUseOllama(e.target.checked)}
                                        className="w-5 h-5 text-primary border-gray-700 rounded focus:ring-primary focus:ring-offset-gray-900 bg-[#161616]"
                                    />
                                    <label htmlFor="useOllama" className="text-sm text-gray-300 font-medium cursor-pointer flex-1">
                                        Generate Ollama Text Descriptions <span className="text-gray-500 font-normal ml-1">(Slower, but enables text-based photo details. Used as fallback for missing explicit tags)</span>
                                    </label>
                                </div>

                                <div className="flex items-center gap-3 bg-[#111] p-4 rounded-xl border border-gray-800">
                                    <input
                                        type="checkbox"
                                        id="useClip"
                                        checked={useClip}
                                        onChange={(e) => setUseClip(e.target.checked)}
                                        className="w-5 h-5 text-primary border-gray-700 rounded focus:ring-primary focus:ring-offset-gray-900 bg-[#161616]"
                                    />
                                    <label htmlFor="useClip" className="text-sm text-gray-300 font-medium cursor-pointer flex-1">
                                        Generate CLIP Visual Embeddings <span className="text-gray-500 font-normal ml-1">(Instantaneous. Powers pure text-to-image semantic search perfectly without an LLM)</span>
                                    </label>
                                </div>

                                <div className="flex items-center gap-3 bg-[#111] p-4 rounded-xl border border-gray-800">
                                    <input
                                        type="checkbox"
                                        id="ignoreScreenshots"
                                        checked={ignoreScreenshots}
                                        onChange={(e) => setIgnoreScreenshots(e.target.checked)}
                                        className="w-5 h-5 text-primary border-gray-700 rounded focus:ring-primary focus:ring-offset-gray-900 bg-[#161616]"
                                    />
                                    <label htmlFor="ignoreScreenshots" className="text-sm text-gray-300 font-medium cursor-pointer flex-1">
                                        Ignore Screenshots <span className="text-gray-500 font-normal ml-1">(Skips files with "screenshot" in name or AI description)</span>
                                    </label>
                                </div>
                            </>
                        )}

                        <div className="flex items-center gap-3 bg-[#111] p-4 rounded-xl border border-gray-800">
                            <input
                                type="checkbox"
                                id="extractFolderMetadata"
                                checked={extractFolderMetadata}
                                onChange={(e) => setExtractFolderMetadata(e.target.checked)}
                                className="w-5 h-5 text-indigo-500 border-gray-700 rounded focus:ring-indigo-500 focus:ring-offset-gray-900 bg-[#161616]"
                            />
                            <label htmlFor="extractFolderMetadata" className="text-sm text-gray-300 font-medium cursor-pointer flex-1">
                                Extract Rich Media Metadata <span className="text-gray-500 font-normal ml-1">(Used by non-AI folder scans; AI scans already enrich image metadata during processing)</span>
                            </label>
                        </div>
                    </div>

                    {selectedHistory.length > 0 && (
                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={toggleHistory}
                                className="flex items-center justify-between w-full bg-[#161616] hover:bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 transition-colors text-sm"
                            >
                                <div className="flex items-center gap-2">
                                    <FolderSearch className={`w-4 h-4 ${accentClass}`} />
                                    <span className="font-medium text-gray-300">Recently Scanned Folders</span>
                                </div>
                                {isSelectedHistoryOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                            </button>

                            {isSelectedHistoryOpen && (
                                <div className="bg-black border-x border-b border-gray-800 rounded-b-lg p-2 max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-1 -mt-1 pt-3">
                                    {selectedHistory.map((item, index) => (
                                        <button
                                            key={`${item.directory_path}-${index}`}
                                            type="button"
                                            onClick={() => selectHistoryPath(item.directory_path)}
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

                    {selectedStatus.state === 'idle' ? (
                        <button
                            type="submit"
                            disabled={!selectedPath.trim()}
                            className={`${isAiMode ? 'bg-primary hover:bg-blue-600' : 'bg-indigo-600 hover:bg-indigo-500'} disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2`}
                        >
                            {isAiMode ? 'Start Background Scan' : 'Start Non-AI Scan'}
                        </button>
                    ) : (
                        <div className="flex items-center gap-3">
                            {selectedStatus.state === 'running' ? (
                                <button type="button" onClick={() => handleSelectedControlAction('pause')} className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2">
                                    <Pause className="w-5 h-5" /> Pause Scan
                                </button>
                            ) : (
                                <button type="button" onClick={() => handleSelectedControlAction('resume')} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2">
                                    <Play className="w-5 h-5" /> Resume Scan
                                </button>
                            )}
                            <button type="button" onClick={() => handleSelectedControlAction('cancel')} className="bg-red-500/20 hover:bg-red-500/30 text-red-500 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2">
                                <XCircle className="w-5 h-5" /> {isAiMode ? 'Cancel All Pending' : 'Cancel Scan'}
                            </button>
                        </div>
                    )}
                </form>

                {selectedStatus.scan_total > 0 && selectedStatus.state !== 'idle' && (
                    <div className="mt-8 bg-[#111] p-6 rounded-xl border border-gray-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                {selectedStatus.state === 'running' ? (
                                    <><div className={`w-2 h-2 rounded-full ${runningDotClass} animate-pulse`} /> {isAiMode ? 'Processing Images...' : 'Scanning Files...'}</>
                                ) : selectedStatus.state === 'paused' ? (
                                    <><div className="w-2 h-2 rounded-full bg-yellow-500" /> Paused</>
                                ) : (
                                    <><div className="w-2 h-2 rounded-full bg-gray-500" /> Preparing</>
                                )}
                            </span>
                            <span className="text-sm text-gray-400">
                                {selectedStatus.scan_processed} / {selectedStatus.scan_total} ({selectedStatus.scan_total > 0 ? Math.round((selectedStatus.scan_processed / selectedStatus.scan_total) * 100) : 0}%)
                            </span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                            <div
                                className={`h-2.5 rounded-full transition-all duration-500 ${progressClass}`}
                                style={{ width: `${selectedStatus.scan_total > 0 ? (selectedStatus.scan_processed / selectedStatus.scan_total) * 100 : 0}%` }}
                            ></div>
                        </div>
                        <div className="flex gap-6 mt-4 text-xs">
                            <div className="flex flex-col">
                                <span className="text-gray-500">Processed in Active Scan</span>
                                <span className="text-white text-lg font-medium">{selectedStatus.scan_processed}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-gray-500">Remaining in Queue</span>
                                <span className="text-white text-lg font-medium">{selectedStatus.scan_total - selectedStatus.scan_processed}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-[#111] p-4 rounded-xl border border-gray-800 flex justify-between items-center">
                        <span className="text-sm text-gray-400">Total in Gallery</span>
                        <span className="text-white text-lg font-medium">{scanStatus.total_gallery}</span>
                    </div>
                    <div className="bg-[#111] p-4 rounded-xl border border-gray-800 flex justify-between items-center">
                        <span className="text-sm text-gray-400">Duplicates Avoided</span>
                        <span className="text-white text-lg font-medium">{scanStatus.total_duplicates}</span>
                    </div>
                </div>

                {selectedStatus.state === 'idle' && selectedStatus.scan_processed > 0 && selectedStatus.scan_processed === selectedStatus.scan_total && !apiError && (
                    <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg flex items-start gap-3 text-emerald-400">
                        <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">Recent processing complete!</p>
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

                <div className="mt-8">
                    <button
                        onClick={() => setIsLogOpen(open => !open)}
                        className="flex items-center justify-between w-full bg-[#161616] hover:bg-[#1a1a1a] border border-gray-800 rounded-t-xl px-4 py-3 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-gray-400" />
                            <span className="font-medium text-gray-300">Live Scan Logs</span>
                            {selectedStatus.state === 'running' && <span className={`ml-2 w-2 h-2 rounded-full ${runningDotClass} animate-pulse`}></span>}
                        </div>
                        {isLogOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                    </button>

                    {isLogOpen && (
                        <div ref={logsContainerRef} className={`bg-black border-x border-b border-gray-800 rounded-b-xl p-4 h-64 overflow-y-auto font-mono text-xs ${logTextClass} custom-scrollbar shadow-inner flex flex-col gap-1`}>
                            {selectedLogs.length === 0 ? (
                                <p className="text-gray-600 italic">No logs available...</p>
                            ) : (
                                selectedLogs.map((log, index) => (
                                    <div key={`${log.time}-${index}`} className="break-all border-b border-gray-900 pb-1">
                                        <span className="text-gray-500 mr-2">[{log.time}]</span>
                                        {log.message}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

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
                            ) : (
                                <p>You have already scanned folder <code className="text-blue-400 bg-[#161616] px-2 py-1 rounded break-all">{confirmModal.payload}</code> before.<br /><br />Do you want to <strong>Force Rescan</strong> it? This will clear older records for this folder and rebuild metadata from scratch.</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 font-medium">
                            <button onClick={() => setConfirmModal(null)} className="px-5 py-2.5 rounded-xl bg-[#262626] hover:bg-[#333] text-gray-300 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleConfirmNext} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-colors flex items-center gap-2">
                                <FolderSearch className="w-4 h-4" />
                                Force Rescan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
