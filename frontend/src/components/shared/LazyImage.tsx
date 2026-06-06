import { useState, useEffect, useRef } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    className?: string;
    rootMargin?: string;
}

export default function LazyImage({ src, alt, className = '', rootMargin = '100px', ...props }: LazyImageProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safe check for testing environments or old browsers
        if (typeof window === 'undefined' || !window.IntersectionObserver) {
            setIsInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observer.disconnect();
                    }
                });
            },
            { rootMargin }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            observer.disconnect();
        };
    }, [rootMargin]);

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden w-full h-full ${className}`}
        >
            {/* Pulsing skeleton placeholder shown until loaded */}
            {!isLoaded && (
                <div 
                    data-testid="lazy-image-placeholder"
                    className="absolute inset-0 bg-gray-800 animate-pulse flex items-center justify-center"
                >
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {/* Actual image rendered only when in view */}
            {isInView && (
                <img
                    src={src}
                    alt={alt}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                        isLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setIsLoaded(true)}
                    {...props}
                />
            )}
        </div>
    );
}
