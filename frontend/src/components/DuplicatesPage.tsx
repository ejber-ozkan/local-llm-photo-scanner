import { useState, useEffect } from 'react';
import axios from 'axios';
import { Copy, Trash2, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { DuplicateGroup } from '../types';

export default function DuplicatesPage() {
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

    const fetchDuplicates = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/duplicates`);
            setDuplicates(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDuplicates();
    }, []);

    const toggleGroup = (hash: string) => {
        if (expandedGroup === hash) {
            setExpandedGroup(null);
        } else {
            setExpandedGroup(hash);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const totalWastedSpace = duplicates.reduce((acc, current) => {
        const copySizeSum = current.copies.reduce((sum, copy) => sum + copy.file_size, 0);
        return acc + copySizeSum;
    }, 0);

    return (
        <div className="p-8 h-full flex flex-col">
            <header className="mb-6">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold font-display text-white mb-2">Duplicate Media</h1>
                        <p className="text-textMuted">Review identical files discovered during library scans.</p>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center items-center flex-1">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : duplicates.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-textMuted bg-surface border border-[#333] rounded-xl p-12">
                    <ShieldAlert className="w-16 h-16 text-[#555] mb-4" />
                    <h3 className="text-xl font-medium text-white mb-2">No Duplicates Found</h3>
                    <p>Your gallery is clean! We haven't detected any duplicate images.</p>
                </div>
            ) : (
                <div className="flex-1 overflow-auto">
                    <div className="mb-6 flex space-x-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                        {duplicates.map((group) => (
                            <div key={group.hash} className="bg-surface rounded-xl overflow-hidden border border-[#333] hover:border-[#444] transition-all shadow-lg flex flex-col">
                                <div className="aspect-square relative bg-black">
                                    <img
                                        src={`${API_BASE_URL}/api/image/${group.original.id}`}
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
                                        onClick={() => toggleGroup(group.hash)}
                                        className="w-full py-2 px-3 bg-[#262626] hover:bg-[#333] text-sm text-textMuted rounded-md flex justify-between items-center transition-colors"
                                    >
                                        <span>View all copies</span>
                                        {expandedGroup === group.hash ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>

                                    {expandedGroup === group.hash && (
                                        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1 flex-1">
                                            <div className="text-xs space-y-1">
                                                <div className="text-accent mb-1 font-medium">Original (Kept in Gallery):</div>
                                                <div className="bg-[#1a1a1a] p-2 rounded break-all tracking-tight font-mono text-[10px] text-[#aaa] border border-accent/20">
                                                    {group.original.filepath}
                                                </div>
                                            </div>
                                            <div className="text-xs space-y-1 pt-2 border-t border-[#333]">
                                                <div className="text-red-400 mb-1 font-medium">Duplicate Copies (Hidden):</div>
                                                {group.copies.map(copy => (
                                                    <div key={copy.id} className="bg-[#1a1a1a] p-2 rounded break-all tracking-tight font-mono text-[10px] text-[#aaa] border border-red-500/10">
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
}
