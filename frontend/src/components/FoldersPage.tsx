import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import axios from 'axios';
import {
    Folder,
    File,
    Video,
    Image as ImageIcon,
    Home,
    Copy,
    ExternalLink,
    Calendar,
    X,
    ChevronLeft,
    ChevronRight,
    Play,
    Info,
    FolderOpen,
    Clock,
    Filter,
    Zap,
    Download,
    Maximize2,
    Sparkles,
    Loader2,
    CheckCircle,
    Search
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import type { LocalMediaItem, FolderExplorerResponse, DateDrilldownItem, DuplicateReportResponse } from '../types';
import { useToast, ToastContainer } from './Toast';
import LazyImage from './shared/LazyImage';

// Lazy-load the Video.js v10 player so its bundle (~200KB) is only fetched
// when the user first opens a video file — keeps initial page load lean.
const VideoPlayer = lazy(() => import('./VideoPlayer'));

export default function FoldersPage() {
    const { year, month, day } = useParams();
    const navigate = useNavigate();

    // Mode: 'explorer' (File Explorer), 'timeline' (Timeline drilldown), or 'duplicates' (hash report)
    // Make 'timeline' the default view
    const [viewMode, setViewMode] = useState<'explorer' | 'timeline' | 'duplicates'>('timeline');

    // Advanced Filters states
    const [fromDate, setFromDate] = useState<string>('');
    const [toDate, setToDate] = useState<string>('');
    const [mediaTypes, setMediaTypes] = useState<string>('all');
    const [fileNameQuery, setFileNameQuery] = useState<string>('');
    const [debouncedFileNameQuery, setDebouncedFileNameQuery] = useState<string>('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedFileNameQuery(fileNameQuery);
        }, 300);
        return () => clearTimeout(handler);
    }, [fileNameQuery]);
    const [showThumbnails, setShowThumbnails] = useState<boolean>(false);

    // FFmpeg transcoding state
    const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean>(false);
    const [transcodeQuality, setTranscodeQuality] = useState<'fast' | 'balanced' | 'quality'>('balanced');

    const [fromYearSelect, setFromYearSelect] = useState<string>('');
    const [fromMonthSelect, setFromMonthSelect] = useState<string>('');
    const [toYearSelect, setToYearSelect] = useState<string>('');
    const [toMonthSelect, setToMonthSelect] = useState<string>('');

    const monthsList = useMemo(() => [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ], []);

    const yearsRange = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const startYear = 1990;
        const list = [];
        for (let y = currentYear + 5; y >= startYear; y--) {
            list.push(y.toString());
        }
        return list;
    }, []);

    // Sync date pickers and dropdowns
    const handleDatePickerChange = (val: string, type: 'from' | 'to') => {
        if (type === 'from') {
            setFromDate(val);
            if (val) {
                const parts = val.split('-');
                if (parts.length === 3) {
                    setFromYearSelect(parts[0]);
                    setFromMonthSelect(parts[1]);
                }
            } else {
                setFromYearSelect('');
                setFromMonthSelect('');
            }
        } else {
            setToDate(val);
            if (val) {
                const parts = val.split('-');
                if (parts.length === 3) {
                    setToYearSelect(parts[0]);
                    setToMonthSelect(parts[1]);
                }
            } else {
                setToYearSelect('');
                setToMonthSelect('');
            }
        }
    };

    const handleDropdownChange = (year: string, month: string, type: 'from' | 'to') => {
        if (type === 'from') {
            setFromYearSelect(year);
            setFromMonthSelect(month);
            if (year) {
                const m = month || '01';
                setFromDate(`${year}-${m}-01`);
            } else {
                setFromDate('');
            }
        } else {
            setToYearSelect(year);
            setToMonthSelect(month);
            if (year) {
                if (month) {
                    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                    const dStr = String(lastDay).padStart(2, '0');
                    setToDate(`${year}-${month}-${dStr}`);
                } else {
                    setToDate(`${year}-12-31`);
                }
            } else {
                setToDate('');
            }
        }
    };

    const clearFilters = () => {
        setFromDate('');
        setToDate('');
        setFromYearSelect('');
        setFromMonthSelect('');
        setToYearSelect('');
        setToMonthSelect('');
        setMediaTypes('all');
        setFileNameQuery('');
        setShowThumbnails(false);
        setTranscodeQuality('balanced');
    };


    // Explorer states
    const [currentPath, setCurrentPath] = useState<string>('');
    const [explorerData, setExplorerData] = useState<FolderExplorerResponse>({
        current_path: '',
        parent_path: null,
        directories: [],
        files: []
    });

    // Timeline states
    const [timelineYear, setTimelineYear] = useState<number | null>(null);
    const [timelineMonth, setTimelineMonth] = useState<number | null>(null);
    const [timelineDay, setTimelineDay] = useState<number | null>(null);
    const [timelineDrilldownItems, setTimelineDrilldownItems] = useState<DateDrilldownItem[]>([]);
    const [timelineFiles, setTimelineFiles] = useState<LocalMediaItem[]>([]);
    const [fileNameResults, setFileNameResults] = useState<LocalMediaItem[]>([]);

    // Exact hash duplicate report states
    const [duplicateReport, setDuplicateReport] = useState<DuplicateReportResponse | null>(null);
    const [duplicateReportPage, setDuplicateReportPage] = useState<number>(1);
    const [duplicateReportPageSize, setDuplicateReportPageSize] = useState<10 | 20 | 50>(10);
    const [duplicateCategory, setDuplicateCategory] = useState<'exact_hash' | 'invalid_media_stub'>('exact_hash');



    // Global UI states
    const [loading, setLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<LocalMediaItem | null>(null);
    const [duplicatesData, setDuplicatesData] = useState<{
        local_duplicates: any[];
        gallery_duplicates: any[];
    } | null>(null);
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
    const [imageFullSize, setImageFullSize] = useState(false);
    const [aiProgress, setAiProgress] = useState<{
        active: boolean;
        complete: boolean;
        mode: 'full' | 'clip';
        filepath: string;
        lines: string[];
        error?: string;
    } | null>(null);

    const { toasts, dismiss, error: toastError, success: toastSuccess } = useToast();
    const filesContainerRef = useRef<HTMLDivElement>(null);
    const trimmedFileNameQuery = debouncedFileNameQuery.trim();
    const searchingByFileName = trimmedFileNameQuery.length > 0;

    // Check FFmpeg availability once on mount
    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/system/check-ffmpeg`)
            .then(res => setFfmpegAvailable(res.data?.available === true))
            .catch(() => setFfmpegAvailable(false));
    }, []);

    // Fetch hierarchical explorer folder
    const fetchExplorer = async (path: string = '') => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/folder-scan/explorer?path=${encodeURIComponent(path)}`);
            setExplorerData(res.data);
            setCurrentPath(res.data.current_path);
        } catch (err: any) {
            console.error(err);
            toastError(err.response?.data?.detail || 'Failed to fetch directory contents.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch timeline drilldown list or files
    const fetchTimeline = async (year: number | null, month: number | null, day: number | null) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (year !== null) params.set('year', year.toString());
            if (month !== null) params.set('month', month.toString());
            if (day !== null) params.set('day', day.toString());

            if (fromDate) params.set('from_date', fromDate);
            if (toDate) params.set('to_date', toDate);
            if (mediaTypes !== 'all') params.set('media_types', mediaTypes);

            const res = await axios.get(`${API_BASE_URL}/api/folder-scan/dates?${params.toString()}`);
            if (year !== null && month !== null && day !== null) {
                // Returns files list directly
                setTimelineFiles(res.data);
                setTimelineDrilldownItems([]);
            } else {
                // Returns hierarchical date list
                setTimelineDrilldownItems(res.data);
                setTimelineFiles([]);
            }
        } catch (err) {
            console.error(err);
            toastError('Failed to fetch timeline records.');
        } finally {
            setLoading(false);
        }
    };

    const buildDuplicateReportParams = (includePagination = false) => {
        const params = new URLSearchParams();
        params.set('category', duplicateCategory);
        if (fromDate) params.set('from_date', fromDate);
        if (toDate) params.set('to_date', toDate);
        if (mediaTypes !== 'all' && mediaTypes !== 'invalid_media_stub') params.set('media_type', mediaTypes);
        if (includePagination) {
            params.set('page', duplicateReportPage.toString());
            params.set('page_size', duplicateReportPageSize.toString());
        }
        return params;
    };

    const fetchDuplicateReport = async () => {
        setLoading(true);
        try {
            const params = buildDuplicateReportParams(true);
            const res = await axios.get(`${API_BASE_URL}/api/folder-scan/duplicates/report?${params.toString()}`, {
                timeout: 60000,
            });
            setDuplicateReport(res.data);
        } catch (err: any) {
            console.error(err);
            toastError(err.code === 'ECONNABORTED' ? 'Duplicate report timed out. Restart the backend so indexes can be created, then try again.' : 'Failed to fetch duplicate report.');
        } finally {
            setLoading(false);
        }
    };

    const fetchFileNameResults = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('filename', trimmedFileNameQuery);
            params.set('sort_by', 'filename');
            params.set('sort_dir', 'asc');
            if (fromDate) params.set('date_from', fromDate);
            if (toDate) params.set('date_to', toDate);
            if (mediaTypes === 'image' || mediaTypes === 'video') params.set('media_type', mediaTypes);

            const res = await axios.get(`${API_BASE_URL}/api/folder-scan/search?${params.toString()}`);
            setFileNameResults(res.data);
        } catch (err) {
            console.error(err);
            toastError('Failed to search filenames.');
        } finally {
            setLoading(false);
        }
    };



    // Trigger open file in native OS player
    const openInSystemPlayer = async (filepath: string) => {
        try {
            await axios.get(`${API_BASE_URL}/api/system/open-file?path=${encodeURIComponent(filepath)}`);
            toastSuccess(`Opened file in system player.`);
        } catch (err: any) {
            console.error(err);
            toastError(err.response?.data?.detail || 'Failed to open file in system.');
        }
    };

    // Trigger open file location in native OS file explorer
    const openInSystemExplorer = async (filepath: string) => {
        try {
            await axios.get(`${API_BASE_URL}/api/system/open-location?path=${encodeURIComponent(filepath)}`);
            toastSuccess(`Opened file location.`);
        } catch (err: any) {
            console.error(err);
            toastError(err.response?.data?.detail || 'Failed to open file location.');
        }
    };


    // Fetch duplicate locations for media
    const fetchDuplicates = async (mediaId: number) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/folder-scan/duplicates/${mediaId}`);
            setDuplicatesData(res.data);
        } catch (err) {
            console.error(err);
            toastError('Failed to check for duplicate locations.');
        }
    };

    // Sync URL parameters with timeline states
    useEffect(() => {
        if (viewMode === 'timeline') {
            const yVal = year ? parseInt(year) : null;
            const mVal = month ? parseInt(month) : null;
            const dVal = day ? parseInt(day) : null;

            setTimelineYear(yVal);
            setTimelineMonth(mVal);
            setTimelineDay(dVal);
        }
    }, [year, month, day, viewMode]);

    // Reset timeline drilldown selection when filters change by resetting route
    useEffect(() => {
        if (viewMode === 'timeline') {
            navigate('/folders');
        }
    }, [fromDate, toDate, mediaTypes, duplicateCategory, viewMode]);

    useEffect(() => {
        if (viewMode === 'duplicates') {
            setDuplicateReportPage(1);
        }
    }, [fromDate, toDate, mediaTypes, viewMode]);

    // Handle updates when drilling timeline, changing viewMode or when filters change
    useEffect(() => {
        if (searchingByFileName && viewMode !== 'duplicates') {
            fetchFileNameResults();
            return;
        }

        setFileNameResults([]);
        if (viewMode === 'explorer') {
            fetchExplorer(currentPath);
        } else if (viewMode === 'timeline') {
            fetchTimeline(timelineYear, timelineMonth, timelineDay);
        } else {
            fetchDuplicateReport();
        }
    }, [viewMode, currentPath, timelineYear, timelineMonth, timelineDay, fromDate, toDate, mediaTypes, duplicateCategory, duplicateReportPage, duplicateReportPageSize, trimmedFileNameQuery, searchingByFileName]);

    // Format byte sizes into readable form
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Formats the browser can decode natively — served via /media endpoint.
    const isNativelySupported = (filename: string): boolean => {
        const ext = filename.split('.').pop()?.toLowerCase();
        return [
            'mp4', 'webm', 'ogg',   // universally supported
            'mov', 'm4v',            // modern browsers handle these
            'mkv',                   // H.264/H.265 container
            'mts', 'm2ts',           // AVCHD camera formats
        ].includes(ext || '');
    };

    // Formats that require FFmpeg transcoding to be browser-playable.
    const isTranscodeable = (filename: string): boolean => {
        const ext = filename.split('.').pop()?.toLowerCase();
        return [
            'avi', 'wmv', 'flv', '3gp', 'mpg', 'mpeg',
            'divx', 'rm', 'rmvb', 'asf', 'vob', 'ts',
            'ogv', 'f4v',
        ].includes(ext || '');
    };

    // Build the URL for a transcoded video stream.
    const getTranscodeUrl = (filepath: string): string =>
        `${API_BASE_URL}/api/folder-scan/transcode?path=${encodeURIComponent(filepath)}&quality=${transcodeQuality}`;

    // Breadcrumbs list generator
    const breadcrumbs = useMemo(() => {
        if (!currentPath) return [];
        // Support Windows and Unix path separators
        const delimiter = currentPath.includes('\\') ? '\\' : '/';
        const parts = currentPath.split(delimiter).filter(Boolean);
        const list: { name: string; path: string }[] = [];

        // Build running path
        let runningPath = '';
        if (currentPath.startsWith('\\\\')) {
            // Network share
            runningPath = '\\\\';
        } else if (currentPath.startsWith('/')) {
            runningPath = '/';
        }

        parts.forEach((p, idx) => {
            if (idx === 0 && currentPath.includes(':')) {
                // Windows Drive Letter
                runningPath = p + delimiter;
            } else {
                runningPath = runningPath + (runningPath.endsWith(delimiter) || runningPath === '/' || runningPath === '\\\\' ? '' : delimiter) + p;
            }
            list.push({ name: p, path: runningPath });
        });

        return list;
    }, [currentPath]);

    // Active files list in current view (for player next/prev tracking)
    const activeFileList = useMemo(() => {
        if (searchingByFileName && viewMode !== 'duplicates') return fileNameResults;
        if (viewMode === 'explorer') return explorerData.files;
        if (viewMode === 'timeline') return timelineFiles;
        return [];
    }, [viewMode, explorerData.files, timelineFiles, fileNameResults, searchingByFileName]);

    // Groups active files by Year-Month to generate Date Slider notches
    const groupedFileDates = useMemo(() => {
        const groups: { [key: string]: { label: string; elementId: string; year: number; month: number } } = {};
        activeFileList.forEach((file) => {
            const date = file.date_taken || file.date_modified || file.date_created;
            if (date && date.length >= 7) {
                const year = parseInt(date.substring(0, 4));
                const month = parseInt(date.substring(5, 7));
                if (!isNaN(year) && !isNaN(month)) {
                    const key = `${year}-${month}`;
                    if (!groups[key]) {
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        groups[key] = {
                            label: `${monthNames[month - 1]} ${year}`,
                            elementId: `file-group-${year}-${month}`,
                            year,
                            month
                        };
                    }
                }
            }
        });
        return Object.values(groups).sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });
    }, [activeFileList]);

    // Render duplicates indicators or button clickers
    const openDuplicatesModal = (e: React.MouseEvent, file: LocalMediaItem) => {
        e.stopPropagation();
        setSelectedFile(file);
        fetchDuplicates(file.id);
        setShowDuplicatesModal(true);
    };

    // Scroll container to target group
    const scrollToGroup = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Next/Prev media player controls
    const navigatePlayer = (direction: 'next' | 'prev') => {
        if (!selectedFile) return;
        const idx = activeFileList.findIndex((f) => f.id === selectedFile.id);
        if (idx === -1) return;

        let nextIdx = direction === 'next' ? idx + 1 : idx - 1;
        if (nextIdx >= activeFileList.length) nextIdx = 0;
        if (nextIdx < 0) nextIdx = activeFileList.length - 1;

        const nextFile = activeFileList[nextIdx];
        setSelectedFile(nextFile);
        setDuplicatesData(null); // Reset duplicate cache panel
    };

    // Serve URL source safely
    const getMediaUrl = (filepath: string) => {
        return `${API_BASE_URL}/api/folder-scan/media?path=${encodeURIComponent(filepath)}`;
    };

    const sendImageToAi = async (mode: 'full' | 'clip') => {
        if (!selectedFile || selectedFile.media_type !== 'image') return;

        const progressLabel = mode === 'full' ? 'Full AI' : 'CLIP AI';
        setAiProgress({
            active: true,
            complete: false,
            mode,
            filepath: selectedFile.filepath,
            lines: [`Queued ${progressLabel} for: ${selectedFile.filepath}`],
        });

        try {
            const res = await axios.post(`${API_BASE_URL}/api/scan/file`, {
                filepath: selectedFile.filepath,
                use_ollama: mode === 'full',
                use_clip: true
            });
            if (res.data?.status === 'processed') {
                setAiProgress(prev => prev
                    ? { ...prev, complete: true, lines: [...prev.lines, 'Image is already processed in the AI gallery.', 'AI scan complete.'] }
                    : prev);
            }
        } catch (err: any) {
            console.error(err);
            setAiProgress(prev => prev
                ? { ...prev, complete: true, error: err.response?.data?.detail || 'Failed to queue image for AI processing.' }
                : prev);
        }
    };

    useEffect(() => {
        if (!aiProgress?.active || aiProgress.complete) return;

        let cancelled = false;
        const poll = async () => {
            try {
                const [logsRes, statusRes] = await Promise.all([
                    axios.get(`${API_BASE_URL}/api/scan/logs`),
                    axios.get(`${API_BASE_URL}/api/scan/status`),
                ]);
                if (cancelled) return;

                const filepath = aiProgress.filepath;
                const logMessages = [...(logsRes.data?.logs || [])]
                    .reverse()
                    .map((log: any) => String(log.message || ''))
                    .filter((message: string) =>
                        message.includes(filepath) ||
                        message === 'Background processor finished queue.'
                    );

                setAiProgress(prev => {
                    if (!prev || prev.complete) return prev;
                    const merged = [...prev.lines];
                    for (const message of logMessages) {
                        if (!merged.includes(message)) merged.push(message);
                    }
                    const isIdle = statusRes.data?.state === 'idle';
                    const finished = isIdle && merged.some(line => line === 'Background processor finished queue.');
                    if (finished && !merged.includes('AI scan complete.')) {
                        merged.push('AI scan complete.');
                    }
                    return { ...prev, lines: merged, complete: finished };
                });
            } catch (err) {
                console.error(err);
            }
        };

        poll();
        const id = window.setInterval(poll, 1500);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [aiProgress?.active, aiProgress?.complete, aiProgress?.filepath]);

    useEffect(() => {
        if (!aiProgress?.complete) return;
        const id = window.setTimeout(() => setAiProgress(null), 4500);
        return () => window.clearTimeout(id);
    }, [aiProgress?.complete]);

    const getMediaPreviewUrl = (filepath: string) => {
        return `${API_BASE_URL}/api/folder-scan/media-preview?path=${encodeURIComponent(filepath)}`;
    };

    const getDuplicateReportCsvUrl = () => {
        const params = buildDuplicateReportParams();
        return `${API_BASE_URL}/api/folder-scan/duplicates/report.csv?${params.toString()}`;
    };

    const invalidStubReport = duplicateCategory === 'invalid_media_stub';

    return (
        <div className="p-8 pb-20 w-full h-full relative flex flex-col">
            {/* Header section */}
            <div className="max-w-7xl w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-4 mb-8 shrink-0">
                <div>
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 tracking-tight flex items-center gap-3">
                        <FolderOpen className="w-10 h-10 text-blue-500" />
                        Local Folder Explorer
                    </h1>
                    <p className="text-textMuted text-sm mt-1">
                        Browse, view, and analyze local folders and video metadata (Non-AI processing)
                    </p>
                </div>

                {/* View toggler */}
                <div className="flex bg-surface p-1 rounded-xl border border-gray-800">
                    <button
                        onClick={() => { setViewMode('explorer'); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'explorer' ? 'bg-primary text-white' : 'text-textMuted hover:text-white'
                            }`}
                    >
                        <Folder className="w-4 h-4" />
                        File Explorer
                    </button>
                    <button
                        onClick={() => { setViewMode('timeline'); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'timeline' ? 'bg-primary text-white' : 'text-textMuted hover:text-white'
                            }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Timeline Explorer
                    </button>
                    <button
                        onClick={() => { setViewMode('duplicates'); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'duplicates' ? 'bg-primary text-white' : 'text-textMuted hover:text-white'
                            }`}
                    >
                        <Copy className="w-4 h-4" />
                        Duplicate Report
                    </button>
                </div>
            </div>

            {/* Timeline Filter Panel */}
            <div className="max-w-7xl w-full mx-auto mb-6 shrink-0 p-5 bg-surface border border-gray-800 rounded-2xl shadow-xl flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                    <h3 className="text-xs font-bold text-gray-200 tracking-wider uppercase flex items-center gap-2">
                        <Filter className="w-4 h-4 text-indigo-400" /> Filter Media Timeline
                    </h3>
                    <button
                        onClick={clearFilters}
                        className="text-xs text-textMuted hover:text-white flex items-center gap-1 hover:underline transition-colors"
                    >
                        Clear Filters
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Filename filter */}
                    <div className="space-y-2">
                        <label htmlFor="folder-filename-filter" className="block text-xs font-semibold text-gray-400">Filename</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                id="folder-filename-filter"
                                type="text"
                                value={fileNameQuery}
                                onChange={(e) => setFileNameQuery(e.target.value)}
                                placeholder="Full or partial name"
                                className="w-full pl-9 pr-3 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-xs"
                            />
                        </div>
                    </div>

                    {/* From Date filters */}
                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-gray-400">From Date</label>
                        <div className="flex flex-col gap-2">
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => handleDatePickerChange(e.target.value, 'from')}
                                className="w-full px-3 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-xs"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={fromYearSelect}
                                    onChange={(e) => handleDropdownChange(e.target.value, fromMonthSelect, 'from')}
                                    className="px-2 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                                >
                                    <option value="">Any Year</option>
                                    {yearsRange.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <select
                                    value={fromMonthSelect}
                                    onChange={(e) => handleDropdownChange(fromYearSelect, e.target.value, 'from')}
                                    className="px-2 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                                >
                                    <option value="">Any Month</option>
                                    {monthsList.map((m, idx) => {
                                        const val = String(idx + 1).padStart(2, '0');
                                        return <option key={val} value={val}>{m}</option>;
                                    })}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* To Date filters */}
                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-gray-400">To Date</label>
                        <div className="flex flex-col gap-2">
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => handleDatePickerChange(e.target.value, 'to')}
                                className="w-full px-3 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-xs"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={toYearSelect}
                                    onChange={(e) => handleDropdownChange(e.target.value, toMonthSelect, 'to')}
                                    className="px-2 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                                >
                                    <option value="">Any Year</option>
                                    {yearsRange.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <select
                                    value={toMonthSelect}
                                    onChange={(e) => handleDropdownChange(toYearSelect, e.target.value, 'to')}
                                    className="px-2 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                                >
                                    <option value="">Any Month</option>
                                    {monthsList.map((m, idx) => {
                                        const val = String(idx + 1).padStart(2, '0');
                                        return <option key={val} value={val}>{m}</option>;
                                    })}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Media Type + Transcoding Filters */}
                    <div className="space-y-2">
                        <label htmlFor="timeline-media-type" className="block text-xs font-semibold text-gray-400">Media Type</label>
                        <select
                            id="timeline-media-type"
                            value={mediaTypes}
                            onChange={(e) => setMediaTypes(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-gray-800 rounded-xl text-textMain focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                        >
                            <option value="all">Show All Media (Images & Videos)</option>
                            <option value="image">Images Only</option>
                            <option value="video">Videos Only</option>
                            <option value="invalid_media_stub">Invalid Media Stubs Only</option>
                        </select>

                        {/* Thumbnail View Checkbox */}
                        <div className="flex items-center gap-2 pt-2">
                            <input
                                id="show-thumbnails-checkbox"
                                type="checkbox"
                                checked={showThumbnails}
                                onChange={(e) => setShowThumbnails(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-800 text-primary bg-black/40 focus:ring-primary focus:ring-offset-0 cursor-pointer accent-blue-500"
                            />
                            <label
                                htmlFor="show-thumbnails-checkbox"
                                className="text-xs font-semibold text-gray-300 cursor-pointer select-none hover:text-white transition-colors"
                            >
                                View Image Thumbnails
                            </label>
                        </div>

                        {/* Video Transcoding Quality Toggle */}
                        <div className="pt-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Zap className={`w-3.5 h-3.5 ${ffmpegAvailable ? 'text-indigo-400' : 'text-gray-600'}`} />
                                <span className={`text-xs font-semibold ${ffmpegAvailable ? 'text-gray-300' : 'text-gray-600'}`}>
                                    Video Transcode Quality
                                </span>
                                {!ffmpegAvailable && (
                                    <span className="text-[10px] text-yellow-600 font-mono ml-1">(FFmpeg not found)</span>
                                )}
                            </div>
                            <div className="flex gap-1.5">
                                {(['fast', 'balanced', 'quality'] as const).map((q) => {
                                    const labels: Record<string, string> = {
                                        fast: '⚡ Fast',
                                        balanced: '⚖ Balanced',
                                        quality: '✦ Quality',
                                    };
                                    const hints: Record<string, string> = {
                                        fast: 'Quickest encode, slightly lower quality (CRF 28)',
                                        balanced: 'Good speed/quality balance (CRF 23)',
                                        quality: 'Best quality, slower encode (CRF 18)',
                                    };
                                    const isActive = transcodeQuality === q;
                                    return (
                                        <button
                                            key={q}
                                            id={`transcode-quality-${q}`}
                                            title={hints[q]}
                                            disabled={!ffmpegAvailable}
                                            onClick={() => setTranscodeQuality(q)}
                                            className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                                                !ffmpegAvailable
                                                    ? 'border-gray-800/40 text-gray-700 bg-black/20 cursor-not-allowed'
                                                    : isActive
                                                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                                                        : 'border-gray-800 bg-black/30 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                                            }`}
                                        >
                                            {labels[q]}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="text-[10px] text-textMuted leading-relaxed">
                                {ffmpegAvailable
                                    ? 'Applied when playing legacy formats (AVI, WMV, FLV…) in-browser.'
                                    : 'Install FFmpeg to enable in-browser playback of legacy video formats.'}
                            </div>
                        </div>

                        <div className="text-[10px] text-textMuted leading-relaxed pt-1">
                            Filtering changes how Years, Months, and Days display in the timeline tree below.
                        </div>
                    </div>
                </div>
            </div>

            {/* Breadcrumbs or Back navigation line */}
            <div className="max-w-7xl w-full mx-auto mb-6 flex items-center gap-3 shrink-0">
                {viewMode === 'explorer' ? (
                    <div className="flex items-center flex-wrap gap-2 text-sm text-textMuted bg-surface/50 border border-gray-800/50 py-2 px-4 rounded-xl w-full">
                        <button
                            onClick={() => fetchExplorer('')}
                            className="hover:text-white flex items-center gap-1.5 transition-colors"
                        >
                            <Home className="w-4 h-4 text-blue-400" />
                            <span>Roots</span>
                        </button>
                        {breadcrumbs.length > 0 && <span className="text-gray-700">/</span>}
                        {breadcrumbs.map((bc, idx) => (
                            <div key={bc.path} className="flex items-center gap-2">
                                <button
                                    onClick={() => fetchExplorer(bc.path)}
                                    className={`hover:text-white transition-colors truncate max-w-[150px] ${
                                        idx === breadcrumbs.length - 1 ? 'text-blue-400 font-semibold' : ''
                                    }`}
                                >
                                    {bc.name}
                                </button>
                                {idx < breadcrumbs.length - 1 && <span className="text-gray-700">/</span>}
                            </div>
                        ))}
                    </div>
                ) : viewMode === 'duplicates' ? (
                    <div className="flex items-center justify-between gap-3 text-sm text-textMuted bg-surface/50 border border-gray-800/50 py-2 px-4 rounded-xl w-full">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Copy className="w-4 h-4 text-amber-400" />
                                <span className="text-amber-300 font-semibold">
                                    {invalidStubReport ? 'Invalid Media Stub Report' : 'Exact Hash Duplicate Report'}
                                </span>
                            </div>
                            <div className="flex rounded-lg border border-gray-800 p-0.5 bg-black/30">
                                <button
                                    onClick={() => setDuplicateCategory('exact_hash')}
                                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${!invalidStubReport ? 'bg-amber-500/20 text-amber-200' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Exact Duplicates
                                </button>
                                <button
                                    onClick={() => setDuplicateCategory('invalid_media_stub')}
                                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${invalidStubReport ? 'bg-amber-500/20 text-amber-200' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Invalid Media Stubs
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold" htmlFor="duplicate-report-page-size">
                                Per page
                            </label>
                            <select
                                id="duplicate-report-page-size"
                                value={duplicateReportPageSize}
                                onChange={(e) => {
                                    setDuplicateReportPage(1);
                                    setDuplicateReportPageSize(Number(e.target.value) as 10 | 20 | 50);
                                }}
                                className="px-2 py-1.5 bg-black/40 border border-gray-800 rounded-lg text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                            <div className="flex items-center gap-1 border border-gray-800 rounded-lg px-1 py-1">
                                <button
                                    onClick={() => setDuplicateReportPage((page) => Math.max(page - 1, 1))}
                                    disabled={!duplicateReport?.pagination.has_previous}
                                    className="p-1 rounded text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                                    title="Previous page"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="min-w-[72px] text-center text-[10px] font-mono text-gray-400">
                                    Page {duplicateReport?.pagination.page || duplicateReportPage} / {duplicateReport?.pagination.total_pages || 1}
                                </span>
                                <button
                                    onClick={() => setDuplicateReportPage((page) => page + 1)}
                                    disabled={!duplicateReport?.pagination.has_next}
                                    className="p-1 rounded text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                                    title="Next page"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <a
                                href={getDuplicateReportCsvUrl()}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-800 text-xs text-gray-300 hover:text-white hover:border-amber-500/50 transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export CSV
                            </a>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-textMuted bg-surface/50 border border-gray-800/50 py-2 px-4 rounded-xl w-full">
                        <button
                            onClick={() => navigate('/folders')}
                            className="hover:text-white flex items-center gap-1.5 transition-colors"
                        >
                            <Calendar className="w-4 h-4 text-indigo-400" />
                            <span>Timeline</span>
                        </button>
                        {timelineYear !== null && (
                            <>
                                <span className="text-gray-700">&gt;</span>
                                <button
                                    onClick={() => navigate(`/folders/${timelineYear}`)}
                                    className={`hover:text-white transition-colors ${timelineMonth === null ? 'text-indigo-400 font-semibold' : ''}`}
                                >
                                    {timelineYear}
                                </button>
                            </>
                        )}
                        {timelineMonth !== null && (
                            <>
                                <span className="text-gray-700">&gt;</span>
                                <button
                                    onClick={() => navigate(`/folders/${timelineYear}/${timelineMonth}`)}
                                    className={`hover:text-white transition-colors ${timelineDay === null ? 'text-indigo-400 font-semibold' : ''}`}
                                >
                                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][timelineMonth - 1]}
                                </button>
                            </>
                        )}
                        {timelineDay !== null && (
                            <>
                                <span className="text-gray-700">&gt;</span>
                                <span className="text-indigo-400 font-semibold">{timelineDay.toString().padStart(2, '0')}</span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Main content grid split */}
            <div className="flex-1 max-w-7xl w-full mx-auto relative overflow-hidden flex gap-6">
                <div
                    className="flex-1 overflow-y-auto pr-2 custom-scrollbar h-full"
                    ref={filesContainerRef}
                >
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                        </div>
                    ) : searchingByFileName && viewMode !== 'duplicates' ? (
                        fileNameResults.length === 0 ? (
                            <div className="text-center text-gray-500 mt-20 flex flex-col items-center">
                                <Search className="w-16 h-16 mb-4 opacity-50 text-blue-400/40" />
                                <p className="text-lg">No filenames match "{trimmedFileNameQuery}".</p>
                                <p className="text-sm mt-2 text-gray-600">Try a shorter partial filename or clear the field.</p>
                            </div>
                        ) : (
                            <div className="pb-10">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Search className="w-4 h-4" /> Filename Matches ({fileNameResults.length})
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                                    {fileNameResults.map((file) => (
                                        <FileCard
                                            key={file.id}
                                            file={file}
                                            onClick={() => setSelectedFile(file)}
                                            onDuplicatesClick={(e) => openDuplicatesModal(e, file)}
                                            onFolderClick={() => {
                                                setFileNameQuery('');
                                                setViewMode('explorer');
                                                fetchExplorer(file.parent_path);
                                            }}
                                            showThumbnail={showThumbnails}
                                            getMediaUrl={getMediaPreviewUrl}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    ) : viewMode === 'explorer' ? (
                        /* File Explorer hierarchical lists */
                        explorerData.directories.length === 0 && explorerData.files.length === 0 ? (
                            <div className="text-center text-gray-500 mt-20 flex flex-col items-center p-8 bg-surface/30 rounded-2xl border border-gray-800/40">
                                <Folder className="w-16 h-16 mb-4 text-blue-500/40" />
                                <p className="text-lg font-medium text-gray-400">Empty directory or no folder scanned yet.</p>
                                <p className="text-sm text-gray-600 mt-2 max-w-md">
                                    Click "Scan & Settings" to register and index folders on your local disk.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-8 pb-10">
                                {/* Directories Grid */}
                                {explorerData.directories.length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Folder className="w-4 h-4" /> Folders ({explorerData.directories.length})
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {explorerData.directories.map((dir) => {
                                                const dirName = dir.split(/[\\/]/).pop() || dir;
                                                return (
                                                    <div
                                                        key={dir}
                                                        onClick={() => fetchExplorer(dir)}
                                                        className="flex items-center gap-3 p-4 bg-surface/50 border border-gray-800 rounded-xl hover:border-blue-500/50 hover:bg-surface/80 transition-all cursor-pointer group shadow-sm hover:shadow-lg"
                                                    >
                                                        <Folder className="w-8 h-8 text-blue-400 shrink-0 group-hover:scale-105 transition-transform" />
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-gray-200 truncate group-hover:text-blue-400 transition-colors">
                                                                {dirName}
                                                            </div>
                                                            <div className="text-[10px] text-gray-600 truncate mt-0.5">
                                                                {dir}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Files Grid */}
                                {explorerData.files.length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <File className="w-4 h-4" /> Files ({explorerData.files.length})
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                                            {explorerData.files.map((file) => {
                                                // Group anchors mapping
                                                const date = file.date_taken || file.date_modified || file.date_created;
                                                let anchorId = '';
                                                if (date && date.length >= 7) {
                                                    const y = date.substring(0, 4);
                                                    const m = parseInt(date.substring(5, 7));
                                                    anchorId = `file-group-${y}-${m}`;
                                                }

                                                return (
                                                    <div key={file.id} id={anchorId}>
                                                        <FileCard
                                                            file={file}
                                                            onClick={() => setSelectedFile(file)}
                                                            onDuplicatesClick={(e) => openDuplicatesModal(e, file)}
                                                            showThumbnail={showThumbnails}
                                                            getMediaUrl={getMediaPreviewUrl}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    ) : viewMode === 'duplicates' ? (
                        duplicateReport && duplicateReport.groups.length > 0 ? (
                            <div className="space-y-5 pb-10">
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                    <div className="bg-surface/60 border border-gray-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{invalidStubReport ? 'Stub Groups' : 'Duplicate Groups'}</div>
                                        <div className="text-xl font-bold text-gray-100 mt-1">
                                            {duplicateReport.summary.group_count} {duplicateReport.summary.group_count === 1 ? 'group' : 'groups'}
                                        </div>
                                    </div>
                                    <div className="bg-surface/60 border border-gray-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{invalidStubReport ? 'Invalid Files' : 'Duplicate Files'}</div>
                                        <div className="text-xl font-bold text-gray-100 mt-1">
                                            {duplicateReport.summary.file_count} {duplicateReport.summary.file_count === 1 ? 'file' : 'files'}
                                        </div>
                                    </div>
                                    <div className="bg-surface/60 border border-gray-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Total Size</div>
                                        <div className="text-xl font-bold text-gray-100 mt-1">{formatBytes(duplicateReport.summary.total_bytes)}</div>
                                    </div>
                                    <div className="bg-surface/60 border border-gray-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{invalidStubReport ? 'Repeated Stub Bytes' : 'Wasted Size'}</div>
                                        <div className="text-xl font-bold text-amber-300 mt-1">{formatBytes(duplicateReport.summary.wasted_bytes)}</div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto border border-gray-800 rounded-xl bg-surface/40">
                                    <table className="w-full text-sm">
                                        <thead className="bg-black/30 text-[10px] uppercase tracking-wider text-gray-500">
                                            <tr>
                                                <th className="text-left px-4 py-3">Hash Group</th>
                                                <th className="text-left px-4 py-3">File</th>
                                                <th className="text-left px-4 py-3">Date</th>
                                                <th className="text-right px-4 py-3">Size</th>
                                                <th className="text-right px-4 py-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800/70">
                                            {duplicateReport.groups.map((group) => (
                                                group.files.map((file, fileIndex) => (
                                                    <tr key={`${group.file_hash}-${file.id}`} className="hover:bg-white/[0.03]">
                                                        <td className="px-4 py-3 align-top">
                                                            {fileIndex === 0 && (
                                                                <div className="space-y-1">
                                                                    <div className="font-mono text-xs text-amber-300 truncate max-w-[180px]" title={group.file_hash}>
                                                                        {group.file_hash}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-500">
                                                                        {group.count} files · {formatBytes(group.wasted_bytes)} wasted
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 align-top">
                                                            <div className="font-semibold text-gray-200 break-all">{file.filename}</div>
                                                            <div className="text-[10px] text-gray-500 font-mono break-all mt-1">{file.filepath}</div>
                                                            {invalidStubReport && file.validation_error && (
                                                                <div className="text-[10px] text-amber-300 mt-1">{file.validation_error}</div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 align-top text-gray-400 font-mono text-xs">
                                                            {[file.year, file.month, file.day].filter(Boolean).join('-') || 'Unknown'}
                                                        </td>
                                                        <td className="px-4 py-3 align-top text-right text-gray-300 font-mono text-xs">
                                                            {formatBytes(file.file_size)}
                                                        </td>
                                                        <td className="px-4 py-3 align-top">
                                                            <div className="flex justify-end gap-2">
                                                                <button
                                                                    onClick={() => openInSystemPlayer(file.filepath)}
                                                                    className="p-2 rounded-lg border border-gray-800 text-gray-400 hover:text-white hover:border-blue-500/50 transition-colors"
                                                                    title="Open file"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => openInSystemExplorer(file.filepath)}
                                                                    className="p-2 rounded-lg border border-gray-800 text-gray-400 hover:text-white hover:border-blue-500/50 transition-colors"
                                                                    title="Reveal in folder"
                                                                >
                                                                    <FolderOpen className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 mt-20 flex flex-col items-center">
                                <Copy className="w-16 h-16 mb-4 opacity-50 text-amber-400/40" />
                                <p className="text-lg">{invalidStubReport ? 'No invalid media stubs found.' : 'No exact duplicate hashes found.'}</p>
                                <p className="text-sm mt-2 text-gray-600">
                                    {invalidStubReport
                                        ? 'Rescan videos to validate whether they contain a decodable stream.'
                                        : 'Only validated media with matching file hashes is included.'}
                                </p>
                            </div>
                        )
                    ) : (
                        /* Timeline Drilldown View */
                        timelineDrilldownItems.length === 0 && timelineFiles.length === 0 ? (
                            <div className="text-center text-gray-500 mt-20 flex flex-col items-center">
                                <Calendar className="w-16 h-16 mb-4 opacity-50 text-indigo-400/40" />
                                <p className="text-lg">No dates indexed yet.</p>
                                <p className="text-sm mt-2 text-gray-600">Scan folders to extract media metadata dates.</p>
                            </div>
                        ) : timelineFiles.length > 0 ? (
                            /* Files on specific day */
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <File className="w-4 h-4" /> Media Files ({timelineFiles.length})
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                                    {timelineFiles.map((file) => (
                                        <FileCard
                                            key={file.id}
                                            file={file}
                                            onClick={() => setSelectedFile(file)}
                                            onDuplicatesClick={(e) => openDuplicatesModal(e, file)}
                                            showThumbnail={showThumbnails}
                                            getMediaUrl={getMediaPreviewUrl}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* Sub-Date selections grid (Years, Months, or Days) */
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {timelineDrilldownItems.map((item) => (
                                    <div
                                        key={item.label}
                                        onClick={() => {
                                            if (timelineYear === null) {
                                                navigate(`/folders/${item.value}`);
                                            } else if (timelineMonth === null) {
                                                navigate(`/folders/${timelineYear}/${item.value}`);
                                            } else {
                                                navigate(`/folders/${timelineYear}/${timelineMonth}/${item.value}`);
                                            }
                                        }}
                                        className="flex flex-col items-center justify-center p-6 bg-surface/50 border border-gray-800 rounded-2xl hover:border-indigo-500/50 hover:bg-surface transition-all cursor-pointer group shadow-sm hover:shadow-xl text-center"
                                    >
                                        <Calendar className="w-10 h-10 text-indigo-400 group-hover:scale-105 transition-transform mb-3" />
                                        <div className="text-lg font-bold text-gray-200 group-hover:text-indigo-400 transition-colors">
                                            {item.label}
                                        </div>
                                        <div className="text-xs text-textMuted mt-1 font-mono">
                                            {item.count} {item.count === 1 ? 'file' : 'files'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                </div>

                {/* ========== DATE TIMELINE NOTCHES SIDEBAR ========== */}
                {groupedFileDates.length > 0 && !loading && (
                    <div className="w-14 shrink-0 flex flex-col items-center justify-center relative border-l border-gray-800/40">
                        <div className="absolute left-[-1px] top-4 bottom-4 w-px bg-gray-800" />
                        <div className="flex flex-col gap-2 overflow-y-auto max-h-[80%] custom-scrollbar py-2 relative z-10 select-none">
                            {groupedFileDates.map((notch) => (
                                <button
                                    key={notch.elementId}
                                    onClick={() => scrollToGroup(notch.elementId)}
                                    className="flex flex-col items-center group relative py-1 focus:outline-none"
                                >
                                    <div className="w-2 h-2 rounded-full bg-blue-500/60 group-hover:bg-blue-400 group-hover:scale-125 transition-all shadow-[0_0_6px_rgba(59,130,246,0.3)]" />
                                    <span className="absolute right-7 top-1/2 -translate-y-1/2 bg-black/80 px-2 py-0.5 rounded border border-gray-800 text-[10px] text-gray-400 font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity font-mono">
                                        {notch.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ========== FULL SCREEN MEDIA VIEWER & METADATA SIDEBAR ========== */}
            {selectedFile && !showDuplicatesModal && (
                <div
                    className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setSelectedFile(null); }}
                >
                    <div className="bg-surface rounded-2xl border border-gray-800 shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col lg:flex-row overflow-hidden">
                        {/* Left Side: Media content */}
                        <div className="flex-1 bg-black/40 flex flex-col items-center justify-center relative p-6 min-h-0">
                            {/* Prev control */}
                            <button
                                onClick={() => navigatePlayer('prev')}
                                className="absolute left-4 top-1/2 -translate-y-1/2 bg-surface/75 hover:bg-surface border border-gray-800 hover:border-gray-600 text-white p-3 rounded-full transition-all z-10 shadow-lg"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>

                            {/* Main player asset */}
                            <div className="w-full h-full flex items-center justify-center min-h-0">
                                {selectedFile.media_type === 'image' ? (
                                    <div
                                        className="relative flex items-center justify-center cursor-pointer group"
                                        onClick={() => setImageFullSize(true)}
                                    >
                                        <img
                                            src={getMediaPreviewUrl(selectedFile.filepath)}
                                            alt={selectedFile.filename}
                                            className="max-w-full max-h-[50vh] lg:max-h-[70vh] object-contain rounded-lg shadow-2xl"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center rounded-lg">
                                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white/80 text-sm bg-black/60 px-4 py-2 rounded-lg flex items-center gap-2">
                                                <Maximize2 className="w-4 h-4" /> View Full Size
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    // 3-path routing: native → transcode → OS fallback
                                    isNativelySupported(selectedFile.filename) ? (
                                        // Path 1: Browser-native formats — serve directly
                                        <Suspense
                                            fallback={
                                                <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
                                                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500" />
                                                    <span className="text-sm">Loading player…</span>
                                                </div>
                                            }
                                        >
                                            <VideoPlayer src={getMediaUrl(selectedFile.filepath)} />
                                        </Suspense>
                                    ) : isTranscodeable(selectedFile.filename) && ffmpegAvailable ? (
                                        // Path 2: Legacy format + FFmpeg available — transcode on-the-fly
                                        <Suspense
                                            fallback={
                                                <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
                                                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500" />
                                                    <span className="text-sm">Transcoding video…</span>
                                                    <span className="text-[10px] text-gray-600 font-mono">{transcodeQuality} preset</span>
                                                </div>
                                            }
                                        >
                                            <VideoPlayer src={getTranscodeUrl(selectedFile.filepath)} />
                                        </Suspense>
                                    ) : (
                                        // Path 3: Unsupported or FFmpeg not installed — OS player fallback
                                        <div className="flex flex-col items-center justify-center text-center p-8 bg-surface border border-gray-800 rounded-2xl max-w-md shadow-2xl">
                                            <Video className="w-16 h-16 text-yellow-500/70 mb-4 animate-pulse" />
                                            <h3 className="text-lg font-bold text-gray-200">
                                                {isTranscodeable(selectedFile.filename) ? 'FFmpeg Not Available' : 'Video Format Not Supported'}
                                            </h3>
                                            <p className="text-sm text-textMuted mt-2 leading-relaxed">
                                                {isTranscodeable(selectedFile.filename)
                                                    ? (<>Install <span className="text-indigo-400 font-bold">FFmpeg</span> and add it to your PATH to play <span className="text-yellow-400 font-bold">.{selectedFile.filename.split('.').pop()}</span> files in-browser.</>)
                                                    : (<>The file extension <span className="text-yellow-400 font-bold">.{selectedFile.filename.split('.').pop()}</span> cannot be decoded in standard web browsers.</>)
                                                }
                                            </p>
                                            <button
                                                onClick={() => openInSystemPlayer(selectedFile.filepath)}
                                                className="mt-6 flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                Open in System Player
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>

                            {/* Next control */}
                            <button
                                onClick={() => navigatePlayer('next')}
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-surface/75 hover:bg-surface border border-gray-800 hover:border-gray-600 text-white p-3 rounded-full transition-all z-10 shadow-lg"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>

                            {/* System player trigger overlay at bottom — visible when video is playing in-browser */}
                            {selectedFile.media_type === 'video' && (isNativelySupported(selectedFile.filename) || (isTranscodeable(selectedFile.filename) && ffmpegAvailable)) && (
                                <button
                                    onClick={() => openInSystemPlayer(selectedFile.filepath)}
                                    className="absolute bottom-4 bg-surface/80 hover:bg-surface text-gray-300 hover:text-white px-4 py-2 border border-gray-800 hover:border-gray-600 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open in Default OS Player
                                </button>
                            )}
                        </div>

                        {/* Right Side: Metadata Panel */}
                        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col shrink-0">
                            {/* Close bar */}
                            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#111]/40 shrink-0">
                                <span className="font-bold text-sm text-gray-300 uppercase tracking-wider">File Information</span>
                                <div className="flex items-center gap-1">
                                    {selectedFile.media_type === 'image' && (
                                        <button
                                            onClick={() => setImageFullSize(true)}
                                            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
                                            title="View full size"
                                        >
                                            <Maximize2 className="w-5 h-5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setSelectedFile(null); setImageFullSize(false); }}
                                        className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Attributes scroll */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                <div className="space-y-1">
                                    <div className="text-sm font-bold text-gray-200 break-all">{selectedFile.filename}</div>
                                    <div className="text-[10px] text-gray-500 font-mono break-all leading-normal">{selectedFile.filepath}</div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-gray-800/60">
                                    <div className="flex items-start gap-3">
                                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="text-xs text-textMuted font-medium uppercase tracking-wider">File Metadata</div>
                                            <div className="mt-2 space-y-2 text-xs">
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Size</span>
                                                    <span className="text-gray-300 font-mono font-medium">{formatBytes(selectedFile.file_size)}</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Hash (MD5)</span>
                                                    <span className="text-gray-300 font-mono truncate max-w-[150px]" title={selectedFile.file_hash}>{selectedFile.file_hash}</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Media Type</span>
                                                    <span className="text-gray-300 capitalize">{selectedFile.media_type}</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Scanned At</span>
                                                    <span className="text-gray-300">{selectedFile.scanned_at}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3 pt-2">
                                        <Clock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="text-xs text-textMuted font-medium uppercase tracking-wider">Timeline Mapping</div>
                                            <div className="mt-2 space-y-2 text-xs w-[250px] lg:w-[280px]">
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Date Resolved</span>
                                                    <span className="text-gray-300 font-medium">{selectedFile.date_taken}</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Resolution Source</span>
                                                    <span className="text-indigo-300 font-mono uppercase text-[10px] font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full">{selectedFile.date_fallback}</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Date Modified</span>
                                                    <span className="text-gray-300">{selectedFile.date_modified || 'Unknown'}</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-gray-900">
                                                    <span className="text-gray-500">Date Created</span>
                                                    <span className="text-gray-300">{selectedFile.date_created || 'Unknown'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Technical Properties (Dimensions, Codec, Framerate, Duration) */}
                                    {(selectedFile.width || selectedFile.height ||
                                      (selectedFile.duration !== null && selectedFile.duration !== undefined) ||
                                      selectedFile.codec) && (
                                        <div className="flex items-start gap-3 pt-2">
                                            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="text-xs text-textMuted font-medium uppercase tracking-wider">Technical Details</div>
                                                <div className="mt-2 space-y-2 text-xs w-[250px] lg:w-[280px]">
                                                    {selectedFile.width && selectedFile.height && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Dimensions</span>
                                                            <span className="text-gray-300 font-mono">{selectedFile.width} × {selectedFile.height}</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.media_type === 'video' &&
                                                     selectedFile.duration !== null &&
                                                     selectedFile.duration !== undefined && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Duration</span>
                                                            <span className="text-gray-300 font-mono">
                                                                {(() => {
                                                                    const s = Math.round(selectedFile.duration);
                                                                    const mins = Math.floor(s / 60);
                                                                    const secs = s % 60;
                                                                    return `${mins}:${secs.toString().padStart(2, '0')} (${s}s)`;
                                                                })()}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {selectedFile.codec && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Codec</span>
                                                            <span className="text-gray-300 font-mono uppercase">{selectedFile.codec}</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.frame_rate !== null &&
                                                     selectedFile.frame_rate !== undefined && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Framerate</span>
                                                            <span className="text-gray-300 font-mono">{selectedFile.frame_rate} FPS</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.bit_rate !== null &&
                                                     selectedFile.bit_rate !== undefined && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Bitrate</span>
                                                            <span className="text-gray-300 font-mono">{(selectedFile.bit_rate / 1000000).toFixed(2)} Mbps</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Camera Settings & GPS Coordinates */}
                                    {(selectedFile.camera_make || selectedFile.camera_model || selectedFile.lens_model ||
                                      (selectedFile.iso !== null && selectedFile.iso !== undefined) ||
                                      (selectedFile.f_number !== null && selectedFile.f_number !== undefined) ||
                                      (selectedFile.gps_lat !== null && selectedFile.gps_lat !== undefined)) && (
                                        <div className="flex items-start gap-3 pt-2">
                                            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="text-xs text-textMuted font-medium uppercase tracking-wider">Camera & Location</div>
                                                <div className="mt-2 space-y-2 text-xs w-[250px] lg:w-[280px]">
                                                    {(selectedFile.camera_make || selectedFile.camera_model) && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Device</span>
                                                            <span className="text-gray-300 truncate max-w-[150px]" title={`${selectedFile.camera_make || ''} ${selectedFile.camera_model || ''}`}>
                                                                {selectedFile.camera_make || ''} {selectedFile.camera_model || ''}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {selectedFile.lens_model && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Lens</span>
                                                            <span className="text-gray-300 truncate max-w-[150px]" title={selectedFile.lens_model}>{selectedFile.lens_model}</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.exposure_time && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Exposure</span>
                                                            <span className="text-gray-300 font-mono">{selectedFile.exposure_time}s</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.f_number !== null &&
                                                     selectedFile.f_number !== undefined && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Aperture</span>
                                                            <span className="text-gray-300 font-mono">f/{selectedFile.f_number}</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.iso !== null &&
                                                     selectedFile.iso !== undefined && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">ISO</span>
                                                            <span className="text-gray-300 font-mono">{selectedFile.iso}</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.focal_length !== null &&
                                                     selectedFile.focal_length !== undefined && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900">
                                                            <span className="text-gray-500">Focal Length</span>
                                                            <span className="text-gray-300 font-mono">{selectedFile.focal_length} mm</span>
                                                        </div>
                                                    )}
                                                    {selectedFile.gps_lat !== null &&
                                                     selectedFile.gps_lat !== undefined &&
                                                     selectedFile.gps_lon !== null &&
                                                     selectedFile.gps_lon !== undefined && (
                                                        <div className="flex justify-between py-1 border-b border-gray-900 items-center">
                                                            <span className="text-gray-500">Coordinates</span>
                                                            <a
                                                                href={`https://www.google.com/maps/search/?api=1&query=${selectedFile.gps_lat},${selectedFile.gps_lon}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-400 hover:text-blue-300 font-mono text-[10px] flex items-center gap-1 hover:underline"
                                                            >
                                                                {selectedFile.gps_lat.toFixed(4)}, {selectedFile.gps_lon.toFixed(4)}
                                                                <ExternalLink className="w-2.5 h-2.5" />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Duplicates & Location actions */}
                                <div className="pt-6 border-t border-gray-800/60 flex flex-col gap-3">
                                    {selectedFile.media_type === 'image' && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => sendImageToAi('full')}
                                                className="py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
                                                title="Queue with Ollama, DeepFace, and CLIP enabled"
                                            >
                                                <Sparkles className="w-4 h-4" />
                                                Full AI
                                            </button>
                                            <button
                                                onClick={() => sendImageToAi('clip')}
                                                className="py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
                                                title="Queue with CLIP visual embeddings enabled"
                                            >
                                                <Zap className="w-4 h-4" />
                                                CLIP AI
                                            </button>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => openInSystemExplorer(selectedFile.filepath)}
                                        className="w-full py-3 bg-gradient-to-r from-surface to-[#111] hover:from-gray-800 hover:to-gray-900 border border-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
                                    >
                                        <FolderOpen className="w-4 h-4 text-emerald-400" />
                                        Open File Location
                                    </button>
                                    <button
                                        onClick={(e) => openDuplicatesModal(e, selectedFile)}
                                        className="w-full py-3 bg-gradient-to-r from-surface to-[#111] hover:from-gray-800 hover:to-gray-900 border border-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
                                    >
                                        <Copy className="w-4 h-4 text-blue-400" />
                                        Check Duplicate Paths
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {imageFullSize && selectedFile && selectedFile.media_type === 'image' && (
                <div
                    className="fixed inset-0 bg-black z-[60] flex items-center justify-center cursor-zoom-out"
                    onClick={() => setImageFullSize(false)}
                >
                    <img
                        src={getMediaPreviewUrl(selectedFile.filepath)}
                        alt={selectedFile.filename}
                        className="max-w-full max-h-full object-contain"
                    />
                    <button
                        onClick={() => setImageFullSize(false)}
                        className="absolute top-6 right-6 text-white/60 hover:text-white bg-black/50 hover:bg-black/80 p-3 rounded-full transition-all"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-sm">Click anywhere to close</p>
                </div>
            )}

            {aiProgress?.active && (
                <div className="fixed bottom-6 right-6 z-[9998] w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-blue-500/30 bg-[#10131a]/95 backdrop-blur-md shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                        <div className="flex items-center gap-2 min-w-0">
                            {aiProgress.complete ? (
                                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                            ) : (
                                <Loader2 className="w-5 h-5 text-blue-400 shrink-0 animate-spin" />
                            )}
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-white">
                                    {aiProgress.complete ? 'AI scan complete' : `${aiProgress.mode === 'full' ? 'Full AI' : 'CLIP AI'} processing`}
                                </div>
                                <div className="text-[10px] text-gray-500 truncate" title={aiProgress.filepath}>
                                    {aiProgress.filepath}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setAiProgress(null)}
                            className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                            aria-label="Dismiss AI progress"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="px-4 py-3 max-h-48 overflow-y-auto custom-scrollbar">
                        {aiProgress.error ? (
                            <p className="text-sm text-red-300 leading-snug">{aiProgress.error}</p>
                        ) : (
                            <div className="space-y-2">
                                {aiProgress.lines.map((line, index) => (
                                    <p key={`${line}-${index}`} className="text-xs text-gray-300 font-mono leading-snug break-words">
                                        {line}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========== POPUP DETECTED DUPLICATES MODAL ========== */}
            {showDuplicatesModal && selectedFile && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowDuplicatesModal(false); }}
                >
                    <div className="bg-surface rounded-2xl border border-gray-800 max-w-2xl w-full p-6 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2 font-bold text-gray-200">
                                <Copy className="w-5 h-5 text-blue-400" />
                                <span>Duplicate Locations Analysis</span>
                            </div>
                            <button
                                onClick={() => { setShowDuplicatesModal(false); setDuplicatesData(null); }}
                                className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-800 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* File targets detail */}
                        <div className="py-4 border-b border-gray-900 shrink-0">
                            <span className="text-xs text-textMuted uppercase tracking-wider">Target File</span>
                            <div className="text-sm font-semibold text-gray-300 truncate mt-1">{selectedFile.filename}</div>
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate">{selectedFile.filepath}</div>
                        </div>

                        {/* Duplicates lists */}
                        <div className="flex-1 overflow-y-auto py-4 space-y-6">
                            {!duplicatesData ? (
                                <div className="flex justify-center items-center h-24">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
                                </div>
                            ) : duplicatesData.local_duplicates.length === 0 && duplicatesData.gallery_duplicates.length === 0 ? (
                                <div className="text-center py-6 text-gray-500 text-sm">
                                    No duplicate locations detected elsewhere in the system.
                                </div>
                            ) : (
                                <>
                                    {/* Local explorer folder duplicates */}
                                    {duplicatesData.local_duplicates.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                                                Copies In Scanned Folders ({duplicatesData.local_duplicates.length})
                                            </h4>
                                            <div className="space-y-2">
                                                {duplicatesData.local_duplicates.map((dup: any) => (
                                                    <div key={dup.id} className="p-3 bg-black/30 border border-gray-900 rounded-xl flex items-center justify-between gap-4">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-xs text-gray-300 font-semibold truncate" title={dup.filepath}>{dup.filepath}</div>
                                                            <div className="text-[10px] text-gray-500 mt-0.5">Scanned: {dup.scanned_at}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => openInSystemPlayer(dup.filepath)}
                                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 hover:text-white text-gray-300 rounded-lg text-[10px] font-semibold flex items-center gap-1 shrink-0 transition-all border border-gray-700/60"
                                                        >
                                                            <ExternalLink className="w-3 h-3" /> Play
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Main AI gallery table duplicates */}
                                    {duplicatesData.gallery_duplicates.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                                                Copies In Main Gallery ({duplicatesData.gallery_duplicates.length})
                                            </h4>
                                            <div className="space-y-2">
                                                {duplicatesData.gallery_duplicates.map((dup: any) => (
                                                    <div key={dup.id} className="p-3 bg-black/30 border border-gray-900 rounded-xl flex items-center justify-between gap-4">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-xs text-gray-300 font-semibold truncate" title={dup.filepath}>{dup.filepath}</div>
                                                            <div className="text-[10px] text-gray-500 mt-0.5">Scanned: {dup.scanned_at}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => openInSystemPlayer(dup.filepath)}
                                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 hover:text-white text-gray-300 rounded-lg text-[10px] font-semibold flex items-center gap-1 shrink-0 transition-all border border-gray-700/60"
                                                        >
                                                            <ExternalLink className="w-3 h-3" /> Play
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="pt-4 border-t border-gray-800 text-right shrink-0">
                            <button
                                onClick={() => { setShowDuplicatesModal(false); setDuplicatesData(null); }}
                                className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition-all"
                            >
                                Close View
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}

/* Sub component file card rendering */
interface FileCardProps {
    file: LocalMediaItem;
    onClick: () => void;
    onDuplicatesClick: (e: React.MouseEvent) => void;
    onFolderClick?: () => void;
    showThumbnail: boolean;
    getMediaUrl: (filepath: string) => string;
}

function FileCard({ file, onClick, onDuplicatesClick, onFolderClick, showThumbnail, getMediaUrl }: FileCardProps) {
    const isVideo = file.media_type === 'video';
    const duplicateCount = file.duplicate_count ?? 0;

    // Format byte sizes into readable form
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    };

    return (
        <div
            onClick={onClick}
            className="flex flex-col bg-surface/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-blue-500/50 hover:bg-surface transition-all cursor-pointer group shadow-sm hover:shadow-xl relative"
        >
            {/* Visual Header */}
            <div className="relative aspect-video bg-[#111]/40 flex items-center justify-center overflow-hidden shrink-0 select-none">
                {isVideo ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/5 group-hover:bg-indigo-500/10 transition-colors">
                        <Video className="w-12 h-12 text-indigo-400 group-hover:scale-110 transition-transform opacity-75" />
                        <span className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 border border-gray-800 rounded text-[9px] font-mono text-indigo-300 font-bold flex items-center gap-1">
                            <Play className="w-2.5 h-2.5 fill-indigo-400 stroke-none" /> VIDEO
                        </span>
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors">
                        {showThumbnail ? (
                            <LazyImage
                                src={getMediaUrl(file.filepath)}
                                alt={file.filename}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                        ) : (
                            <ImageIcon className="w-12 h-12 text-blue-400 group-hover:scale-110 transition-transform opacity-75" />
                        )}
                        <span className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 border border-gray-800 rounded text-[9px] font-mono text-blue-300 font-bold">
                            IMAGE
                        </span>
                    </div>
                )}

                {duplicateCount > 0 && (
                    <button
                        onClick={onDuplicatesClick}
                        aria-label={`${duplicateCount} duplicate location${duplicateCount === 1 ? '' : 's'}; view duplicates`}
                        className="absolute top-2 right-2 min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-[11px] leading-none font-bold border border-red-300/30 shadow-lg hover:bg-red-400 transition-colors"
                        title="View duplicate locations"
                    >
                        {duplicateCount > 99 ? '99+' : duplicateCount}
                    </button>
                )}
            </div>

            {/* Visual Description text */}
            <div className="p-4 flex-1 flex flex-col min-h-0 justify-between gap-3">
                <div className="min-w-0">
                    <div
                        className="text-xs font-semibold text-gray-200 truncate group-hover:text-blue-400 transition-colors"
                        title={file.filename}
                    >
                        {file.filename}
                    </div>
                    {/* Render folder link if on search view */}
                    {onFolderClick ? (
                        <div
                            onClick={(e) => { e.stopPropagation(); onFolderClick(); }}
                            className="text-[9px] text-blue-500 hover:underline truncate mt-1 flex items-center gap-0.5"
                            title={file.parent_path}
                        >
                            <Folder className="w-3 h-3 text-blue-400 inline shrink-0" />
                            {file.parent_path.split(/[\\/]/).pop() || file.parent_path}
                        </div>
                    ) : (
                        <div className="text-[9px] text-gray-600 font-mono truncate mt-0.5" title={file.filepath}>
                            {file.filepath}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-900 pt-3 mt-auto shrink-0 select-none">
                    <span className="text-[10px] text-gray-500 font-medium">
                        {file.date_taken ? file.date_taken.split(' ')[0].replace(/:/g, '-') : 'No Date'}
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono font-medium">
                        {formatBytes(file.file_size)}
                    </span>
                </div>
            </div>
        </div>
    );
}
