import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Clipboard,
  Copy,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Monitor,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { THEME } from '../config/theme';
import { useDialog } from '../components/DialogSystem';

interface ClipboardEntry {
  id: string;
  text: string;
  contentHash: string;
  direction: string;
  isLocal: boolean;
  sourceDeviceId: string;
  createdAt: number;
}

export default function ClipboardPanel() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const dialog = useDialog();

  const loadHistory = useCallback(() => {
    invoke<ClipboardEntry[]>('get_clipboard_history')
      .then(setEntries)
      .catch((err) => console.error('[CLIPBOARD] Failed to load history:', err));
  }, []);

  const loadSyncState = useCallback(() => {
    invoke<boolean>('get_clipboard_sync_enabled')
      .then(setSyncEnabled)
      .catch((err) => console.error('[CLIPBOARD] Failed to load sync state:', err));
  }, []);

  useEffect(() => {
    loadHistory();
    loadSyncState();

    const unlistenHistory = listen('clipboard-history-updated', () => {
      loadHistory();
    });

    return () => {
      unlistenHistory.then((f) => f());
    };
  }, [loadHistory, loadSyncState]);

  const toggleSync = () => {
    const newState = !syncEnabled;
    invoke('set_clipboard_sync_enabled', { enabled: newState })
      .then(() => setSyncEnabled(newState))
      .catch((err) => console.error('[CLIPBOARD] Failed to toggle sync:', err));
  };

  const handleCopyBack = (entry: ClipboardEntry) => {
    invoke('clipboard_write_text', { text: entry.text })
      .then(() => {
        setCopiedId(entry.id);
        setTimeout(() => setCopiedId(null), 1500);
      })
      .catch((err) => console.error('[CLIPBOARD] Failed to copy:', err));
  };

  const handleDeleteEntry = (id: string) => {
    invoke('delete_clipboard_entry', { id })
      .then(() => {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      })
      .catch((err) => console.error('[CLIPBOARD] Failed to delete entry:', err));
  };

  const handleClearHistory = () => {
    invoke('clear_clipboard_history')
      .then(() => {
        setEntries([]);
      })
      .catch((err) => console.error('[CLIPBOARD] Failed to clear history:', err));
  };

  const filteredEntries = searchQuery
    ? entries.filter((e) => e.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const formatTime = (epochMs: number) => {
    const date = new Date(epochMs);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getDirectionInfo = (direction: string) => {
    switch (direction) {
      case 'desktop_to_mobile':
        return {
          label: 'Desktop → Mobile',
          icon: <ArrowUpRight className="w-3 h-3" />,
          color: 'text-violet-400',
          bgColor: 'bg-violet-500/10',
          borderColor: 'border-violet-500/20',
        };
      case 'mobile_to_desktop':
        return {
          label: 'Mobile → Desktop',
          icon: <ArrowDownLeft className="w-3 h-3" />,
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/20',
        };
      default:
        return {
          label: 'Local',
          icon: <Monitor className="w-3 h-3" />,
          color: 'text-slate-400',
          bgColor: 'bg-slate-500/10',
          borderColor: 'border-slate-500/20',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className={THEME.title}>Clipboard Sync</h1>
          <p className={THEME.subtitle}>
            Bidirectional clipboard synchronization with your companion device
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync Toggle */}
          <button
            onClick={toggleSync}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer border ${
              syncEnabled
                ? 'bg-violet-600/20 border-violet-500/30 text-violet-300 hover:bg-violet-600/30'
                : 'bg-slate-900/60 border-slate-800/60 text-slate-400 hover:bg-slate-900/80'
            }`}
          >
            {syncEnabled ? (
              <ToggleRight className="w-4 h-4 text-violet-400" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-slate-500" />
            )}
            <span>{syncEnabled ? 'Sync Enabled' : 'Sync Disabled'}</span>
          </button>
        </div>
      </div>

      {/* Disabled State */}
      {!syncEnabled && (
        <div className={`${THEME.panel} glow-panel flex items-center gap-4 p-5`}>
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm text-white font-medium">Clipboard Sync is disabled</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Enable clipboard sync to start sharing clipboard content between your desktop and mobile device.
              This feature is off by default for privacy.
            </p>
          </div>
        </div>
      )}

      {/* History Panel */}
      <div className={`${THEME.panel} glow-panel`}>
        <div className="flex justify-between items-center mb-5 border-b border-slate-900/50 pb-3">
          <div className="flex items-center gap-3">
            <Clipboard className="text-violet-400 w-5 h-5" />
            <h2 className="text-lg font-semibold text-white">Clipboard History</h2>
            <span className="text-[10px] text-slate-500 bg-slate-900/60 px-2 py-0.5 rounded-full border border-slate-800/40">
              {filteredEntries.length} / 100
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter..."
                className="pl-8 pr-3 py-1.5 bg-slate-900/60 border border-slate-800/40 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/40 w-44 transition-colors"
              />
            </div>

            {/* Clear History */}
            <button
              onClick={async () => {
                const confirmed = await dialog.confirm({
                  title: 'Clear Clipboard History',
                  message: 'Are you sure you want to clear the clipboard history? This cannot be undone.',
                  severity: 'danger',
                  confirmText: 'Clear History'
                });
                if (confirmed) {
                  handleClearHistory();
                }
              }}
              disabled={entries.length === 0}
              className="text-[10px] bg-slate-900/60 hover:bg-rose-950/40 border border-slate-800/40 hover:border-rose-900/40 text-slate-400 hover:text-rose-400 px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Clear History
            </button>
          </div>
        </div>

        {/* Entries List */}
        {filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Clipboard className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-sm font-medium">
              {entries.length === 0 ? 'No clipboard history yet' : 'No matching entries'}
            </p>
            <p className="text-xs mt-1 text-slate-600">
              {entries.length === 0
                ? 'Copy something on either device to start syncing'
                : 'Try adjusting your search query'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredEntries.map((entry) => {
              const dirInfo = getDirectionInfo(entry.direction);
              return (
                <div
                  key={entry.id}
                  className="group flex items-start gap-3 p-3 rounded-xl bg-slate-900/30 hover:bg-slate-900/50 border border-slate-800/30 hover:border-slate-700/40 transition-all duration-150"
                >
                  {/* Direction indicator */}
                  <div
                    className={`shrink-0 mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg ${dirInfo.bgColor} border ${dirInfo.borderColor}`}
                  >
                    <span className={dirInfo.color}>{dirInfo.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-mono leading-relaxed line-clamp-2 break-all">
                      {entry.text}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span
                        className={`text-[10px] ${dirInfo.color} font-medium px-1.5 py-0.5 rounded ${dirInfo.bgColor}`}
                      >
                        {dirInfo.label}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        {entry.isLocal ? (
                          <Monitor className="w-2.5 h-2.5" />
                        ) : (
                          <Smartphone className="w-2.5 h-2.5" />
                        )}
                        {entry.isLocal ? 'Local' : 'Remote'}
                      </span>
                      <span className="text-[10px] text-slate-600">{formatTime(entry.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopyBack(entry)}
                      className="p-1.5 rounded-lg bg-violet-600/10 hover:bg-violet-600/25 border border-violet-500/20 text-violet-400 transition-all cursor-pointer"
                      title="Copy Back"
                    >
                      {copiedId === entry.id ? (
                        <span className="text-[9px] font-bold text-emerald-400 px-0.5">✓</span>
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="p-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/25 border border-rose-500/20 text-rose-400 transition-all cursor-pointer"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
