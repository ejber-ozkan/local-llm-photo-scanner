import axios from 'axios';
import { ChevronDown, ChevronUp, FolderSearch, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config';
import type { FolderScanStatus, ScanStatus } from '../types';

type ScanPanelItem = {
    id: 'ai' | 'folder';
    label: string;
    state: ScanStatus['state'] | FolderScanStatus['state'];
    total: number;
    processed: number;
    queued: number;
};

const POLL_INTERVAL_MS = 3000;

function buildItem(
    id: ScanPanelItem['id'],
    label: string,
    state: ScanPanelItem['state'],
    total: number,
    processed: number
): ScanPanelItem | null {
    if (state === 'idle') {
        return null;
    }

    const safeTotal = Math.max(0, total || 0);
    const safeProcessed = Math.min(Math.max(0, processed || 0), safeTotal);

    return {
        id,
        label,
        state,
        total: safeTotal,
        processed: safeProcessed,
        queued: Math.max(safeTotal - safeProcessed, 0),
    };
}

function ScanIcon({ id }: { id: ScanPanelItem['id'] }) {
    if (id === 'ai') {
        return <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />;
    }

    return <FolderSearch className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />;
}

function formatScanCount(count: number) {
    return `${count} scan${count === 1 ? '' : 's'} running`;
}

export default function GlobalScanStatusPanel() {
    const [aiStatus, setAiStatus] = useState<ScanStatus | null>(null);
    const [folderStatus, setFolderStatus] = useState<FolderScanStatus | null>(null);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchStatuses = async () => {
            try {
                const [aiRes, folderRes] = await Promise.all([
                    axios.get<ScanStatus>(`${API_BASE_URL}/api/scan/status`),
                    axios.get<FolderScanStatus>(`${API_BASE_URL}/api/folder-scan/status`),
                ]);

                if (!cancelled) {
                    setAiStatus(aiRes.data);
                    setFolderStatus(folderRes.data);
                }
            } catch {
                if (!cancelled) {
                    setAiStatus(null);
                    setFolderStatus(null);
                }
            }
        };

        fetchStatuses();
        const timer = window.setInterval(fetchStatuses, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);

    const activeScans = useMemo(() => {
        const scans = [
            aiStatus
                ? buildItem('ai', 'AI scan', aiStatus.state, aiStatus.scan_total, aiStatus.scan_processed)
                : null,
            folderStatus
                ? buildItem(
                    'folder',
                    'Local folder scan',
                    folderStatus.state,
                    folderStatus.scan_total,
                    folderStatus.scan_processed
                )
                : null,
        ];

        return scans.filter((scan): scan is ScanPanelItem => Boolean(scan));
    }, [aiStatus, folderStatus]);

    if (activeScans.length === 0) {
        return null;
    }

    const totalQueued = activeScans.reduce((sum, scan) => sum + scan.queued, 0);

    return (
        <section
            role="status"
            aria-label="Scan activity"
            className="sticky top-0 z-40 border-b border-white/10 bg-[#111315]/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-[#111315]/80 sm:px-5"
        >
            <div className="mx-auto flex max-w-6xl items-center gap-3 text-xs text-gray-200">
                <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-white">{formatScanCount(activeScans.length)}</span>
                        <span className="text-gray-400">{totalQueued} queued</span>
                    </div>

                    {!collapsed && (
                        <div className="mt-1 grid gap-1 sm:grid-cols-2">
                            {activeScans.map((scan) => (
                                <div key={scan.id} className="flex min-w-0 items-center gap-2">
                                    <ScanIcon id={scan.id} />
                                    <span className="shrink-0 font-medium text-gray-100">{scan.label}</span>
                                    <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 uppercase tracking-wide text-gray-300">
                                        {scan.state}
                                    </span>
                                    <span className="shrink-0 text-gray-300">
                                        {scan.processed}/{scan.total}
                                    </span>
                                    <span className="truncate text-gray-500">{scan.queued} queued</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-gray-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                    aria-label={collapsed ? 'Expand scan details' : 'Collapse scan details'}
                    onClick={() => setCollapsed((value) => !value)}
                >
                    {collapsed ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    )}
                </button>
            </div>
        </section>
    );
}
