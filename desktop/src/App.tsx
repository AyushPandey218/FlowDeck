import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { LayoutDashboard, Layers, Activity, Settings as SettingsIcon, ChevronLeft, ChevronRight, Clipboard, ArrowLeftRight } from 'lucide-react';
import './App.css';
import { ROUTES } from './config/constants';
import { THEME } from './config/theme';
import { useUIStore } from './store/uiStore';
import Dashboard from './pages/Dashboard';
import Actions from './pages/Actions';
import Monitor from './pages/Monitor';
import Settings from './pages/Settings';
import ClipboardPanel from './pages/ClipboardPanel';
import Transfers from './pages/Transfers';

import { ToastProvider } from './components/ToastSystem';
import { DialogProvider } from './components/DialogSystem';

function AppContent() {
  const { currentPage, sidebarCollapsed, isOnboarding, setCurrentPage, toggleSidebar, setIsOnboarding } = useUIStore();

  // Load initial onboarding status
  useEffect(() => {
    invoke<string>('get_setting', { key: 'onboarding_version' })
      .then((val) => {
        const isAppOnboarding = val === '0' || !val;
        setIsOnboarding(isAppOnboarding);
      })
      .catch((e) => console.error('Failed to load onboarding setting:', e));
  }, [setIsOnboarding]);

  // Listen to system tray events or IPC messages
  useEffect(() => {
    const unlisten = listen<string>('navigate', (event) => {
      if (event.payload === 'settings') {
        setCurrentPage(ROUTES.SETTINGS);
      } else if (event.payload === 'dashboard') {
        setCurrentPage(ROUTES.DASHBOARD);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [setCurrentPage]);

  // Page renderer mapper
  const renderPage = () => {
    switch (currentPage) {
      case ROUTES.DASHBOARD:
        return <Dashboard />;
      case ROUTES.ACTIONS:
        return <Actions />;
      case ROUTES.MONITOR:
        return <Monitor />;
      case ROUTES.CLIPBOARD:
        return <ClipboardPanel />;
      case ROUTES.TRANSFERS:
        return <Transfers />;
      case ROUTES.SETTINGS:
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const navItems = [
    { key: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { key: ROUTES.ACTIONS, label: 'Actions', icon: Layers },
    { key: ROUTES.MONITOR, label: 'Monitor', icon: Activity },
    { key: ROUTES.CLIPBOARD, label: 'Clipboard', icon: Clipboard },
    { key: ROUTES.TRANSFERS, label: 'Transfers', icon: ArrowLeftRight },
    { key: ROUTES.SETTINGS, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className={`${THEME.appContainer} flex`}>
      {/* Sidebar Navigation */}
      {!isOnboarding && (
        <aside className={sidebarCollapsed ? THEME.sidebarCollapsed : THEME.sidebar}>
          <div className="flex flex-col h-full justify-between py-6">
            <div className="space-y-6">
              {/* Header / Logo */}
              <div className="flex items-center justify-between px-6">
                {!sidebarCollapsed ? (
                  <div className="flex items-center gap-2.5">
                    <img src="/logo.png" className="w-8 h-8 rounded-lg object-contain shadow-md" alt="Flow Deck Logo" />
                    <div>
                      <h2 className="font-bold text-white text-sm tracking-tight leading-none">Flow Deck</h2>
                      <span className="text-[9px] text-slate-500 font-mono tracking-wider">v0.1.0-alpha</span>
                    </div>
                  </div>
                ) : (
                  <img src="/logo.png" className="w-8 h-8 rounded-lg object-contain mx-auto shadow-md" alt="Flow Deck Logo" />
                )}
              </div>

              {/* Links List */}
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const isActive = currentPage === item.key;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setCurrentPage(item.key)}
                      className={isActive ? THEME.navItemActive : THEME.navItem}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? THEME.navIconActive : THEME.navIcon}`} />
                      {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Sidebar Collapse Toggle Button */}
            <div className="px-3">
              <button
                onClick={toggleSidebar}
                className={THEME.btnSecondary}
              >
                {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div className={THEME.contentArea}>
        <main className={THEME.mainScrollable}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DialogProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </DialogProvider>
  );
}
