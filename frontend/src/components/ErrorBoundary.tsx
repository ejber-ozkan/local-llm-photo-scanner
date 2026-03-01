import React, { Component } from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Class-based error boundary for catching unhandled render errors.
 * Displays a friendly fallback UI instead of crashing the whole app.
 */
export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background flex items-center justify-center p-8">
                    <div className="max-w-md w-full bg-surface border border-[#333] rounded-2xl p-8 text-center">
                        <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
                        <p className="text-gray-400 mb-6">
                            The application encountered an unexpected error. Try refreshing the page.
                        </p>
                        {this.state.error ? (
                            <pre className="text-xs text-red-400 bg-[#111] rounded-lg p-4 text-left overflow-auto max-h-40 mb-6">
                                {this.state.error.message}
                            </pre>
                        ) : null}
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-white font-medium transition-colors"
                        >
                            Refresh Page
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
