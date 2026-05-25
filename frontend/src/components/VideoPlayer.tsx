/**
 * VideoPlayer.tsx
 *
 * Lazily-loaded Video.js v10 (@videojs/react) wrapper component.
 * Replaces the bare <video> element in FoldersPage for a richer playback
 * experience with seek, volume, fullscreen, PiP, and playback-rate controls.
 *
 * Isolated here so Video.js bundle (~200KB) is only downloaded on-demand
 * when the user first opens a video in the media viewer.
 */

// Import the Video.js skin CSS with ?inline so Vite treats it as a raw string
// and injects it via a <style> tag, bypassing PostCSS/Tailwind processing.
// This avoids the "Nested CSS" warning caused by the skin's use of native CSS nesting.
import skinCss from '@videojs/react/video/skin.css?inline';
import { useEffect } from 'react';
import { createPlayer, videoFeatures } from '@videojs/react';
import { VideoSkin, Video } from '@videojs/react/video';

// Create a singleton player factory with the standard video feature-set.
// videoFeatures includes: playback, volume, fullscreen, PiP, seek, playback rate, buffering.
const Player = createPlayer({ features: videoFeatures });

interface VideoPlayerProps {
    /** Full URL for the media source (from the FastAPI /api/folder-scan/media endpoint). */
    src: string;
}

/**
 * VideoPlayer
 *
 * Renders a Video.js v10 player with the default skin, auto-playing and
 * fitting within the parent container. Dark-theme overrides are applied via
 * inline CSS custom properties so the player blends with the glassmorphic UI.
 */
export default function VideoPlayer({ src }: VideoPlayerProps) {
    // Inject the Video.js skin CSS once into the document head.
    // Using ?inline bypasses PostCSS so Tailwind's nesting plugin doesn't conflict.
    useEffect(() => {
        const styleId = 'videojs-skin-css';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = skinCss;
            document.head.appendChild(style);
        }
    }, []);

    return (
        <div
            className="w-full h-full flex items-center justify-center"
            style={
                {
                    // Override Video.js skin CSS variables for the dark theme
                    '--vjs-color-background': 'transparent',
                    '--vjs-color-primary': '#6366f1', // indigo-500 — matches app accent
                    '--vjs-color-secondary': '#1e1e2e',
                    '--vjs-color-text': '#e2e8f0',
                    '--vjs-color-icon': '#e2e8f0',
                    '--vjs-border-radius': '0.75rem',
                } as React.CSSProperties
            }
        >
            <Player.Provider>
                <VideoSkin>
                    <Video
                        src={src}
                        playsInline
                        autoPlay
                        style={{
                            maxWidth: '100%',
                            maxHeight: '70vh',
                            borderRadius: '0.5rem',
                        }}
                    />
                </VideoSkin>
            </Player.Provider>
        </div>
    );
}
