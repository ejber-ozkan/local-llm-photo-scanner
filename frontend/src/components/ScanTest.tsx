import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, Image as ImageIcon, Loader2, Sparkles, Trash2, AlertTriangle } from 'lucide-react';
import LocationMap from './LocationMap';
import { useToast, ToastContainer } from './Toast';
import { API_BASE_URL } from '../config';
import type { TestResult } from '../types';
import EntityRow from './shared/EntityRow';
import ConfirmDialog from './shared/ConfirmDialog';

export default function ScanTest() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TestResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Model Selection State
    const [models, setModels] = useState<{ name: string, is_vision: boolean }[]>([]);
    const [selectedModel, setSelectedModel] = useState("");
    const [loadingModels, setLoadingModels] = useState(true);

    // Toast (replaces native alert)
    const { toasts, dismiss, error: toastError } = useToast();

    // For drawing bounding boxes
    const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
    const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number, h: number } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setupFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setupFile(e.dataTransfer.files[0]);
        }
    };

    const setupFile = (selectedFile: File) => {
        setFile(selectedFile);
        setResult(null);
        setError(null);
        setHoveredEntity(null);
        setImgNaturalSize(null);
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreview(objectUrl);
    };

    // Keep models synced on mount
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/api/models`);
                setModels(response.data.models);
                if (response.data.active && !selectedModel) {
                    setSelectedModel(response.data.active);
                }
            } catch (err) {
                console.error("Failed to fetch models", err);
            } finally {
                setLoadingModels(false);
            }
        };
        fetchModels();
    }, []);

    const handleTest = async () => {
        if (!file) return;

        setLoading(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', file);
        if (selectedModel) formData.append('model', selectedModel);

        try {
            const res = await axios.post(`${API_BASE_URL}/api/scan/single`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 120000 // 2 minutes, LLM encoding can take a bit
            });
            setResult(res.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to process image. Make sure Ollama is running and has downloaded the vision model.");
        } finally {
            setLoading(false);
        }
    };

    const handleClearDB = async () => {
        setShowConfirm(false);
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/api/test/clear`);
            setResult(null);
            setFile(null);
            setPreview(null);
        } catch (err: any) {
            console.error(err);
            toastError(err.response?.data?.detail || err.message || 'Failed to clear test database.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRename = async (oldName: string, newName: string) => {
        try {
            await axios.post(`${API_BASE_URL}/api/test/entities/name`, {
                entity_id: oldName,
                new_name: newName.trim()
            });
            // Update local state
            if (result) {
                setResult({
                    ...result,
                    entities: result.entities.map(e => e.name === oldName ? { ...e, name: newName.trim() } : e)
                });
            }
        } catch (err) {
            console.error(err);
            toastError('Failed to rename entity');
        }
    };

    const handleDeleteEntity = async (entityName: string) => {
        setActionLoading(true);
        try {
            await axios.delete(`${API_BASE_URL}/api/test/entities/${encodeURIComponent(entityName)}`);
            if (result) {
                setResult({
                    ...result,
                    entities: result.entities.filter(e => e.name !== entityName)
                });
            }
        } catch (err) {
            console.error(err);
            toastError('Failed to delete entity');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="p-8 pb-20 max-w-5xl mx-auto h-full flex flex-col">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <Sparkles className="text-primary w-8 h-8" />
                    Scan & Test Image
                </h1>
                <p className="text-gray-400 mt-2 text-lg">Upload or drag a single image here to see exactly how the AI processes and tags it in real-time.</p>
            </div>

            <div className="flex justify-end mb-6">
                <button
                    onClick={() => setShowConfirm(true)}
                    disabled={actionLoading}
                    className="bg-red-900/20 hover:bg-red-900/40 border border-red-800 text-red-400 font-medium px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
                >
                    <Trash2 className="w-4 h-4" />
                    Clean Test Database
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Upload Column */}
                <div className="flex flex-col space-y-6">
                    <div className="flex gap-4 mb-4">
                        {/* Model Dropdown Selection */}
                        <div className="flex-1 bg-surface p-6 rounded-2xl shadow border border-[#262626]">
                            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-purple-400" /> Test AI Model
                            </h3>
                            {loadingModels ? (
                                <div className="h-10 bg-[#111] animate-pulse rounded-lg mt-1 w-full"></div>
                            ) : (
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    className="w-full bg-[#111] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                >
                                    {models.map(m => (
                                        <option key={m.name} value={m.name} disabled={!m.is_vision} className={!m.is_vision ? "text-gray-500" : "text-white"}>
                                            {m.name} {!m.is_vision ? "(Not Vision)" : ""}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    <div
                        className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all ${preview ? 'border-primary bg-primary/5' : 'border-gray-700 bg-surface hover:border-gray-500'} cursor-pointer h-80 relative overflow-hidden`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            type="file"
                            className="hidden"
                            ref={fileInputRef}
                            accept=".jpg,.jpeg,.png,.webp"
                            onChange={handleFileChange}
                        />

                        {preview ? (
                            <>
                                <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-contain opacity-40 blur-sm" />

                                {/* We wrap the main image in a relative container that shrinks to fit the exact image dimensions */}
                                <div className="relative z-10 max-h-full max-w-full flex items-center justify-center">
                                    <img
                                        src={preview}
                                        alt="Preview"
                                        className="max-h-full max-w-full rounded-lg shadow-2xl object-contain"
                                        onLoad={(e) => {
                                            const imgElement = e.target as HTMLImageElement;
                                            setImgNaturalSize({ w: imgElement.naturalWidth, h: imgElement.naturalHeight });
                                        }}
                                    />

                                    {/* Map over entities to draw bounding boxes for those that have them */}
                                    {imgNaturalSize && result?.entities.map((ent, i) => {
                                        if (hoveredEntity === ent.name && ent.bounding_box) {
                                            try {
                                                const box = JSON.parse(ent.bounding_box);
                                                // DeepFace facial_area is {x, y, w, h} in absolute pixel coordinates of the original image
                                                const leftPct = (box.x / imgNaturalSize.w) * 100;
                                                const topPct = (box.y / imgNaturalSize.h) * 100;
                                                const widthPct = (box.w / imgNaturalSize.w) * 100;
                                                const heightPct = (box.h / imgNaturalSize.h) * 100;

                                                return (
                                                    <div
                                                        key={`box-${i}`}
                                                        className="absolute border-4 border-blue-500 rounded-sm shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-200 z-30 pointer-events-none"
                                                        style={{
                                                            left: `${leftPct}%`,
                                                            top: `${topPct}%`,
                                                            width: `${widthPct}%`,
                                                            height: `${heightPct}%`
                                                        }}
                                                    >
                                                        <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                                                            {ent.name}
                                                        </div>
                                                    </div>
                                                );
                                            } catch (e) {
                                                console.error("Failed to parse box for", ent.name, e);
                                            }
                                        }
                                        return null;
                                    })}
                                </div>

                                <div className="absolute inset-0 bg-black/40 hover:bg-black/60 transition-colors flex items-center justify-center z-20 opacity-0 hover:opacity-100">
                                    <p className="text-white font-medium">Click or Drop to replace</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <UploadCloud className="w-16 h-16 text-gray-500 mb-4" />
                                <p className="text-gray-300 font-medium text-lg mb-2">Click or drag image to upload</p>
                                <p className="text-gray-500 text-sm">Supports JPG, PNG, WEBP</p>
                            </>
                        )}
                    </div>

                    <button
                        onClick={handleTest}
                        disabled={!file || loading}
                        className="w-full bg-primary hover:bg-blue-600 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 text-lg"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                Processing (Takes 10-30s)...
                            </>
                        ) : (
                            'Run AI Analysis'
                        )}
                    </button>

                    {error && (
                        <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Metadata Section moved to left column */}
                    {result && result.metadata && Object.keys(result.metadata).length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Camera / Image Metadata</h3>
                            <div className="bg-surface border border-gray-800 rounded-2xl overflow-hidden shadow-xl text-sm">
                                <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse">
                                        <tbody className="divide-y divide-gray-800">
                                            {Object.entries(result.metadata).map(([key, val]) => (
                                                <tr key={key} className="hover:bg-[#262626] transition-colors">
                                                    <td className="py-3 px-5 text-gray-400 font-medium whitespace-nowrap border-r border-gray-800 font-mono text-xs w-1/3 bg-[#111]">{key}</td>
                                                    <td className="py-3 px-5 text-gray-200 truncate bg-[#161616]">{val}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Map section - only shown when GPS data exists */}
                    {result && result.gps_lat && result.gps_lon && (
                        <div className="mt-6">
                            <LocationMap lat={result.gps_lat} lon={result.gps_lon} />
                        </div>
                    )}
                </div>

                {/* Results Column */}
                <div className="bg-surface rounded-2xl border border-[#262626] p-6 shadow-2xl flex flex-col min-h-[600px]">
                    <h2 className="text-xl font-semibold text-white mb-6 border-b border-gray-800 pb-4">Analysis Results</h2>

                    {!result && !loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 space-y-4">
                            <ImageIcon className="w-16 h-16 opacity-30" />
                            <p>Upload an image and run analysis to see results here.</p>
                        </div>
                    ) : loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                            <div className="relative w-20 h-20">
                                <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-primary rounded-full animate-spin border-t-transparent shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-primary font-medium text-lg animate-pulse">Analyzing Pixels...</p>
                                <p className="text-gray-500 text-sm">Ollama Vision Model & DeepFace</p>
                            </div>
                        </div>
                    ) : result && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">LLM Scene Description</h3>
                                <div className="bg-[#111] border border-gray-800 rounded-xl p-5">
                                    <p className="text-gray-300 leading-relaxed font-serif">{result.description}</p>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Detected Entities</h3>
                                {result.entities.length === 0 ? (
                                    <div className="bg-[#111] border border-gray-800 rounded-xl p-5 text-center">
                                        <p className="text-gray-500">No people or pets detected by the models.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {result.entities.map((ent, i) => (
                                            <EntityRow
                                                key={i}
                                                ent={ent}
                                                onRename={handleRename}
                                                onDelete={handleDeleteEntity}
                                                onMouseEnter={() => setHoveredEntity(ent.name)}
                                                onMouseLeave={() => setHoveredEntity(null)}
                                                variant="card"
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* --- HISTORICAL MODEL COMPARISONS --- */}
                            {result.history && result.history.length > 0 && (
                                <div className="mt-8 pt-6 border-t border-gray-800">
                                    <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                        Previous Model Responses
                                    </h3>
                                    <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                        {result.history.map((hs) => (
                                            <div key={hs.photo_id} className="bg-[#111] border border-[#333] rounded-xl p-4 shadow-sm relative group mt-2">
                                                <div className="absolute -top-3 left-4 bg-[#1a1a1a] px-3 py-1 text-xs border border-[#444] rounded-full text-purple-300 font-mono shadow-md z-10 flex items-center gap-1">
                                                    <Sparkles className="w-3 h-3" /> {hs.ai_model}
                                                </div>
                                                <div className="mt-2 text-sm text-gray-300 leading-relaxed mb-4">
                                                    {hs.description}
                                                </div>
                                                {hs.entities && hs.entities.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detected Entities</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {hs.entities.map((e, idx) => (
                                                                <div key={idx} className={`px-2 py-1 text-xs rounded-lg border ${e.type === 'person' ? 'bg-blue-900/10 border-blue-900/30 text-blue-400' : 'bg-orange-900/10 border-orange-900/30 text-orange-400'}`}>
                                                                    {e.name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <ConfirmDialog
                    open={showConfirm}
                    title="Warning: Destructive Action"
                    message={<p>Are you sure you want to completely <strong>WIPE</strong> the Test Database? This will erase all uploaded test scans.</p>}
                    confirmLabel="CONFIRM WIPE"
                    variant="danger"
                    onConfirm={handleClearDB}
                    onCancel={() => setShowConfirm(false)}
                />
            </div>
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
