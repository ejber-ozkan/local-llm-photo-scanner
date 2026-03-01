import React, { useState } from 'react';
import { User, PawPrint, FileText, Edit2, Check, X, Loader2, Trash2 } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

/** Props shared between both variants of EntityRow. */
interface EntityRowProps {
    ent: { type: string; name: string; bounding_box?: string; id?: number };
    onRename: (oldName: string, newName: string) => Promise<void>;
    onDelete: (name: string) => Promise<void>;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    /** 'compact' = Gallery inline row; 'card' = ScanTest card style */
    variant?: 'compact' | 'card';
}

/**
 * Unified EntityRow component used by Gallery and ScanTest.
 * Wrapped in React.memo to avoid re-rendering when parent state changes.
 */
const EntityRow = React.memo(function EntityRow({
    ent,
    onRename,
    onDelete,
    onMouseEnter,
    onMouseLeave,
    variant = 'compact',
}: EntityRowProps) {
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

    if (variant === 'card') {
        return (
            <div
                className="group relative flex items-center gap-3 bg-[#111] border border-gray-700 rounded-xl p-4 shadow-sm hover:border-primary transition-colors cursor-default"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
            >
                <div className={`p-2 rounded-lg ${ent.type === 'person' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>
                    {ent.type === 'person' ? <User className="w-5 h-5" /> : <PawPrint className="w-5 h-5" />}
                </div>
                <div className={`flex-1 ${isEditing ? 'min-w-[250px]' : 'min-w-[120px]'}`}>
                    {isEditing ? (
                        <div className="flex items-center gap-2 w-full">
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                className="bg-gray-800 border-2 border-primary rounded-md px-3 py-1.5 text-base text-white w-full min-w-[200px] focus:outline-none shadow-inner"
                                autoFocus
                                disabled={loading}
                            />
                            <button onClick={handleSubmit} disabled={loading} className="text-green-500 hover:text-green-400 shrink-0 p-1">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
                            </button>
                            <button onClick={() => { setIsEditing(false); setEditName(ent.name); }} disabled={loading} className="text-gray-500 hover:text-gray-400 shrink-0 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <p
                                className="text-white font-medium whitespace-normal break-words leading-tight cursor-pointer hover:text-blue-400 transition-colors"
                                title="Click to rename"
                                onClick={() => setIsEditing(true)}
                            >
                                {ent.name}
                            </p>
                            <p className="text-xs text-gray-500 capitalize mt-1">{ent.type}</p>
                        </>
                    )}
                </div>

                {!isEditing ? (
                    <div className="flex items-center gap-2 shrink-0 min-w-max ml-auto">
                        <button
                            onClick={() => setIsEditing(true)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white transition-opacity p-2 shrink-0"
                            title="Rename person"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="opacity-0 group-hover:opacity-100 text-red-500/70 hover:text-red-400 p-2 transition-opacity shrink-0"
                            title="Delete Entity"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                ) : null}

                <ConfirmDialog
                    open={confirmDelete}
                    title="Delete Entity"
                    message={<>Are you sure you want to delete <strong className="text-white">{ent.name}</strong>? This will remove all instances of this entity from every photo.</>}
                    confirmLabel="Delete"
                    variant="danger"
                    onConfirm={() => { setConfirmDelete(false); onDelete(ent.name); }}
                    onCancel={() => setConfirmDelete(false)}
                />
            </div>
        );
    }

    // ── Compact variant (Gallery) ──
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

                {!isEditing ? (
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
                ) : null}
            </div>

            <ConfirmDialog
                open={confirmDelete}
                title="Delete Entity"
                message={<>Are you sure you want to delete <strong className="text-white">{ent.name}</strong>? This will remove all instances of this entity from every photo.</>}
                confirmLabel="Delete"
                variant="danger"
                onConfirm={() => { setConfirmDelete(false); onDelete(ent.name); }}
                onCancel={() => setConfirmDelete(false)}
            />
        </>
    );
});

export default EntityRow;
