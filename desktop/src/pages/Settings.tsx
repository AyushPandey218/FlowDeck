import { useEffect, useState, useCallback } from 'react';
import { useUIStore } from '../store/uiStore';
import { ROUTES } from '../config/constants';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Sliders,
  AlertTriangle,
  Heart,
  Info,
  FileDown,
  FileUp,
  Activity,
  ToggleLeft,
  ToggleRight,
  Clipboard as ClipboardIcon,
  Smartphone,
  FolderOpen,
  Mail,
  Power,
  Code,
  Coffee
} from 'lucide-react';
import { THEME } from '../config/theme';
import { useToast } from '../components/ToastSystem';
import { useDialog } from '../components/DialogSystem';

interface DiagnosticsInfo {
  desktopId: string;
  databaseStatus: string;
  databaseSizeBytes: number;
  websocketStatus: string;
  websocketPort: number;
  websocketClientCount: number;
  clipboardStatus: string;
  clipboardLastSyncTime: number | null;
  clipboardLastHash: string | null;
  connectedDevices: any[];
  appVersion: string;
  protocolVersion: string;
  layoutVersion: number;
  telemetryVersion: string;
}

type TabType = 'general' | 'connection' | 'actions' | 'clipboard' | 'transfers';

export default function Settings() {
  const { setCurrentPage } = useUIStore();
  const toast = useToast();
  const dialog = useDialog();
  const [activeTab, setActiveTab] = useState<TabType>('general');

  // Core settings
  const [allowLan, setAllowLan] = useState(false);
  const [clipboardEnabled, setClipboardEnabled] = useState(false);

  const [runOnStartup, setRunOnStartup] = useState(false);
  const [startMinimized, setStartMinimized] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);

  // Diagnostics
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const loadSettings = useCallback(() => {
    invoke<string>('get_setting', { key: 'allow_lan_connections' })
      .then((val) => setAllowLan(val !== 'false'))
      .catch((err) => console.error('Failed to query allow_lan_connections:', err));

    invoke<boolean>('get_clipboard_sync_enabled')
      .then(setClipboardEnabled)
      .catch((err) => console.error('Failed to query clipboard_sync_enabled:', err));



    invoke<string>('get_setting', { key: 'run_on_startup' })
      .then((val) => setRunOnStartup(val === 'true'))
      .catch((err) => console.error(err));

    invoke<string>('get_setting', { key: 'start_minimized' })
      .then((val) => setStartMinimized(val === 'true'))
      .catch((err) => console.error(err));

    invoke<string>('get_setting', { key: 'minimize_to_tray' })
      .then((val) => setMinimizeToTray(val === 'true'))
      .catch((err) => console.error(err));
  }, []);

  const loadDiagnostics = useCallback(() => {
    invoke<DiagnosticsInfo>('get_diagnostics')
      .then(setDiagnostics)
      .catch((err) => console.error('Failed to get diagnostics:', err));
  }, []);

  useEffect(() => {
    loadSettings();
    loadDiagnostics();
    
    // Refresh diagnostics every 5 seconds
    const interval = setInterval(loadDiagnostics, 5000);
    return () => clearInterval(interval);
  }, [loadSettings, loadDiagnostics]);

  const handleLanToggle = (val: boolean) => {
    setAllowLan(val);
    invoke('set_setting', { key: 'allow_lan_connections', value: String(val) })
      .then(() => toast.success(`LAN connections updated to ${val ? '0.0.0.0' : '127.0.0.1'}. Please restart Flow Deck to apply this change.`))
      .catch((err) => console.error('Failed to save allow_lan_connections setting:', err));
  };


  const handleClipboardToggle = (val: boolean) => {
    setClipboardEnabled(val);
    invoke('set_clipboard_sync_enabled', { enabled: val })
      .then(() => toast.success(`Clipboard synchronization ${val ? 'enabled' : 'disabled'}`))
      .catch((err) => console.error(err));
  };

  const handleRunOnStartupToggle = (val: boolean) => {
    setRunOnStartup(val);
    invoke('set_setting', { key: 'run_on_startup', value: String(val) })
      .catch((err) => console.error('Failed to save run_on_startup setting:', err));
    invoke('set_run_on_startup', { enabled: val })
      .then(() => toast.success(`Run on startup ${val ? 'enabled' : 'disabled'}`))
      .catch((err) => {
        console.error(err);
        toast.error('Failed to configure registry for startup.');
      });
  };

  const handleStartMinimizedToggle = (val: boolean) => {
    setStartMinimized(val);
    invoke('set_setting', { key: 'start_minimized', value: String(val) })
      .then(() => toast.success(`Start minimized ${val ? 'enabled' : 'disabled'}`))
      .catch((err) => console.error('Failed to save start_minimized setting:', err));
  };

  const handleMinimizeToTrayToggle = (val: boolean) => {
    setMinimizeToTray(val);
    invoke('set_setting', { key: 'minimize_to_tray', value: String(val) })
      .then(() => toast.success(`Minimize to tray ${val ? 'enabled' : 'disabled'}`))
      .catch((err) => console.error('Failed to save minimize_to_tray setting:', err));
  };



  const handleResetOnboarding = () => {
    useUIStore.getState().setIsOnboarding(true);
    invoke('factory_reset')
      .then(() => {
        toast.success('Factory reset complete. All data wiped.');
        setCurrentPage(ROUTES.DASHBOARD);
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to factory reset: ' + err);
      });
  };

  const handleOpenFeedbackUrl = async (url: string) => {
    if (!url.startsWith('https://') && !url.startsWith('mailto:')) {
      toast.error('Invalid URL protocol. Only https:// and mailto: protocols are allowed.');
      return;
    }
    try {
      await openUrl(url);
    } catch (err) {
      console.error(err);
      toast.error('Failed to open link: ' + err);
    }
  };

  // Export / Import Configuration
  const handleExportConfig = async () => {
    try {
      const configStr = await invoke<string>('export_configuration');
      const blob = new Blob([configStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flowdeck_config_backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Configuration backup downloaded.');
    } catch (err) {
      toast.error(`Export failed: ${err}`);
    }
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string') return;
      try {
        await invoke('import_configuration', { json: text });
        toast.success('Configuration restored. Reloading layout...');
        setTimeout(() => window.location.reload(), 1500);
      } catch (err: any) {
        setImportError(String(err));
        toast.error('Configuration import failed.');
      }
    };
    reader.readAsText(file);
  };

  // Reset to Defaults
  const handleResetToDefaults = async () => {
    try {
      await invoke('reset_to_defaults');
      toast.success('System layout reset to defaults. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(`Reset failed: ${err}`);
    }
  };

  const handleRemoveDevice = (deviceId: string) => {
    invoke('remove_trusted_device', { deviceId })
      .then(() => {
        loadDiagnostics();
        toast.success('Device removed successfully.');
      })
      .catch((err) => {
        console.error('Failed to remove trusted device:', err);
        toast.error('Failed to remove trusted device.');
      });
  };

  const tabItems: Array<{ key: TabType; label: string; icon: any }> = [
    { key: 'general', label: 'General', icon: Info },
    { key: 'connection', label: 'Devices & Network', icon: Smartphone },
    { key: 'actions', label: 'Actions & Layout', icon: Sliders },
    { key: 'clipboard', label: 'Clipboard', icon: ClipboardIcon },
    { key: 'transfers', label: 'Transfers', icon: FolderOpen },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className={THEME.title}>Settings</h1>
        <p className={THEME.subtitle}>Manage local connection, backup, recovery, and diagnostics</p>
      </div>

      {importError && (
        <div className={`${THEME.panel} glow-panel border-rose-500/20 flex items-start gap-4 p-5 animate-in fade-in duration-200`}>
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-white font-semibold">Import failed</p>
            <p className="text-xs text-rose-300 font-mono mt-1 whitespace-pre-line">{importError}</p>
            <button 
              onClick={() => setImportError(null)}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-350 border border-slate-800 rounded-lg px-2.5 py-1.5 mt-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-800/60 pb-1 flex-wrap gap-1">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-205 cursor-pointer ${
                isActive
                  ? 'bg-violet-605/15 border-t border-x border-violet-500/25 text-violet-300 shadow-md shadow-violet-950/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-violet-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="space-y-6">
        
        {/* Tab 1: General */}
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
            {/* App Info Panel */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <Info className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-slate-250">App Information</h3>
              </div>
              <div className="space-y-4 text-xs">
                <div className="flex justify-between border-b border-slate-900/35 pb-2">
                  <span className="text-slate-500">App Name</span>
                  <span className="text-white font-medium">Flow Deck Host</span>
                </div>
                <div className="flex justify-between border-b border-slate-900/35 pb-2">
                  <span className="text-slate-500">Version</span>
                  <span className="text-white font-mono">{diagnostics?.appVersion || '0.1.0-alpha'}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <div>
                    <span className="text-rose-400 font-medium block">Factory Reset</span>
                    <span className="text-[10px] text-slate-500">Unpairs devices and wipes all configurations.</span>
                  </div>
                  <button
                    onClick={async () => {
                      const confirmed = await dialog.confirm({
                        title: 'Factory Reset',
                        message: 'Are you sure? This will wipe ALL actions, layouts, and paired devices instantly. This action cannot be undone.',
                        severity: 'danger',
                        confirmText: 'Yes, Wipe Everything'
                      });
                      if (confirmed) {
                        handleResetOnboarding();
                      }
                    }}
                    className="text-[10px] bg-rose-500/20 border border-rose-500/50 hover:bg-rose-500/30 text-rose-300 font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                  >
                    Reset Everything
                  </button>
                </div>
              </div>
            </div>

            {/* Startup & Tray Options */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <Power className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-250">Startup & Tray Options</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 block">Start with Windows</label>
                    <span className="text-[10px] text-slate-500">Automatically launch Flow Deck when Windows starts</span>
                  </div>
                  <button
                    onClick={() => handleRunOnStartupToggle(!runOnStartup)}
                    className="cursor-pointer"
                  >
                    {runOnStartup ? (
                      <ToggleRight className="w-8 h-8 text-violet-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-600" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-slate-900/25">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 block">Start Minimized</label>
                    <span className="text-[10px] text-slate-500">Launch to system tray without showing the window</span>
                  </div>
                  <button
                    onClick={() => handleStartMinimizedToggle(!startMinimized)}
                    className="cursor-pointer"
                  >
                    {startMinimized ? (
                      <ToggleRight className="w-8 h-8 text-violet-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-600" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-slate-900/25">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 block">Minimize to Tray</label>
                    <span className="text-[10px] text-slate-500">Hide to tray instead of closing when clicking X</span>
                  </div>
                  <button
                    onClick={() => handleMinimizeToTrayToggle(!minimizeToTray)}
                    className="cursor-pointer"
                  >
                    {minimizeToTray ? (
                      <ToggleRight className="w-8 h-8 text-violet-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-600" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Feedback Configuration Panel */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <Heart className="w-4 h-4 text-rose-455" />
                <h3 className="text-sm font-semibold text-slate-250">Feedback & Support</h3>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] text-slate-550 font-bold uppercase tracking-wider block">Submit Feedback</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenFeedbackUrl("https://github.com/AyushPandey218")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5 text-violet-400" />
                    <span>GitHub</span>
                  </button>
                  <button
                    onClick={() => handleOpenFeedbackUrl("https://buymeacoffee.com/ayush_wg218")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Coffee className="w-3.5 h-3.5 text-rose-400" />
                    <span>Support Me</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("ayushpandey0618@gmail.com");
                      toast.success("Use my mail: ayushpandey0618@gmail.com (Copied!)");
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-emerald-405" />
                    <span>Email Me</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Connection */}
        {activeTab === 'connection' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
            {/* Server Bind Configuration */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <Sliders className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-slate-250">Local Network Settings</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-250 block">Allow LAN Connections</label>
                    <span className="text-[10px] text-slate-500">Allow other devices on the same network to connect</span>
                  </div>
                  <input
                    type="checkbox"
                    id="allow_lan"
                    className="w-4 h-4 accent-violet-600 rounded bg-slate-950 border-slate-800 cursor-pointer"
                    checked={allowLan}
                    onChange={(e) => handleLanToggle(e.target.checked)}
                  />
                </div>
              </div>
            </div>

            {/* Trusted Devices Box */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-250">Trusted Companion Devices ({diagnostics?.connectedDevices.length || 0})</h3>
              </div>
              
              {!diagnostics || diagnostics.connectedDevices.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p className="text-xs">No devices paired yet.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {diagnostics.connectedDevices.map((d: any) => (
                    <div key={d.deviceId} className="p-3 bg-slate-950/30 border border-slate-900 rounded-xl flex items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-bold text-white block">{d.deviceNickname}</span>
                        <span className="text-[10px] text-slate-550 block font-mono">ID: {d.deviceId.slice(0, 12)}...</span>
                      </div>
                      <button
                        onClick={() => handleRemoveDevice(d.deviceId)}
                        className="text-[10px] bg-rose-950/20 hover:bg-rose-900/30 text-rose-400 border border-rose-900/30 rounded px-2.5 py-1.5 cursor-pointer transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Actions & Layout */}
        {activeTab === 'actions' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
            {/* Backup & Export */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <FileDown className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-250">Backup Export & Restore</h3>
              </div>
              <div className="space-y-4">
                <p className="text-xs text-slate-400 font-light leading-relaxed">
                  Save all custom buttons, pages, and layout columns to a local configuration JSON document. This lets you restore layouts or migrate them to other host systems.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleExportConfig}
                    className="flex items-center justify-center gap-2 py-2.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-white rounded-xl transition-all cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 text-violet-400" />
                    <span>Export JSON</span>
                  </button>

                  <label className="flex items-center justify-center gap-2 py-2.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-white rounded-xl transition-all cursor-pointer text-center">
                    <FileUp className="w-4 h-4 text-emerald-400" />
                    <span>Import JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportConfig}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Layout Restoration */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <AlertTriangle className="w-4 h-4 text-rose-455" />
                <h3 className="text-sm font-semibold text-slate-250">Danger Zone</h3>
              </div>
              <div className="space-y-4 text-xs">
                <p className="text-slate-400 leading-relaxed font-light">
                  Restoring layout defaults will delete all configured pages, categories, and actions, replacing them with the original "Work", "Gaming", and "Utilities" presets.
                </p>
                <div className="flex justify-between items-center pt-2">
                  <div>
                    <span className="text-rose-400 font-semibold block">Reset Layout Grid</span>
                    <span className="text-[10px] text-slate-500 font-light block">Clear layout and re-seed defaults</span>
                  </div>
                  <button
                    onClick={async () => {
                      const confirmed = await dialog.confirm({
                        title: 'Reset Layout Grid',
                        message: 'Restoring layout defaults will delete all configured pages, categories, and actions, replacing them with the original "Work", "Gaming", and "Utilities" presets. Are you sure?',
                        severity: 'danger',
                        confirmText: 'Confirm Reset'
                      });
                      if (confirmed) {
                        handleResetToDefaults();
                      }
                    }}
                    className="text-[10px] bg-rose-950/20 hover:bg-rose-955/35 border border-rose-900/30 text-rose-400 px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all"
                  >
                    Reset To Defaults
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Clipboard */}
        {activeTab === 'clipboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
            {/* Clipboard Configuration */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <ClipboardIcon className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-slate-250">Universal Clipboard Sync</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-250 block">Clipboard Synchronization</label>
                    <span className="text-[10px] text-slate-500">Auto-copy clipboard text between PC and companion devices</span>
                  </div>
                  <button
                    onClick={() => handleClipboardToggle(!clipboardEnabled)}
                    className="cursor-pointer"
                  >
                    {clipboardEnabled ? (
                      <ToggleRight className="w-8 h-8 text-violet-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-600" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Clipboard Status details */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-250">Clipboard Status</h3>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-900/30 pb-2">
                  <span className="text-slate-500">Status</span>
                  <span className="text-white font-medium">{diagnostics?.clipboardStatus || 'Disabled'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900/30 pb-2">
                  <span className="text-slate-500">Last Synced Hash</span>
                  <span className="text-slate-400 font-mono truncate max-w-[150px]">{diagnostics?.clipboardLastHash || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Synced Time</span>
                  <span className="text-slate-400 font-mono">
                    {diagnostics?.clipboardLastSyncTime 
                      ? new Date(diagnostics.clipboardLastSyncTime * 1000).toLocaleTimeString() 
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Transfers */}
        {activeTab === 'transfers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
            {/* Downloads configuration */}
            <div className={THEME.panel}>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-900/50 pb-2">
                <FolderOpen className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-slate-250">Transfers Folder Settings</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-slate-200 block font-semibold mb-1.5">Default Downloads Directory</span>
                  <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/40 font-mono text-[10px] text-slate-450 break-all leading-normal">
                    Downloads/Flow Deck
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-2">
                    Received files are saved inside a subfolder in your OS Downloads directory.
                  </span>
                </div>
                <button
                  onClick={() => invoke('open_downloads_folder')}
                  className="flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 rounded-xl transition-all cursor-pointer w-full"
                >
                  <FolderOpen className="w-4 h-4 text-violet-400" />
                  <span>Open Downloads Folder</span>
                </button>
              </div>
            </div>
          </div>
        )}



      </div>
    </div>
  );
}
