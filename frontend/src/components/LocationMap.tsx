import { MapPin } from 'lucide-react';

interface LocationMapProps {
    lat: number;
    lon: number;
    compact?: boolean;  // smaller variant for Gallery modal
}

export default function LocationMap({ lat, lon, compact = false }: LocationMapProps) {
    const zoom = compact ? 13 : 14;
    const height = compact ? 'h-48' : 'h-64';

    // OpenStreetMap embed URL (no API key needed)
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.008},${lon + 0.01},${lat + 0.008}&layer=mapnik&marker=${lat},${lon}`;
    const fullMapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;

    return (
        <div className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-red-400" />
                    Photo Location
                </h4>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-mono">
                        {lat.toFixed(4)}°, {lon.toFixed(4)}°
                    </span>
                    <a
                        href={fullMapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                        onClick={(e) => e.stopPropagation()}
                    >
                        Open in Maps ↗
                    </a>
                </div>
            </div>
            <iframe
                src={mapUrl}
                className={`w-full ${height} border-0`}
                loading="lazy"
                title="Photo location map"
                style={{ filter: 'invert(0.9) hue-rotate(200deg) saturate(0.6) brightness(0.95)' }}
            />
        </div>
    );
}
