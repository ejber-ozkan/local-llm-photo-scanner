import axios from 'axios';
import { ChevronLeft, Image as ImageIcon, Images, Layers, Loader2, LocateFixed, Map as MapIcon, Minus, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import { API_BASE_URL } from '../config';
import type { MapPhoto } from '../types';

type MapProvider = 'openstreetmap' | 'google';

interface Size {
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
}

interface Tile {
    key: string;
    left: number;
    top: number;
    src: string;
}

interface PhotoCluster {
    key: string;
    photos: MapPhoto[];
    x: number;
    y: number;
    lat: number;
    lon: number;
}

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const DEFAULT_CENTER = { lat: 20, lon: 0 };
const MAX_EXPANDED_THUMBNAILS = 8;
const PROVIDER_LABELS: Record<MapProvider, string> = {
    openstreetmap: 'OpenStreetMap',
    google: 'Google Maps',
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function lonToX(lon: number, zoom: number) {
    return ((lon + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

function latToY(lat: number, zoom: number) {
    const safeLat = clamp(lat, -85.05112878, 85.05112878);
    const rad = (safeLat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILE_SIZE * 2 ** zoom;
}

function xToLon(x: number, zoom: number) {
    return (x / (TILE_SIZE * 2 ** zoom)) * 360 - 180;
}

function yToLat(y: number, zoom: number) {
    const n = Math.PI - (2 * Math.PI * y) / (TILE_SIZE * 2 ** zoom);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function project(lat: number, lon: number, zoom: number): Point {
    return { x: lonToX(lon, zoom), y: latToY(lat, zoom) };
}

function tileUrl(provider: MapProvider, x: number, y: number, zoom: number) {
    if (provider === 'google') {
        const server = Math.abs(x + y) % 4;
        return `https://mt${server}.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${zoom}`;
    }
    const server = ['a', 'b', 'c'][Math.abs(x + y) % 3];
    return `https://${server}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function getClusterGridSize(zoom: number) {
    if (zoom <= 4) return 92;
    if (zoom <= 8) return 76;
    if (zoom <= 11) return 62;
    return 46;
}

function formatLocation(lat: number, lon: number) {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function getPhotoImageUrl(photo: MapPhoto, timestamp: number) {
    if (photo.source === 'local' && photo.filepath) {
        return `${API_BASE_URL}/api/folder-scan/media-preview?path=${encodeURIComponent(photo.filepath)}&t=${timestamp}`;
    }
    return `${API_BASE_URL}/api/image/${photo.id}?t=${timestamp}`;
}

export default function ImageMapPage() {
    const [photos, setPhotos] = useState<MapPhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [includeLocal, setIncludeLocal] = useState(false);
    const [provider, setProvider] = useState<MapProvider>('openstreetmap');
    const [zoom, setZoom] = useState(3);
    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });
    const [selectedPhoto, setSelectedPhoto] = useState<MapPhoto | null>(null);
    const [expandedCluster, setExpandedCluster] = useState<PhotoCluster | null>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ start: Point; centerStart: Point } | null>(null);
    const [timestamp] = useState(Date.now);

    useEffect(() => {
        let active = true;

        async function fetchMapPhotos() {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (includeLocal) params.set('include_local', 'true');
                const query = params.toString();
                const res = await axios.get<MapPhoto[]>(`${API_BASE_URL}/api/gallery/map${query ? `?${query}` : ''}`);
                if (!active) return;
                const nextPhotos = res.data.filter((photo) =>
                    Number.isFinite(photo.gps_lat) && Number.isFinite(photo.gps_lon)
                );
                setPhotos(nextPhotos);
                setExpandedCluster(null);
                if (nextPhotos.length > 0) {
                    const average = nextPhotos.reduce(
                        (acc, photo) => ({ lat: acc.lat + photo.gps_lat, lon: acc.lon + photo.gps_lon }),
                        { lat: 0, lon: 0 },
                    );
                    setCenter({
                        lat: average.lat / nextPhotos.length,
                        lon: average.lon / nextPhotos.length,
                    });
                    setZoom(nextPhotos.length === 1 ? 12 : 4);
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (active) setLoading(false);
            }
        }

        fetchMapPhotos();

        return () => {
            active = false;
        };
    }, [includeLocal]);

    useEffect(() => {
        const el = mapRef.current;
        if (!el) return;

        const observer = new ResizeObserver(([entry]) => {
            setSize({
                width: Math.round(entry.contentRect.width),
                height: Math.round(entry.contentRect.height),
            });
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const centerPx = useMemo(() => project(center.lat, center.lon, zoom), [center.lat, center.lon, zoom]);

    const tiles = useMemo<Tile[]>(() => {
        if (size.width <= 0 || size.height <= 0) return [];

        const scale = 2 ** zoom;
        const minX = Math.floor((centerPx.x - size.width / 2) / TILE_SIZE) - 1;
        const maxX = Math.floor((centerPx.x + size.width / 2) / TILE_SIZE) + 1;
        const minY = Math.floor((centerPx.y - size.height / 2) / TILE_SIZE) - 1;
        const maxY = Math.floor((centerPx.y + size.height / 2) / TILE_SIZE) + 1;
        const nextTiles: Tile[] = [];

        for (let x = minX; x <= maxX; x += 1) {
            const wrappedX = ((x % scale) + scale) % scale;
            for (let y = minY; y <= maxY; y += 1) {
                if (y < 0 || y >= scale) continue;
                nextTiles.push({
                    key: `${provider}-${zoom}-${x}-${y}`,
                    left: x * TILE_SIZE - centerPx.x + size.width / 2,
                    top: y * TILE_SIZE - centerPx.y + size.height / 2,
                    src: tileUrl(provider, wrappedX, y, zoom),
                });
            }
        }

        return nextTiles;
    }, [centerPx.x, centerPx.y, provider, size.height, size.width, zoom]);

    const clusters = useMemo<PhotoCluster[]>(() => {
        if (size.width <= 0 || size.height <= 0) return [];

        const gridSize = getClusterGridSize(zoom);
        const byCell = new Map<string, { photos: MapPhoto[]; xTotal: number; yTotal: number; latTotal: number; lonTotal: number }>();

        for (const photo of photos) {
            const photoPx = project(photo.gps_lat, photo.gps_lon, zoom);
            const screenX = photoPx.x - centerPx.x + size.width / 2;
            const screenY = photoPx.y - centerPx.y + size.height / 2;

            if (screenX < -140 || screenX > size.width + 140 || screenY < -140 || screenY > size.height + 140) {
                continue;
            }

            const cell = `${Math.floor(screenX / gridSize)}:${Math.floor(screenY / gridSize)}`;
            const existing = byCell.get(cell);
            if (existing) {
                existing.photos.push(photo);
                existing.xTotal += screenX;
                existing.yTotal += screenY;
                existing.latTotal += photo.gps_lat;
                existing.lonTotal += photo.gps_lon;
            } else {
                byCell.set(cell, {
                    photos: [photo],
                    xTotal: screenX,
                    yTotal: screenY,
                    latTotal: photo.gps_lat,
                    lonTotal: photo.gps_lon,
                });
            }
        }

        return Array.from(byCell.entries()).map(([key, cell]) => {
            const count = cell.photos.length;
            return {
                key,
                photos: cell.photos,
                x: cell.xTotal / count,
                y: cell.yTotal / count,
                lat: cell.latTotal / count,
                lon: cell.lonTotal / count,
            };
        });
    }, [centerPx.x, centerPx.y, photos, size.height, size.width, zoom]);

    const visiblePhotoCount = useMemo(() => clusters.reduce((sum, cluster) => sum + cluster.photos.length, 0), [clusters]);

    const zoomBy = useCallback((delta: number, target?: { lat: number; lon: number }) => {
        setZoom((prev) => clamp(prev + delta, MIN_ZOOM, MAX_ZOOM));
        if (target) setCenter(target);
        setExpandedCluster(null);
    }, []);

    const resetToPhotos = useCallback(() => {
        if (photos.length === 0) {
            setCenter(DEFAULT_CENTER);
            setZoom(3);
            return;
        }

        const average = photos.reduce(
            (acc, photo) => ({ lat: acc.lat + photo.gps_lat, lon: acc.lon + photo.gps_lon }),
            { lat: 0, lon: 0 },
        );
        setCenter({ lat: average.lat / photos.length, lon: average.lon / photos.length });
        setZoom(photos.length === 1 ? 12 : 4);
        setExpandedCluster(null);
    }, [photos]);

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest('button, a')) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = {
            start: { x: event.clientX, y: event.clientY },
            centerStart: centerPx,
        };
    };

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current) return;
        setExpandedCluster(null);
        const dx = event.clientX - dragRef.current.start.x;
        const dy = event.clientY - dragRef.current.start.y;
        const nextX = dragRef.current.centerStart.x - dx;
        const nextY = dragRef.current.centerStart.y - dy;
        setCenter({ lat: yToLat(nextY, zoom), lon: xToLon(nextX, zoom) });
    };

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (dragRef.current) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            dragRef.current = null;
        }
    };

    const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1 : -1);
    };

    const handleClusterClick = (cluster: PhotoCluster) => {
        if (cluster.photos.length === 1) {
            setSelectedPhoto(cluster.photos[0]);
            setExpandedCluster(null);
            return;
        }
        setExpandedCluster(cluster);
    };

    const handleMapBackgroundClick = () => {
        setExpandedCluster(null);
    };

    return (
        <div className="h-full w-full bg-[#061014] text-white">
            <div
                ref={mapRef}
                className="relative h-full w-full overflow-hidden touch-none select-none bg-[#10242a]"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                onClick={handleMapBackgroundClick}
                role="application"
                aria-label="Image Maps"
            >
                {tiles.map((tile) => (
                    <img
                        key={tile.key}
                        src={tile.src}
                        alt=""
                        draggable={false}
                        className="absolute h-64 w-64 max-w-none"
                        style={{ left: tile.left, top: tile.top }}
                    />
                ))}

                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.10),transparent_42%),linear-gradient(180deg,rgba(4,16,22,0.08),rgba(4,16,22,0.30))]" />

                {clusters.map((cluster) => {
                    const representative = cluster.photos[0];
                    const showThumbnail = cluster.photos.length === 1 || zoom >= 8;
                    const markerSize = cluster.photos.length === 1 ? 92 : 82;
                    return (
                        <button
                            key={cluster.key}
                            type="button"
                            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white bg-black/75 shadow-[0_16px_35px_rgba(0,0,0,0.45)] transition-transform duration-150 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                            style={{ left: cluster.x, top: cluster.y, width: markerSize, height: markerSize }}
                            onClick={(event) => {
                                event.stopPropagation();
                                handleClusterClick(cluster);
                            }}
                            aria-label={
                                cluster.photos.length === 1
                                    ? `Open ${representative.filename}`
                                    : `Show ${cluster.photos.length} images near ${formatLocation(cluster.lat, cluster.lon)}`
                            }
                            title={cluster.photos.length === 1 ? representative.filename : `${cluster.photos.length} images`}
                        >
                            {showThumbnail ? (
                                <img
                                    src={getPhotoImageUrl(representative, timestamp)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full rounded-[14px] object-cover"
                                />
                            ) : (
                                <span className="flex h-full w-full items-center justify-center rounded-[14px] bg-cyan-300/15">
                                    <ImageIcon className="h-8 w-8 text-cyan-100" />
                                </span>
                            )}
                            {cluster.photos.length > 1 && (
                                <span className="absolute bottom-1 left-1 rounded-md bg-black/75 px-1.5 py-0.5 text-sm font-bold text-white shadow">
                                    {cluster.photos.length}
                                </span>
                            )}
                        </button>
                    );
                })}

                {expandedCluster && (
                    <div
                        className="absolute z-40"
                        style={{ left: expandedCluster.x, top: expandedCluster.y }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        {expandedCluster.photos.slice(0, MAX_EXPANDED_THUMBNAILS).map((photo, index, visiblePhotos) => {
                            const angle = (index / Math.max(visiblePhotos.length, 1)) * Math.PI * 2 - Math.PI / 2;
                            const radius = visiblePhotos.length <= 3 ? 96 : 122;
                            const x = Math.cos(angle) * radius;
                            const y = Math.sin(angle) * radius;
                            return (
                                <button
                                    key={`${photo.source}-${photo.id}`}
                                    type="button"
                                    className="absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-end overflow-hidden rounded-2xl border-2 border-white bg-black shadow-[0_18px_35px_rgba(0,0,0,0.50)] transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                    style={{ left: x, top: y }}
                                    onClick={() => {
                                        setSelectedPhoto(photo);
                                        setExpandedCluster(null);
                                    }}
                                    aria-label={`Open ${photo.filename}`}
                                    title={photo.filename}
                                >
                                    <img
                                        src={getPhotoImageUrl(photo, timestamp)}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        className="absolute inset-0 h-full w-full object-cover"
                                    />
                                    <span className="relative w-full truncate bg-black/70 px-1.5 py-1 text-left text-[10px] font-semibold text-white">
                                        {photo.filename}
                                    </span>
                                </button>
                            );
                        })}
                        <div className="absolute left-0 top-0 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/70 text-sm font-bold text-white shadow-xl">
                            {expandedCluster.photos.length}
                        </div>
                        {expandedCluster.photos.length > MAX_EXPANDED_THUMBNAILS && (
                            <button
                                type="button"
                                className="absolute left-0 top-[100px] -translate-x-1/2 rounded-full border border-white/25 bg-black/70 px-3 py-1 text-xs font-semibold text-white shadow-xl hover:bg-black/85"
                                onClick={() => zoomBy(2, { lat: expandedCluster.lat, lon: expandedCluster.lon })}
                            >
                                +{expandedCluster.photos.length - MAX_EXPANDED_THUMBNAILS} more
                            </button>
                        )}
                    </div>
                )}

                <div className="absolute left-6 top-6 z-30 flex max-w-[calc(100%-3rem)] items-center gap-3">
                    <div className="rounded-full bg-cyan-100/85 p-2 text-[#06313a] shadow-xl backdrop-blur">
                        <ChevronLeft className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 rounded-lg border border-white/15 bg-black/45 px-4 py-3 shadow-xl backdrop-blur-md">
                        <h1 className="truncate text-lg font-bold">Image Maps</h1>
                        <p className="truncate text-xs text-white/70">
                            {loading ? 'Loading GPS photos' : `${photos.length} geotagged photos, ${visiblePhotoCount} in view`}
                        </p>
                    </div>
                </div>

                <div className="absolute right-6 top-6 z-30 overflow-hidden rounded-lg border border-white/20 bg-cyan-100/85 text-[#06313a] shadow-xl backdrop-blur">
                    <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            setProvider(provider === 'openstreetmap' ? 'google' : 'openstreetmap');
                            setExpandedCluster(null);
                        }}
                        className="flex h-14 w-14 items-center justify-center border-b border-[#06313a]/15 transition-colors hover:bg-white/50"
                        title={`Switch map provider. Current: ${PROVIDER_LABELS[provider]}`}
                        aria-label={`Switch map provider. Current provider is ${PROVIDER_LABELS[provider]}`}
                    >
                        <Layers className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            resetToPhotos();
                        }}
                        className="flex h-14 w-14 items-center justify-center transition-colors hover:bg-white/50"
                        title="Recenter photos"
                        aria-label="Recenter photos"
                    >
                        <LocateFixed className="h-5 w-5" />
                    </button>
                </div>

                <div className="absolute bottom-6 right-6 z-30 flex items-center gap-3">
                    <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            setIncludeLocal((current) => !current);
                        }}
                        className={`flex h-14 w-14 items-center justify-center rounded-lg border border-white/20 shadow-xl backdrop-blur transition-colors ${includeLocal ? 'bg-emerald-300/90 text-[#06313a]' : 'bg-cyan-100/85 text-[#06313a] hover:bg-white/85'}`}
                        title={includeLocal ? 'Hide non-AI scanned images' : 'Include non-AI scanned images'}
                        aria-label={includeLocal ? 'Hide non-AI scanned images' : 'Include non-AI scanned images'}
                    >
                        <Images className="h-5 w-5" />
                    </button>
                    <div className="overflow-hidden rounded-lg border border-white/20 bg-cyan-100/85 text-[#06313a] shadow-xl backdrop-blur">
                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                zoomBy(1);
                            }}
                            className="flex h-12 w-12 items-center justify-center border-b border-[#06313a]/15 transition-colors hover:bg-white/50"
                            aria-label="Zoom in"
                        >
                            <Plus className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                zoomBy(-1);
                            }}
                            className="flex h-12 w-12 items-center justify-center transition-colors hover:bg-white/50"
                            aria-label="Zoom out"
                        >
                            <Minus className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="rounded-full bg-cyan-300/90 p-4 text-[#06313a] shadow-xl backdrop-blur">
                        <MapIcon className="h-6 w-6" />
                    </div>
                </div>

                <div className="absolute bottom-4 left-6 z-30 rounded bg-black/35 px-2 py-1 text-[10px] text-white/65 backdrop-blur">
                    {PROVIDER_LABELS[provider]} tiles{includeLocal ? ' + local indexed images' : ''}
                </div>

                {loading && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-sm">
                        <div className="flex items-center gap-3 rounded-lg border border-white/15 bg-[#0f171b] px-5 py-4 text-sm text-white shadow-xl">
                            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                            Loading map photos
                        </div>
                    </div>
                )}

                {!loading && photos.length === 0 && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
                        <div className="max-w-md rounded-lg border border-white/15 bg-black/55 p-6 text-center shadow-xl backdrop-blur-md">
                            <ImageIcon className="mx-auto mb-3 h-10 w-10 text-cyan-200" />
                            <h2 className="text-lg font-bold">No geotagged photos yet</h2>
                            <p className="mt-2 text-sm text-white/65">Scan images with GPS metadata, or enable local indexed images, to see them grouped on the map.</p>
                        </div>
                    </div>
                )}
            </div>

            {selectedPhoto && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-5" onClick={() => setSelectedPhoto(null)}>
                    <button
                        type="button"
                        onClick={() => setSelectedPhoto(null)}
                        className="absolute right-6 top-6 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
                        aria-label="Close full image"
                    >
                        <X className="h-6 w-6" />
                    </button>
                    <img
                        src={getPhotoImageUrl(selectedPhoto, timestamp)}
                        alt={selectedPhoto.filename}
                        className="max-h-full max-w-full object-contain"
                        onClick={(event) => event.stopPropagation()}
                    />
                    <div className="absolute bottom-6 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-lg bg-black/60 px-4 py-3 text-center text-white backdrop-blur">
                        <p className="truncate text-sm font-semibold">{selectedPhoto.filename}</p>
                        <p className="mt-1 text-xs text-white/65">{formatLocation(selectedPhoto.gps_lat, selectedPhoto.gps_lon)}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
