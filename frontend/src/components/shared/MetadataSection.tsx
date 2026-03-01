import React from 'react';

interface MetadataSectionProps {
    title: string;
    icon: React.ReactNode;
    data: Record<string, string>;
}

/**
 * Displays a section of key-value metadata pairs.
 * Hoisted from inside Gallery to avoid being recreated on every render.
 */
export default function MetadataSection({ title, icon, data }: MetadataSectionProps) {
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
}
