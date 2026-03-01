import { useState, useEffect } from 'react';
import axios from 'axios';
import { UserCheck, Tag, Loader2, X, User, PawPrint, Check, Edit2, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Entity, PhotoEntity, UniquePhoto } from '../types';
import ConfirmDialog from './shared/ConfirmDialog';

export default function Identify() {
    const [entities, setEntities] = useState<Entity[]>([]);
    const [loading, setLoading] = useState(false);
    const [names, setNames] = useState<Record<number, string>>({});
    const [submitting, setSubmitting] = useState<number | null>(null);

    // Modal state
    const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
    const [photoEntities, setPhotoEntities] = useState<PhotoEntity[]>([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
    const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number, h: number } | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<PhotoEntity | null>(null);
    const [timestamp] = useState(Date.now());

    const fetchUnidentified = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/unidentified`);
            setEntities(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUnidentified();
    }, []);

    // Deduplicate entities by photo_id — show each photo only once
    const uniquePhotos: UniquePhoto[] = [];
    const seenPhotoIds = new Set<number>();
    for (const entity of entities) {
        if (!seenPhotoIds.has(entity.photo_id)) {
            seenPhotoIds.add(entity.photo_id);
            uniquePhotos.push({
                photo_id: entity.photo_id,
                entities: entities.filter(e => e.photo_id === entity.photo_id)
            });
        }
    }

    const openModal = async (photoId: number) => {
        setSelectedPhotoId(photoId);
        setModalLoading(true);
        setImgNaturalSize(null);
        setHoveredEntity(null);
        setConfirmDelete(null);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/photo/${photoId}/entities`);
            setPhotoEntities(res.data);
        } catch (err) {
            console.error(err);
            setPhotoEntities([]);
        } finally {
            setModalLoading(false);
        }
    };

    const closeModal = () => {
        setSelectedPhotoId(null);
        setPhotoEntities([]);
        setHoveredEntity(null);
        setImgNaturalSize(null);
        setEditingId(null);
        setConfirmDelete(null);
    };

    const handleNameEntity = async (entityId: number, entityName: string, newName?: string) => {
        const nameToUse = newName || names[entityId];
        if (!nameToUse?.trim()) return;

        setSubmitting(entityId);
        try {
            await axios.post(`${API_BASE_URL}/api/entities/name`, {
                entity_id: entityName,
                new_name: nameToUse
            });
            // Update in photo entities list
            setPhotoEntities(prev => prev.map(e =>
                e.id === entityId ? { ...e, name: nameToUse } : e
            ));
            // Remove from main unidentified list
            setEntities(prev => prev.filter(e => e.id !== entityId));
            setNames(prev => {
                const next = { ...prev };
                delete next[entityId];
                return next;
            });
            setEditingId(null);
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(null);
        }
    };

    const handleDeleteEntity = async (entityName: string) => {
        try {
            await axios.delete(`${API_BASE_URL}/api/entities/${encodeURIComponent(entityName)}`);
            // Remove from modal list
            setPhotoEntities(prev => prev.filter(e => e.name !== entityName));
            // Remove from main unidentified list
            setEntities(prev => prev.filter(e => e.name !== entityName));
            setConfirmDelete(null);
        } catch (err) {
            console.error(err);
        }
    };

    // Render bounding boxes over the image
    const renderBoundingBoxes = () => {
        if (!imgNaturalSize) return null;

        return photoEntities.map((ent, i) => {
            if (!ent.bounding_box) return null;

            const isHovered = hoveredEntity === ent.name;
            const isUnknown = ent.name.startsWith('Unknown');

            try {
                const box = JSON.parse(ent.bounding_box);
                const leftPct = (box.x / imgNaturalSize.w) * 100;
                const topPct = (box.y / imgNaturalSize.h) * 100;
                const widthPct = (box.w / imgNaturalSize.w) * 100;
                const heightPct = (box.h / imgNaturalSize.h) * 100;

                return (
                    <div
                        key={`box-${i}`}
                        className={`absolute rounded-sm pointer-events-none transition-all duration-300 ${isHovered
                            ? 'border-4 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)] z-30'
                            : 'border-2 border-blue-400/40 z-20'
                            }`}
                        style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`
                        }}
                    >
                        <div className={`absolute -top-6 left-0 text-white text-xs font-bold px-2 py-1 rounded whitespace-nowrap transition-all duration-300 ${isHovered ? 'bg-blue-500 scale-105' : 'bg-blue-500/50 scale-100'
                            }`}>
                            {ent.name}{isUnknown ? ' ⚠' : ''}
                        </div>
                    </div>
                );
            } catch {
                return null;
            }
        });
    };

    return (
        <div className="p-8 pb-20 max-w-7xl mx-auto">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <UserCheck className="text-primary w-8 h-8" />
                    Identify Unknown Faces & Pets
                </h1>
                <p className="text-gray-400 mt-2 text-lg">Click on any card to open the photo and identify who's who using bounding boxes.</p>
            </div>

            {loading ? (
                <div className="flex justify-center mt-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary"></div>
                </div>
            ) : uniquePhotos.length === 0 ? (
                <div className="bg-surface rounded-2xl p-12 text-center border border-[#333]">
                    <p className="text-xl text-gray-300">All caught up! No unknown entities to identify.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {uniquePhotos.map(photo => (
                        <div
                            key={photo.photo_id}
                            className="bg-surface rounded-2xl overflow-hidden shadow-2xl border border-[#262626] flex flex-col transition-transform hover:-translate-y-1 cursor-pointer group"
                            onClick={() => openModal(photo.photo_id)}
                        >
                            <div className="relative h-48 bg-black overflow-hidden flex items-center justify-center">
                                <img
                                    src={`${API_BASE_URL}/api/image/${photo.photo_id}?t=${timestamp}`}
                                    alt="Entity context"
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                />
                                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold text-white border border-gray-600 flex items-center gap-2">
                                    <Tag className="w-3 h-3" />
                                    {photo.entities.length} unknown
                                </div>
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                    <span className="text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity text-sm bg-primary/80 px-4 py-2 rounded-lg">
                                        Click to Identify
                                    </span>
                                </div>
                            </div>
                            <div className="p-5 flex-1 flex flex-col">
                                <p className="text-gray-300 font-medium truncate">
                                    {photo.entities.map(e => e.name).join(', ')}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">{photo.entities.length} unidentified entit{photo.entities.length === 1 ? 'y' : 'ies'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ========== FULL SCREEN MODAL ========== */}
            {selectedPhotoId && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div className="bg-surface rounded-2xl border border-[#333] shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-800">
                            <div>
                                <h2 className="text-xl font-bold text-white">Identify People in Photo</h2>
                                <p className="text-sm text-gray-400 mt-1">Hover over a name to highlight their face. Click to rename or delete.</p>
                            </div>
                            <button onClick={closeModal} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Image with bounding boxes */}
                                <div className="relative flex items-center justify-center bg-black rounded-xl overflow-hidden min-h-[300px]">
                                    {selectedPhotoId && (
                                        <div className="relative w-full h-full flex items-center justify-center">
                                            <img
                                                src={`${API_BASE_URL}/api/image/${selectedPhotoId}?t=${timestamp}`}
                                                alt="Full photo"
                                                className="max-w-full max-h-[60vh] object-contain rounded-lg"
                                                onLoad={(e) => {
                                                    const imgEl = e.target as HTMLImageElement;
                                                    setImgNaturalSize({ w: imgEl.naturalWidth, h: imgEl.naturalHeight });
                                                }}
                                            />
                                            {/* Bounding box overlays */}
                                            {renderBoundingBoxes()}
                                        </div>
                                    )}
                                </div>

                                {/* Entity list with hover/rename/delete */}
                                <div className="flex flex-col">
                                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                                        Detected Entities ({photoEntities.length})
                                    </h3>

                                    {modalLoading ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3 overflow-y-auto max-h-[50vh] pr-2 custom-scrollbar">
                                            {photoEntities.map((ent) => {
                                                const isUnknown = ent.name.startsWith('Unknown');
                                                const isEditing = editingId === ent.id;

                                                return (
                                                    <div
                                                        key={ent.id}
                                                        className={`group flex items-center gap-3 bg-[#111] border rounded-xl p-4 shadow-sm transition-all cursor-default ${hoveredEntity === ent.name ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-500'
                                                            }`}
                                                        onMouseEnter={() => setHoveredEntity(ent.name)}
                                                        onMouseLeave={() => setHoveredEntity(null)}
                                                    >
                                                        <div className={`p-2 rounded-lg shrink-0 ${ent.type === 'person' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>
                                                            {ent.type === 'person' ? <User className="w-5 h-5" /> : <PawPrint className="w-5 h-5" />}
                                                        </div>

                                                        <div className="flex-1 min-w-0">
                                                            {isEditing ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={editName}
                                                                        onChange={(e) => setEditName(e.target.value)}
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleNameEntity(ent.id, ent.name, editName)}
                                                                        className="bg-gray-800 border-2 border-primary rounded-md px-3 py-1.5 text-sm text-white w-full focus:outline-none shadow-inner"
                                                                        autoFocus
                                                                        placeholder="Enter real name..."
                                                                    />
                                                                    <button
                                                                        onClick={() => handleNameEntity(ent.id, ent.name, editName)}
                                                                        disabled={!editName.trim() || submitting === ent.id}
                                                                        className="text-green-500 hover:text-green-400 shrink-0 p-1"
                                                                    >
                                                                        {submitting === ent.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
                                                                    </button>
                                                                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-400 shrink-0 p-1">
                                                                        <X className="w-5 h-5" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <p
                                                                        className={`font-medium whitespace-normal break-words leading-tight transition-colors ${isUnknown ? 'text-yellow-400 cursor-pointer hover:text-yellow-300' : 'text-white cursor-pointer hover:text-blue-400'
                                                                            }`}
                                                                        title="Click to rename"
                                                                        onClick={() => { setEditingId(ent.id); setEditName(isUnknown ? '' : ent.name); }}
                                                                    >
                                                                        {ent.name}
                                                                        {isUnknown && <span className="ml-2 text-xs text-yellow-600">(click to name)</span>}
                                                                    </p>
                                                                    <p className="text-xs text-gray-500 capitalize mt-1">{ent.type}</p>
                                                                </>
                                                            )}
                                                        </div>

                                                        {!isEditing && (
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                                <button
                                                                    onClick={() => { setEditingId(ent.id); setEditName(isUnknown ? '' : ent.name); }}
                                                                    className="text-gray-400 hover:text-white p-2"
                                                                    title="Rename"
                                                                >
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => setConfirmDelete(ent)}
                                                                    className="text-gray-400 hover:text-red-400 p-2"
                                                                    title="Delete entity"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm delete dialog */}
            <ConfirmDialog
                open={confirmDelete !== null}
                title="Delete Entity"
                message={confirmDelete ? <>Are you sure you want to delete <strong className="text-white">{confirmDelete.name}</strong>? This will remove all instances of this entity from every photo.</> : ''}
                confirmLabel="Delete"
                variant="danger"
                onConfirm={() => { if (confirmDelete) handleDeleteEntity(confirmDelete.name); }}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}
