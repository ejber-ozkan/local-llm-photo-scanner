import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Camera, Search, UserCheck, Settings, Copy, Loader2 } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';

// ── Lazy-loaded route components (bundle-dynamic-imports) ─────────────
const Gallery = lazy(() => import('./components/Gallery'));
const Identify = lazy(() => import('./components/Identify'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const ScanTest = lazy(() => import('./components/ScanTest'));
const DuplicatesPage = lazy(() => import('./components/DuplicatesPage'));

// ── Lazy theme initialization (no-flicker, runs before first paint) ──
// Uses an IIFE that fires synchronously during module evaluation
// so the theme attributes are set before React mounts.
(() => {
  const mode = localStorage.getItem('themeMode') || 'dark';
  const color = localStorage.getItem('themeColor') || 'twilight';
  document.documentElement.setAttribute('data-mode', mode);
  document.documentElement.setAttribute('data-color', color);
})();

function RouteSpinner() {
  return (
    <div className="flex items-center justify-center h-full opacity-60">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function App() {
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group font-medium ${isActive
      ? 'active text-white'
      : 'text-textMuted hover:bg-[#262626] hover:text-white'
    }`;

  return (
    <BrowserRouter>
      <div className="flex bg-background text-textMain min-h-screen">
        {/* Sidebar */}
        <div className="w-64 border-r border-[#262626] bg-surface flex flex-col p-4 shadow-xl">
          <div className="flex items-center gap-3 mb-10 text-xl font-bold text-white tracking-wider">
            <Camera className="text-primary w-8 h-8" />
            <span>LLM Photo Scanner</span>
          </div>

          <nav className="flex-1 space-y-3">
            <NavLink to="/" end className={navCls}>
              <Search className="w-5 h-5 group-hover:text-primary transition-colors" />
              <span>Gallery</span>
            </NavLink>
            <NavLink to="/identify" className={navCls}>
              <UserCheck className="w-5 h-5 group-hover:text-primary transition-colors" />
              <span>Identify</span>
            </NavLink>
            <NavLink to="/duplicates" className={navCls}>
              <Copy className="w-5 h-5 group-hover:text-primary transition-colors" />
              <span>Review Duplicates</span>
            </NavLink>
            <NavLink to="/test" className={navCls}>
              <Camera className="w-5 h-5 group-hover:text-primary transition-colors" />
              <span>Scan &amp; Test</span>
            </NavLink>
            <NavLink to="/settings" className={navCls}>
              <Settings className="w-5 h-5 group-hover:text-primary transition-colors" />
              <span>Scan &amp; Settings</span>
            </NavLink>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto h-screen relative bg-gradient-to-br from-background via-background to-[#111]">
          <ErrorBoundary>
            <Suspense fallback={<RouteSpinner />}>
              <Routes>
                <Route path="/" element={<Gallery />} />
                <Route path="/identify" element={<Identify />} />
                <Route path="/duplicates" element={<DuplicatesPage />} />
                <Route path="/test" element={<ScanTest />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
