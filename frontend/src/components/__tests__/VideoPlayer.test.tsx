import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideoPlayer from '../VideoPlayer';

vi.mock('@videojs/react', () => ({
    createPlayer: () => ({
        Provider: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="player-provider">{children}</div>
        ),
    }),
    videoFeatures: ['playback', 'volume'],
}));

vi.mock('@videojs/react/video', () => ({
    VideoSkin: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="video-skin">{children}</div>
    ),
    Video: ({ src, autoPlay, playsInline, style }: { src: string; autoPlay?: boolean; playsInline?: boolean; style?: React.CSSProperties }) => (
        <video data-testid="video-element" src={src} autoPlay={autoPlay} playsInline={playsInline} style={style} />
    ),
}));

describe('VideoPlayer', () => {
    it('renders a themed Video.js player with the provided media URL', () => {
        render(<VideoPlayer src="http://localhost:8000/media/movie.mp4" />);

        expect(screen.getByTestId('player-provider')).toBeInTheDocument();
        expect(screen.getByTestId('video-skin')).toBeInTheDocument();
        expect(screen.getByTestId('video-element')).toHaveAttribute('src', 'http://localhost:8000/media/movie.mp4');
        expect(screen.getByTestId('video-element')).toHaveAttribute('autoplay');
        expect(screen.getByTestId('video-element')).toHaveAttribute('playsinline');
    });

    it('injects the Video.js skin CSS only once', () => {
        const { rerender } = render(<VideoPlayer src="one.mp4" />);

        expect(document.head.querySelectorAll('#videojs-skin-css')).toHaveLength(1);

        rerender(<VideoPlayer src="two.mp4" />);

        expect(document.head.querySelectorAll('#videojs-skin-css')).toHaveLength(1);
        expect(screen.getByTestId('video-element')).toHaveAttribute('src', 'two.mp4');
    });
});
