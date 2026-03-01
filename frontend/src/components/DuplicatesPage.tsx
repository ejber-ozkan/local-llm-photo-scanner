import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Copy, Trash2, ShieldAlert, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { DuplicateGroup } from '../types';

export default function DuplicatesPage() {
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
    const [skipped, setSkipped] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // UI State
    const [expandedDuplicateHashes, setExpandedDuplicateHashes] = useState<Record<string, boolean>>({});
    const [collapsedScanGroups, setCollapsedScanGroups] = useState<Record<string, boolean>>({});
    const [timestamp] = useState(Date.now());

    const fetchDuplicates = async () => {
        setLoading(true);
        try {
            const [dupeRes, skipRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/duplicates`),
                axios.get(`${API_BASE_URL}/api/skipped`)
            ]);
            setDuplicates(dupeRes.data);
            setSkipped(skipRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDuplicates();
    }, []);

    const toggleDuplicateHash = (hash: string) => {
        setExpandedDuplicateHashes(prev => ({
            ...prev,
            [hash]: !prev[hash]
        }));
    };

    const toggleScanGroup = (groupId: string) => {
        setCollapsedScanGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const totalWastedSpace = useMemo(() => {
        return duplicates.reduce((acc, current) => {
            const copySizeSum = current.copies.reduce((sum, copy) => sum + copy.file_size, 0);
            return acc + copySizeSum;
        }, 0);
    }, [duplicates]);

    // Data Transformation: Grouping by Scan Date
    const { groupedDuplicates, groupedSkipped, timelineMarkers } = useMemo(() => {
        const dupesByScan: Record<string, DuplicateGroup[]> = {};
        const skippedByScan: Record<string, any[]> = {};
        const markers: { id: string; label: string; date: number }[] = [];

        const formatScanLabel = (dateStr: string | undefined, prefix: string) => {
            if (!dateStr) return `${prefix}-scan-unknown-time`;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return `${prefix}-scan-unknown-time`;

            // Format: prefix-scan-dd-mm-yy-hh-mm
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yy = String(d.getFullYear()).slice(-2);
            const time = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(':', '-');
            return `${prefix}-scan-${dd}-${mm}-${yy}-${time}`;
        };

        const getTimestamp = (dateStr: string | undefined) => {
            if (!dateStr) return 0;
            const t = new Date(dateStr).getTime();
            return isNaN(t) ? 0 : t;
        };

        // Group Duplicates
        duplicates.forEach(group => {
            const scanDate = group.original.scanned_at;
            const label = formatScanLabel(scanDate, 'duplicates');
            if (!dupesByScan[label]) {
                dupesByScan[label] = [];
                markers.push({ id: `group-${label}`, label: label, date: getTimestamp(scanDate) });
            }
            dupesByScan[label].push(group);
        });

        // Group Skipped
        skipped.forEach(item => {
            const scanDate = item.scanned_at;
            const label = formatScanLabel(scanDate, 'skipped');
            if (!skippedByScan[label]) {
                skippedByScan[label] = [];
                markers.push({ id: `group-${label}`, label: label, date: getTimestamp(scanDate) });
            }
            skippedByScan[label].push(item);
        });

        // Sort markers chronologically (highest/newest first)
        markers.sort((a, b) => b.date - a.date);

        return { groupedDuplicates: dupesByScan, groupedSkipped: skippedByScan, timelineMarkers: markers };
    }, [duplicates, skipped]);

    // Initialize all discovered groups as collapsed strictly ONCE when they appear
    useEffect(() => {
        setCollapsedScanGroups(prev => {
            const newState = { ...prev };
            let changed = false;
            timelineMarkers.forEach(marker => {
                const groupId = marker.id;
                if (newState[groupId] === undefined) {
                    newState[groupId] = true; // Default to collapsed
                    changed = true;
                }
            });
            return changed ? newState : prev;
        });
    }, [timelineMarkers]);

    const scrollToGroup = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            // Uncollapse if collapsed
            if (collapsedScanGroups[id]) {
                setCollapsedScanGroups(prev => ({ ...prev, [id]: false }));
            }
            // Small timeout to allow React to render the uncollapsed elements before scrolling
            setTimeout(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }
    };

    return (
        <div className="p-8 h-full flex flex-col relative pb-24">
            <header className="mb-6 pr-10">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold font-display text-white mb-2">Review Skipped & Duplicate Media</h1>
                        <p className="text-textMuted">Review identical files and media skipped grouped by their scan history.</p>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center items-center flex-1">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : duplicates.length === 0 && skipped.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-textMuted bg-surface border border-[#333] rounded-xl p-12">
                    <ShieldAlert className="w-16 h-16 text-[#555] mb-4" />
                    <h3 className="text-xl font-medium text-white mb-2">No Duplicates or Skipped Media Found</h3>
                    <p>Your library is perfectly clean and identical!</p>
                </div>
            ) : (
                <div className="flex-1 overflow-auto pr-16" id="scroll-container">
                    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex space-x-4">
                            <div className="p-4 bg-surface border border-[#333] rounded-lg inline-flex items-center space-x-3">
                                <Copy className="w-5 h-5 text-accent" />
                                <div>
                                    <div className="text-xs text-textMuted uppercase tracking-wider">Duplicate Groups</div>
                                    <div className="text-xl font-semibold text-white">{duplicates.length}</div>
                                </div>
                            </div>
                            <div className="p-4 bg-surface border border-[#333] rounded-lg inline-flex items-center space-x-3">
                                <Trash2 className="w-5 h-5 text-red-500" />
                                <div>
                                    <div className="text-xs text-textMuted uppercase tracking-wider">Wasted Space</div>
                                    <div className="text-xl font-semibold text-white">{formatBytes(totalWastedSpace)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Sidebar */}
                    {timelineMarkers.length > 0 && (
                        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-end pr-3 gap-0" style={{ pointerEvents: 'auto' }}>
                            <div className="absolute right-[22px] top-2 bottom-2 w-px bg-gray-700" />
                            {timelineMarkers.map((marker) => (
                                <button
                                    key={marker.id}
                                    onClick={() => scrollToGroup(marker.id)}
                                    className="relative flex items-center gap-2 py-3 px-1 group transition-all"
                                    title={marker.label}
                                >
                                    <span className="text-[10px] font-mono font-medium text-gray-500 group-hover:text-white transition-colors opacity-0 group-hover:opacity-100 mr-1 whitespace-nowrap bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm border border-[#333]">
                                        {marker.label}
                                    </span>
                                    <div className="w-2.5 h-2.5 rounded-full bg-gray-600 group-hover:bg-accent group-hover:shadow-[0_0_8px_rgba(255,255,255,0.6)] transition-all z-10" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* DUPLICATES RENDER LOOP */}
                    {Object.entries(groupedDuplicates).map(([label, scanGroups]) => {
                        const groupId = `group-${label}`;
                        const isCollapsed = collapsedScanGroups[groupId] ?? true;

                        return (
                            <div key={groupId} id={groupId} className="mb-10 bg-[#0a0a0a] rounded-xl border border-[#222] overflow-hidden">
                                <button
                                    onClick={() => toggleScanGroup(groupId)}
                                    className="w-full flex items-center justify-between p-4 bg-surface border-b border-[#333] hover:bg-[#1a1a1a] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-accent/20 rounded-md">
                                            <Copy className="w-5 h-5 text-accent" />
                                        </div>
                                        <div className="text-left">
                                            <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                                                {label}
                                            </h2>
                                            <p className="text-xs text-textMuted">{scanGroups.length} Duplicate Group{scanGroups.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-400">
                                        <div className="text-xs font-medium px-3 py-1 bg-black rounded-full border border-[#333] flex items-center gap-1.5">
                                            <Clock className="w-3 h-3" /> Scan History
                                        </div>
                                        {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                                    </div>
                                </button>

                                {/* Lazy Loaded Body */}
                                {!isCollapsed && (
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                            {scanGroups.map((group) => (
                                                <div key={group.hash} className="bg-surface rounded-xl overflow-hidden border border-[#333] hover:border-[#444] transition-all shadow-lg flex flex-col">
                                                    <div className="aspect-[4/3] relative bg-black">
                                                        <img
                                                            src={`${API_BASE_URL}/api/image/${group.original.id}?t=${timestamp}`}
                                                            alt={group.original.filename}
                                                            className="w-full h-full object-cover"
                                                            loading="lazy"
                                                        />
                                                        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-red-400 border border-red-500/30 flex items-center space-x-1">
                                                            <Copy className="w-3 h-3" />
                                                            <span>{group.count} Copies</span>
                                                        </div>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-12">
                                                            <h3 className="text-white font-medium truncate">{group.original.filename}</h3>
                                                            <p className="text-xs text-textMuted">{formatBytes(group.original.file_size)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 flex-1 flex flex-col">
                                                        <button
                                                            onClick={() => toggleDuplicateHash(group.hash)}
                                                            className="w-full py-2 px-3 bg-[#262626] hover:bg-[#333] text-sm text-textMuted rounded-md flex justify-between items-center transition-colors"
                                                        >
                                                            <span>View all copies</span>
                                                            {expandedDuplicateHashes[group.hash] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </button>

                                                        {expandedDuplicateHashes[group.hash] && (
                                                            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                                                                <div className="text-xs space-y-1">
                                                                    <div className="text-accent mb-1 font-medium">Original (Kept in Gallery):</div>
                                                                    <div className="bg-[#1a1a1a] p-2 rounded break-all tracking-tight font-mono text-[10px] text-[#aaa] border border-accent/20">
                                                                        {group.original.filepath}
                                                                    </div>
                                                                </div>
                                                                <div className="text-xs space-y-1 pt-2 border-t border-[#333]">
                                                                    <div className="text-red-400 mb-1 font-medium">Duplicate Copies (Hidden):</div>
                                                                    {group.copies.map(copy => (
                                                                        <div key={copy.id} className="bg-[#1a1a1a] p-2 rounded break-all tracking-tight font-mono text-[10px] text-[#aaa] border border-red-500/10 hover:border-red-500/30 transition-colors">
                                                                            {copy.filepath}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* SKIPPED RENDER LOOP */}
                    {Object.entries(groupedSkipped).map(([label, skippedItems]) => {
                        const groupId = `group-${label}`;
                        const isCollapsed = collapsedScanGroups[groupId] ?? true;

                        return (
                            <div key={groupId} id={groupId} className="mb-10 bg-[#0a0000] rounded-xl border border-red-900/30 overflow-hidden">
                                <button
                                    onClick={() => toggleScanGroup(groupId)}
                                    className="w-full flex items-center justify-between p-4 bg-surface border-b border-[#333] hover:bg-[#1a0000] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-900/40 rounded-md">
                                            <ShieldAlert className="w-5 h-5 text-red-500" />
                                        </div>
                                        <div className="text-left">
                                            <h2 className="text-lg font-bold font-mono text-red-400 flex items-center gap-2">
                                                {label}
                                            </h2>
                                            <p className="text-xs text-red-300">{skippedItems.length} Ignored Media Item{skippedItems.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-red-400">
                                        <div className="text-xs font-medium px-3 py-1 bg-black rounded-full border border-red-900/30 flex items-center gap-1.5 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                                            <Clock className="w-3 h-3" /> Scan History
                                        </div>
                                        {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                                    </div>
                                </button>

                                {/* Lazy Loaded Body */}
                                {!isCollapsed && (
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                            {skippedItems.map((item) => (
                                                <div key={item.id} className="bg-surface rounded-xl overflow-hidden border-2 border-red-900/40 hover:border-red-500/60 transition-all shadow-lg flex flex-col group/item">
                                                    <div className="aspect-[4/3] relative bg-black">
                                                        <img
                                                            src={`${API_BASE_URL}/api/image/${item.id}?t=${timestamp}`}
                                                            alt={item.filename}
                                                            className="w-full h-full object-cover opacity-60 group-hover/item:opacity-100 transition-opacity"
                                                            loading="lazy"
                                                        />
                                                        <div className="absolute top-3 left-3 bg-red-900/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-white border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                                                            NOT IMPORTED
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-[#110000] flex-1 border-t border-red-900/50">
                                                        <h3 className="text-white font-medium truncate mb-2">{item.filename}</h3>
                                                        <p className="text-xs text-red-200 p-2 bg-red-950/60 rounded border border-red-900/40 leading-relaxed font-serif">
                                                            <strong className="block mb-1 text-red-400 font-sans uppercase text-[10px] tracking-wider">Reason Ignored</strong>
                                                            {item.reason}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
