import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Image as ImageIcon, X, Maximize2, User, PawPrint, Camera, FileText, MapPin, Info, Filter, ChevronDown, ChevronUp, Eye, HelpCircle, ArrowUpDown, ArrowUp, ArrowDown, Calendar, Loader2, Check, Sparkles, Trash2 } from 'lucide-react';
import LocationMap from './LocationMap';
import { useToast, ToastContainer } from './Toast';
import { API_BASE_URL } from '../config';

interface Photo {
    id: number;
    filepath: string;
    filename: string;
    description: string;
    date_taken?: string;
    date_created?: string;
    date_modified?: string;
}

interface PhotoEntity {
    id: number;
    type: string;
    name: string;
    bounding_box?: string;
}

interface PhotoDetail {
    id: number;
    filepath: string;
    filename: string;
    description: string;
    entities: PhotoEntity[];
    metadata: Record<string, string>;
    gps_lat?: number;
    gps_lon?: number;
    ai_model?: string;
}

interface FilterOptions {
    names: { name: string; type: string }[];
    cameras: string[];
    date_min: string | null;
    date_max: string | null;
    total_photos: number;
    photos_with_faces: number;
    photos_unidentified: number;
}

interface YearInfo {
    year: string;
    count: number;
}

// Helper: parse EXIF date string to a label
function formatDateGroup(dateTaken: string | undefined): string {
    if (!dateTaken) return 'Unknown Date';
    try {
        // EXIF dates are "YYYY:MM:DD HH:MM:SS"
        const parts = dateTaken.replace(/:/g, '-').split(' ');
        const datePart = parts[0].replace(/-/g, ':').split(':');
        const d = new Date(parseInt(datePart[0]), parseInt(datePart[1]) - 1, parseInt(datePart[2]));
        if (isNaN(d.getTime())) return 'Unknown Date';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
        return 'Unknown Date';
    }
}

function getYearFromDate(dateTaken: string | undefined): string {
    if (!dateTaken) return '';
    return dateTaken.substring(0, 4);
}

// Isolated component for each entity row to prevent React re-renders from stealing focus while typing.
function EntityRow({
    ent,
    onRename,
    onDelete,
    onMouseEnter,
    onMouseLeave
}: {
    ent: PhotoEntity;
    onRename: (oldName: string, newName: string) => Promise<void>;
    onDelete: (name: string) => Promise<void>;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(ent.name);
    const [loading, setLoading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const handleSubmit = async () => {
        if (!editName.trim() || editName === ent.name) {
            setIsEditing(false);
            return;
        }
        setLoading(true);
        await onRename(ent.name, editName);
        setLoading(false);
        setIsEditing(false);
    };

    return (
        <>
            <div
                className="group relative flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 shadow-sm hover:border-gray-500 transition-colors cursor-default"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
            >
                {ent.type === 'person' ? <User className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : <PawPrint className="w-3.5 h-3.5 text-orange-400 shrink-0" />}

                <div className="flex-1 min-w-[100px]">
                    {isEditing ? (
                        <div className="flex items-center gap-1 w-full relative z-10">
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                className="bg-gray-900 border border-primary rounded px-2 py-0.5 text-sm text-white w-full min-w-[120px] focus:outline-none"
                                autoFocus
                                disabled={loading}
                            />
                            <button onClick={handleSubmit} disabled={loading} className="text-green-500 hover:text-green-400 shrink-0">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => { setIsEditing(false); setEditName(ent.name); }} disabled={loading} className="text-gray-500 hover:text-gray-400 shrink-0">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <p
                            className="text-gray-300 text-sm whitespace-nowrap overflow-hidden text-ellipsis cursor-text hover:text-blue-400 transition-colors"
                            title="Click to rename"
                            onClick={() => setIsEditing(true)}
                        >
                            {ent.name}
                        </p>
                    )}
                </div>

                {!isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1 z-10 shrink-0">
                        <button
                            onClick={() => setIsEditing(true)}
                            className="text-gray-400 hover:text-white p-1"
                            title="Rename entity"
                        >
                            <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="text-gray-400 hover:text-red-400 p-1"
                            title="Delete entity"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Custom confirm modal for delete */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-6" onClick={() => setConfirmDelete(false)}>
                    <div className="bg-surface border border-[#333] shadow-2xl rounded-2xl p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-4 text-red-500 mb-4">
                            <Trash2 className="w-7 h-7 shrink-0" />
                            <h2 className="text-xl font-bold text-white">Delete Entity</h2>
                        </div>
                        <p className="text-gray-300 text-base mb-8 leading-relaxed">
                            Are you sure you want to delete <strong className="text-white">{ent.name}</strong>? This will remove all instances of this entity from every photo.
                        </p>
                        <div className="flex justify-end gap-3 font-medium">
                            <button onClick={() => setConfirmDelete(false)} className="px-5 py-2.5 rounded-xl bg-[#262626] hover:bg-[#333] text-gray-300 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={() => { setConfirmDelete(false); onDelete(ent.name); }}
                                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 transition-colors flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default function Gallery() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);

    // Filter state
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
    const [filterName, setFilterName] = useState('');
    const [filterEntityType, setFilterEntityType] = useState('');
    const [filterCamera, setFilterCamera] = useState('');
    const [filterHasFaces, setFilterHasFaces] = useState(false);
    const [filterUnidentified, setFilterUnidentified] = useState(false);

    // Sort state
    const [sortBy, setSortBy] = useState('date_taken');
    const [sortDir, setSortDir] = useState('desc');
    const [sortOpen, setSortOpen] = useState(false);

    // Timeline state
    const [years, setYears] = useState<YearInfo[]>([]);
    const galleryRef = useRef<HTMLDivElement>(null);

    // Modal state
    const [selectedPhoto, setSelectedPhoto] = useState<PhotoDetail | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [fullSize, setFullSize] = useState(false);
    const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
    const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number, h: number } | null>(null);

    const activeFilterCount = [filterName, filterEntityType, filterCamera, filterHasFaces, filterUnidentified].filter(Boolean).length;

    // Toast (replaces native alert)
    const { toasts, dismiss, error: toastError } = useToast();

    const fetchPhotos = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (query) params.set('q', query);
            if (filterName) params.set('name', filterName);
            if (filterEntityType) params.set('entity_type', filterEntityType);
            if (filterCamera) params.set('camera', filterCamera);
            if (filterHasFaces) params.set('has_faces', 'true');
            if (filterUnidentified) params.set('unidentified', 'true');
            params.set('sort_by', sortBy);
            params.set('sort_dir', sortDir);

            const res = await axios.get(`${API_BASE_URL}/api/search?${params.toString()}`);
            setPhotos(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchFilterOptions = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/gallery/filters`);
            setFilterOptions(res.data);
        } catch (err) { console.error(err); }
    };

    const fetchYears = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/gallery/years`);
            setYears(res.data);
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchPhotos();
        fetchFilterOptions();
        fetchYears();
    }, []);

    useEffect(() => {
        fetchPhotos();
    }, [filterName, filterEntityType, filterCamera, filterHasFaces, filterUnidentified, sortBy, sortDir]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchPhotos();
    };

    const clearFilters = () => {
        setFilterName('');
        setFilterEntityType('');
        setFilterCamera('');
        setFilterHasFaces(false);
        setFilterUnidentified(false);
    };

    const scrollToYear = (year: string) => {
        const el = document.getElementById(`year-group-${year}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Group photos by active sort date
    const groupedPhotos = photos.reduce<{ label: string; year: string; photos: Photo[] }[]>((groups, photo) => {
        let activeDate = photo.date_taken;
        if (sortBy === 'date_created') activeDate = photo.date_created;
        if (sortBy === 'date_modified') activeDate = photo.date_modified;

        const label = formatDateGroup(activeDate);
        const year = getYearFromDate(activeDate);
        const existing = groups.find(g => g.label === label);
        if (existing) {
            existing.photos.push(photo);
        } else {
            groups.push({ label, year, photos: [photo] });
        }
        return groups;
    }, []);

    const openPhotoDetail = async (photoId: number) => {
        setModalLoading(true);
        setSelectedPhoto(null);
        setFullSize(false);
        setImgNaturalSize(null);
        setHoveredEntity(null);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/photo/${photoId}/detail`);
            setSelectedPhoto(res.data);
        } catch (err) { console.error(err); }
        finally { setModalLoading(false); }
    };

    const closeModal = () => {
        setSelectedPhoto(null);
        setFullSize(false);
        setHoveredEntity(null);
        setImgNaturalSize(null);
    };

    const handleRenameEntity = async (oldName: string, newName: string) => {
        try {
            await axios.post(`${API_BASE_URL}/api/entities/name`, {
                entity_id: oldName,
                new_name: newName.trim()
            });
            // Update local state and trigger re-fetch of filters
            if (selectedPhoto) {
                setSelectedPhoto({
                    ...selectedPhoto,
                    entities: selectedPhoto.entities.map(e => e.name === oldName ? { ...e, name: newName.trim() } : e)
                });
            }
            fetchFilterOptions(); // Re-fetch the filter dropdown list since a name might have changed
        } catch (err) {
            console.error(err);
            toastError('Failed to rename entity');
        }
    };

    const handleDeleteEntity = async (entityName: string) => {
        try {
            await axios.delete(`${API_BASE_URL}/api/entities/${encodeURIComponent(entityName)}`);
            if (selectedPhoto) {
                setSelectedPhoto({
                    ...selectedPhoto,
                    entities: selectedPhoto.entities.filter(e => e.name !== entityName)
                });
            }
            fetchFilterOptions();
        } catch (err) {
            console.error(err);
            toastError('Failed to delete entity');
        }
    };

    const getMetadataSections = (metadata: Record<string, string>) => {
        const camera: Record<string, string> = {};
        const photo: Record<string, string> = {};
        const other: Record<string, string> = {};
        const cameraKeys = ['Make', 'Model', 'LensModel', 'LensMake', 'Software'];
        const photoKeys = ['Exposure Time', 'F-stop', 'ISO Speed', 'Focal Length', 'Flash',
            'ExposureMode', 'WhiteBalance', 'MeteringMode', 'ExposureProgram',
            'Dimensions', 'Date taken', 'DateTimeOriginal', 'DateTime',
            'DateTimeDigitized', 'BrightnessValue', 'ExposureBiasValue'];
        for (const [key, value] of Object.entries(metadata)) {
            if (cameraKeys.includes(key)) camera[key] = value;
            else if (photoKeys.includes(key)) photo[key] = value;
            else other[key] = value;
        }
        return { camera, photo, other };
    };

    const renderBoundingBoxes = () => {
        if (!imgNaturalSize || !selectedPhoto) return null;
        return selectedPhoto.entities.map((ent, i) => {
            if (!ent.bounding_box) return null;
            const isHovered = hoveredEntity === ent.name;
            try {
                const box = JSON.parse(ent.bounding_box);
                const leftPct = (box.x / imgNaturalSize.w) * 100;
                const topPct = (box.y / imgNaturalSize.h) * 100;
                const widthPct = (box.w / imgNaturalSize.w) * 100;
                const heightPct = (box.h / imgNaturalSize.h) * 100;
                return (
                    <div key={`box-${i}`} className={`absolute rounded-sm pointer-events-none transition-all duration-300 ${isHovered ? 'border-4 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)] z-30' : 'border-2 border-blue-400/40 z-20'
                        }`} style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }}>
                        <div className={`absolute -top-6 left-0 text-white text-xs font-bold px-2 py-1 rounded whitespace-nowrap transition-all duration-300 ${isHovered ? 'bg-blue-500 scale-105' : 'bg-blue-500/50 scale-100'
                            }`}>{ent.name}</div>
                    </div>
                );
            } catch { return null; }
        });
    };

    const MetadataSection = ({ title, icon, data }: { title: string, icon: React.ReactNode, data: Record<string, string> }) => {
        if (Object.keys(data).length === 0) return null;
        return (
            <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">{icon}{title}</h4>
                <div className="space-y-2">
                    {Object.entries(data).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-start text-sm gap-4">
                            <span className="text-gray-400 shrink-0">{key}</span>
                            <span className="text-gray-200 text-right break-all">{value}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const sortLabels: Record<string, string> = {
        'date_taken': 'Date taken',
        'date_created': 'Date created',
        'date_modified': 'Date modified',
        'name': 'Name'
    };

    return (
        <div className="p-8 pb-20 w-full h-full relative">
            <div className="max-w-7xl relative mx-auto flex flex-col items-center mb-8">
                <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 mb-8 tracking-tight drop-shadow-sm">
                    My AI Photo Gallery
                </h1>

                {/* Search + Sort row */}
                <div className="w-full max-w-3xl flex items-center gap-3">
                    <form onSubmit={handleSearch} className="flex-1 relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-primary transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="block w-full pl-12 pr-4 py-4 border-none rounded-2xl bg-app-panel backdrop-blur-xl text-main placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary shadow-2xl transition-all"
                            placeholder="Search by description, person, pet, or filename..."
                        />
                        <button type="submit" className="hidden" />
                    </form>

                    {/* Sort dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setSortOpen(!sortOpen)}
                            className="flex items-center gap-2 px-4 py-4 rounded-2xl bg-surface/80 border border-gray-700 text-gray-300 hover:border-gray-500 transition-all text-sm font-medium whitespace-nowrap"
                        >
                            <ArrowUpDown className="w-4 h-4" />
                            {sortLabels[sortBy]}
                            {sortDir === 'desc' ? <ArrowDown className="w-3.5 h-3.5 text-gray-500" /> : <ArrowUp className="w-3.5 h-3.5 text-gray-500" />}
                        </button>

                        {sortOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                                <div className="absolute right-0 top-full mt-2 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden min-w-[180px]">
                                    <div className="py-1">
                                        <button onClick={() => { setSortBy('date_taken'); setSortOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-800 transition-colors ${sortBy === 'date_taken' ? 'text-blue-400' : 'text-gray-300'}`}>
                                            <Calendar className="w-4 h-4" />
                                            <span>Date taken</span>
                                            {sortBy === 'date_taken' && <span className="ml-auto text-blue-400">•</span>}
                                        </button>
                                        <button onClick={() => { setSortBy('date_created'); setSortOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-800 transition-colors ${sortBy === 'date_created' ? 'text-blue-400' : 'text-gray-300'}`}>
                                            <Calendar className="w-4 h-4" />
                                            <span>Date created</span>
                                            {sortBy === 'date_created' && <span className="ml-auto text-blue-400">•</span>}
                                        </button>
                                        <button onClick={() => { setSortBy('date_modified'); setSortOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-800 transition-colors ${sortBy === 'date_modified' ? 'text-blue-400' : 'text-gray-300'}`}>
                                            <Calendar className="w-4 h-4" />
                                            <span>Date modified</span>
                                            {sortBy === 'date_modified' && <span className="ml-auto text-blue-400">•</span>}
                                        </button>
                                        <button onClick={() => { setSortBy('name'); setSortOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-800 transition-colors ${sortBy === 'name' ? 'text-blue-400' : 'text-gray-300'}`}>
                                            <span className="w-4 h-4 text-center font-bold text-xs">T</span>
                                            <span>Name</span>
                                            {sortBy === 'name' && <span className="ml-auto text-blue-400">•</span>}
                                        </button>
                                    </div>
                                    <div className="border-t border-gray-700 py-1">
                                        <button onClick={() => { setSortDir('asc'); setSortOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-800 transition-colors ${sortDir === 'asc' ? 'text-blue-400' : 'text-gray-300'}`}>
                                            <ArrowUp className="w-4 h-4" />
                                            <span>Ascending</span>
                                            {sortDir === 'asc' && <span className="ml-auto text-blue-400">•</span>}
                                        </button>
                                        <button onClick={() => { setSortDir('desc'); setSortOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-800 transition-colors ${sortDir === 'desc' ? 'text-blue-400' : 'text-gray-300'}`}>
                                            <ArrowDown className="w-4 h-4" />
                                            <span>Descending</span>
                                            {sortDir === 'desc' && <span className="ml-auto text-blue-400">•</span>}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Filter toggle */}
                <button
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${filtersOpen || activeFilterCount > 0
                        ? 'bg-primary/20 text-blue-400 border border-primary/40'
                        : 'bg-surface/60 text-gray-400 border border-gray-700 hover:border-gray-500'
                        }`}
                >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full ml-1">{activeFilterCount}</span>
                    )}
                    {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Filter panel */}
                {filtersOpen && (
                    <div className="w-full max-w-4xl mt-4 bg-surface/90 backdrop-blur-xl border border-gray-700 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Filter Gallery</h3>
                            {activeFilterCount > 0 && (
                                <button onClick={clearFilters} className="text-xs text-red-400 hover:text-red-300 underline">
                                    Clear all filters
                                </button>
                            )}
                        </div>

                        {/* Quick toggle chips */}
                        <div className="flex flex-wrap gap-3 mb-6">
                            <button onClick={() => setFilterHasFaces(!filterHasFaces)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${filterHasFaces ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-[#111] text-gray-400 border border-gray-700 hover:border-gray-500'
                                    }`}>
                                <Eye className="w-4 h-4" />Has Faces
                                {filterOptions && <span className="text-xs opacity-60">({filterOptions.photos_with_faces})</span>}
                            </button>
                            <button onClick={() => setFilterUnidentified(!filterUnidentified)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${filterUnidentified ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-[#111] text-gray-400 border border-gray-700 hover:border-gray-500'
                                    }`}>
                                <HelpCircle className="w-4 h-4" />Unidentified
                                {filterOptions && <span className="text-xs opacity-60">({filterOptions.photos_unidentified})</span>}
                            </button>
                            <button onClick={() => setFilterEntityType(filterEntityType === 'person' ? '' : 'person')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${filterEntityType === 'person' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-[#111] text-gray-400 border border-gray-700 hover:border-gray-500'
                                    }`}>
                                <User className="w-4 h-4" />People
                            </button>
                            <button onClick={() => setFilterEntityType(filterEntityType === 'pet' ? '' : 'pet')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${filterEntityType === 'pet' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-[#111] text-gray-400 border border-gray-700 hover:border-gray-500'
                                    }`}>
                                <PawPrint className="w-4 h-4" />Pets
                            </button>
                        </div>

                        {/* Dropdowns */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Person / Pet Name</label>
                                <select value={filterName} onChange={(e) => setFilterName(e.target.value)}
                                    className="w-full bg-[#111] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all">
                                    <option value="">All names</option>
                                    {filterOptions?.names.map((n) => (
                                        <option key={n.name} value={n.name}>{n.name} ({n.type})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Camera / Device</label>
                                <select value={filterCamera} onChange={(e) => setFilterCamera(e.target.value)}
                                    className="w-full bg-[#111] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all">
                                    <option value="">All cameras</option>
                                    {filterOptions?.cameras.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {filterOptions && (
                            <div className="mt-5 pt-4 border-t border-gray-800 flex items-center gap-6 text-xs text-gray-500">
                                <span>{filterOptions.total_photos} total photos</span>
                                <span>{filterOptions.photos_with_faces} with faces</span>
                                <span>{filterOptions.photos_unidentified} unidentified</span>
                                <span className="ml-auto text-gray-400 font-medium">{photos.length} results shown</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Main content area with timeline */}
            <div className="relative" ref={galleryRef}>
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                    </div>
                ) : photos.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20 flex flex-col items-center">
                        <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-lg">No photos found. Try scanning a folder or adjusting your search.</p>
                    </div>
                ) : (
                    <div className="max-w-7xl mx-auto pr-16">
                        {/* Photos grouped by date */}
                        {groupedPhotos.map((group, gi) => {
                            // Track first group of each year for timeline anchor
                            const isFirstOfYear = gi === 0 || groupedPhotos[gi - 1].year !== group.year;
                            return (
                                <div key={group.label} className="mb-10" id={isFirstOfYear && group.year ? `year-group-${group.year}` : undefined}>
                                    {/* Date header */}
                                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
                                        <Calendar className="w-5 h-5 text-gray-500" />
                                        {group.label}
                                        <span className="text-xs text-gray-600 font-normal">({group.photos.length} photos)</span>
                                    </h2>
                                    {/* Photo grid for this date */}
                                    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                                        {group.photos.map(photo => (
                                            <div key={photo.id}
                                                className="break-inside-avoid relative group rounded-xl overflow-hidden shadow-lg bg-surface hover:shadow-2xl transition-all duration-300 cursor-pointer"
                                                onClick={() => openPhotoDetail(photo.id)}>
                                                <img src={`${API_BASE_URL}/api/image/${photo.id}`} alt={photo.filename}
                                                    className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                                    <p className="text-white text-sm font-medium leading-relaxed drop-shadow-md">
                                                        {photo.description || 'Processing description...'}
                                                    </p>
                                                    <p className="text-gray-400 text-xs mt-2 truncate">{photo.filename}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ========== YEAR TIMELINE SIDEBAR ========== */}
                {years.length > 0 && photos.length > 0 && (
                    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-end pr-3 gap-0" style={{ pointerEvents: 'auto' }}>
                        {/* Vertical line */}
                        <div className="absolute right-[22px] top-2 bottom-2 w-px bg-gray-700" />

                        {years.map((yearInfo) => (
                            <button
                                key={yearInfo.year}
                                onClick={() => scrollToYear(yearInfo.year)}
                                className="relative flex items-center gap-2 py-2 px-1 group transition-all"
                                title={`${yearInfo.year} (${yearInfo.count} photos)`}
                            >
                                <span className="text-xs font-semibold text-gray-500 group-hover:text-white transition-colors opacity-0 group-hover:opacity-100 mr-1 whitespace-nowrap">
                                    {yearInfo.year}
                                </span>
                                <div className="w-2 h-2 rounded-full bg-gray-600 group-hover:bg-blue-400 group-hover:shadow-[0_0_8px_rgba(59,130,246,0.6)] transition-all z-10" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ========== FULL SIZE LIGHTBOX ========== */}
            {fullSize && selectedPhoto && (
                <div className="fixed inset-0 bg-black z-[60] flex items-center justify-center cursor-zoom-out" onClick={() => setFullSize(false)}>
                    <img src={`${API_BASE_URL}/api/image/${selectedPhoto.id}`} alt={selectedPhoto.filename} className="max-w-full max-h-full object-contain" />
                    <button onClick={() => setFullSize(false)} className="absolute top-6 right-6 text-white/60 hover:text-white bg-black/50 hover:bg-black/80 p-3 rounded-full transition-all">
                        <X className="w-6 h-6" />
                    </button>
                    <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-sm">Click anywhere to close</p>
                </div>
            )}

            {/* ========== PHOTO DETAIL MODAL ========== */}
            {(selectedPhoto || modalLoading) && !fullSize && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="bg-surface rounded-2xl border border-[#333] shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                        {modalLoading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary"></div>
                            </div>
                        ) : selectedPhoto && (
                            <>
                                <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
                                    <div className="min-w-0">
                                        <h2 className="text-lg font-bold text-white truncate">{selectedPhoto.filename}</h2>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">{selectedPhoto.filepath}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-4">
                                        <button onClick={() => setFullSize(true)} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors" title="View full size">
                                            <Maximize2 className="w-5 h-5" />
                                        </button>
                                        <button onClick={closeModal} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div className="flex flex-col gap-4">
                                            <div className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center cursor-pointer group" onClick={() => setFullSize(true)}>
                                                <img src={`${API_BASE_URL}/api/image/${selectedPhoto.id}`} alt={selectedPhoto.filename}
                                                    className="max-w-full max-h-[55vh] object-contain rounded-lg"
                                                    onLoad={(e) => { const el = e.target as HTMLImageElement; setImgNaturalSize({ w: el.naturalWidth, h: el.naturalHeight }); }}
                                                />
                                                {renderBoundingBoxes()}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white/80 text-sm bg-black/60 px-4 py-2 rounded-lg flex items-center gap-2">
                                                        <Maximize2 className="w-4 h-4" /> View Full Size
                                                    </span>
                                                </div>
                                            </div>
                                            {selectedPhoto.description && (
                                                <div className="bg-[#111] border border-gray-800 rounded-xl p-4 relative">
                                                    {selectedPhoto.ai_model && (
                                                        <div className="absolute -top-3 left-4 bg-[#1a1a1a] px-3 py-1 text-xs border border-[#444] rounded-full text-purple-300 font-mono shadow-md flex items-center gap-1 z-10">
                                                            <Sparkles className="w-3 h-3" /> {selectedPhoto.ai_model}
                                                        </div>
                                                    )}
                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-2 flex items-center gap-2">
                                                        <FileText className="w-3.5 h-3.5" /> AI Description
                                                    </h4>
                                                    <p className="text-sm text-gray-300 leading-relaxed font-serif">{selectedPhoto.description}</p>
                                                </div>
                                            )}
                                            {selectedPhoto.gps_lat && selectedPhoto.gps_lon && (
                                                <LocationMap lat={selectedPhoto.gps_lat} lon={selectedPhoto.gps_lon} compact />
                                            )}
                                        </div>
                                        <div className="bg-[#111] border border-gray-800 rounded-xl p-5 overflow-y-auto max-h-[65vh] custom-scrollbar">
                                            {selectedPhoto.entities.length > 0 && (
                                                <div className="mb-6">
                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                        <User className="w-3.5 h-3.5" /> Detected Entities ({selectedPhoto.entities.length})
                                                    </h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedPhoto.entities.map((ent) => (
                                                            <EntityRow
                                                                key={ent.id}
                                                                ent={ent}
                                                                onRename={handleRenameEntity}
                                                                onDelete={handleDeleteEntity}
                                                                onMouseEnter={() => setHoveredEntity(ent.name)}
                                                                onMouseLeave={() => setHoveredEntity(null)}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {(() => {
                                                const sections = getMetadataSections(selectedPhoto.metadata);
                                                return (
                                                    <>
                                                        <div className="border-t border-gray-800 pt-4">
                                                            <MetadataSection title="Photo Settings" icon={<Camera className="w-3.5 h-3.5" />} data={sections.photo} />
                                                            <MetadataSection title="Camera Info" icon={<Info className="w-3.5 h-3.5" />} data={sections.camera} />
                                                            <MetadataSection title="Other Metadata" icon={<MapPin className="w-3.5 h-3.5" />} data={sections.other} />
                                                        </div>
                                                        {Object.keys(selectedPhoto.metadata).length === 0 && (
                                                            <p className="text-gray-600 text-sm italic mt-4">No EXIF metadata available for this image.</p>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
