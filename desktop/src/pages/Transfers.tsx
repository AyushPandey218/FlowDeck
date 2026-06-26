import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Upload,
  Download,
  Trash2,
  FolderOpen,
  File,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { THEME } from '../config/theme';
import { useToast } from '../components/ToastSystem';
import EmptyState from '../components/EmptyState';

interface ActiveTransferInfo {
  id: string;
  fileName: string;
  fileSize: number;
  direction: 'desktop_to_mobile' | 'mobile_to_desktop';
  bytesTransferred: number;
  avgSpeed: number;
  peakSpeed: number;
  durationMs: number;
  status: string;
}

interface TransferHistoryRow {
  id: string;
  transferId: string;
  fileName: string;
  direction: 'desktop_to_mobile' | 'mobile_to_desktop';
  fileSize: number;
  fileHash: string | null;
  integrityVerified: boolean;
  status: 'queued' | 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled' | 'rejected';
  avgSpeed: number | null;
  peakSpeed: number | null;
  durationMs: number | null;
  createdAt: number;
}

export default function Transfers() {
  const toast = useToast();
  const [activeTransfer, setActiveTransfer] = useState<ActiveTransferInfo | null>(null);
  const [history, setHistory] = useState<TransferHistoryRow[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenContainingFolder = (transferId: string) => {
    invoke('open_containing_folder', { transferId })
      .then(() => {
        toast.success('Containing folder opened.');
      })
      .catch((err) => {
        console.error(err);
        toast.warn('Cannot locate file: it may have been moved or deleted.');
      });
  };

  const fetchActiveTransfer = useCallback(() => {
    invoke<ActiveTransferInfo | null>('get_active_transfer')
      .then((data) => {
        setActiveTransfer(data);
      })
      .catch((err) => console.error('[TRANSFERS] Failed to fetch active transfer:', err));
  }, []);

  const fetchHistory = useCallback(() => {
    invoke<TransferHistoryRow[]>('get_transfer_history')
      .then((data) => {
        setHistory(data);
      })
      .catch((err) => console.error('[TRANSFERS] Failed to fetch transfer history:', err));
  }, []);

  useEffect(() => {
    fetchActiveTransfer();
    fetchHistory();

    // Listen to manual file-transfer-updated events from backend
    const unlistenUpdate = listen('file-transfer-updated', () => {
      fetchActiveTransfer();
      fetchHistory();
    });

    // Listen to global Tauri drag and drop events
    const unlistenDrop = listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
      setIsHovered(false);
      const paths = event.payload?.paths;
      if (paths && paths.length > 0) {
        handleStartTransfer(paths[0]);
      }
    });

    const unlistenDropHover = listen('tauri://drag-enter', () => {
      setIsHovered(true);
    });

    const unlistenDropCancelled = listen('tauri://drag-leave', () => {
      setIsHovered(false);
    });

    return () => {
      unlistenUpdate.then((f) => f());
      unlistenDrop.then((f) => f());
      unlistenDropHover.then((f) => f());
      unlistenDropCancelled.then((f) => f());
    };
  }, [fetchActiveTransfer, fetchHistory]);

  const handleStartTransfer = (filePath: string) => {
    setErrorMessage(null);
    invoke('start_file_transfer', { filePath })
      .then(() => {
        fetchActiveTransfer();
      })
      .catch((err: unknown) => {
        setErrorMessage(String(err));
      });
  };

  const handleCancelTransfer = (id: string) => {
    invoke('cancel_file_transfer', { transferId: id })
      .then(() => {
        fetchActiveTransfer();
      })
      .catch((err) => console.error('[TRANSFERS] Failed to cancel transfer:', err));
  };

  const handleClearHistory = () => {
    invoke('clear_transfer_history')
      .then(() => {
        fetchHistory();
      })
      .catch((err) => console.error('[TRANSFERS] Failed to clear history:', err));
  };

  const handleOpenDownloads = () => {
    invoke('open_downloads_folder')
      .catch((err) => console.error('[TRANSFERS] Failed to open downloads folder:', err));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (mbps: number | null) => {
    if (mbps === null || mbps === undefined) return '-';
    return `${mbps.toFixed(2)} MB/s`;
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '-';
    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSec = seconds % 60;
    return `${minutes}m ${remainingSec.toFixed(0)}s`;
  };

  const calculateETA = (active: ActiveTransferInfo) => {
    const remainingBytes = active.fileSize - active.bytesTransferred;
    if (remainingBytes <= 0) return 'Completing...';
    if (active.avgSpeed <= 0) return 'Calculating...';
    
    const remainingMB = remainingBytes / (1024 * 1024);
    const etaSec = remainingMB / active.avgSpeed;
    if (etaSec < 60) {
      return `${Math.ceil(etaSec)}s remaining`;
    }
    const mins = Math.floor(etaSec / 60);
    const secs = Math.ceil(etaSec % 60);
    return `${mins}m ${secs}s remaining`;
  };

  return (
    <div className="space-y-6 relative h-full">
      {/* Drag & Drop Visual Overlay */}
      {isHovered && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md border-2 border-dashed border-violet-500 rounded-2xl flex flex-col items-center justify-center z-50 transition-all duration-300">
          <Upload className="w-16 h-16 text-violet-400 animate-bounce mb-4" />
          <h2 className="text-xl font-bold text-white">Drop File to Send</h2>
          <p className="text-sm text-slate-400 mt-1">Flow Deck will prepare and stream it to your companion</p>
        </div>
      )}

      {/* Header section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className={THEME.title}>File Transfers</h1>
          <p className={THEME.subtitle}>Local network file sharing with paired companion device</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenDownloads}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-xl transition-all duration-200 cursor-pointer text-sm font-medium"
          >
            <FolderOpen className="w-4 h-4 text-violet-400" />
            Downloads Folder
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-4 flex items-start gap-3 text-red-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-sm">Transfer Error</h4>
            <p className="text-xs text-red-300 mt-0.5">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Transfer or Drop Zone */}
      <div className="grid grid-cols-1 gap-6">
        {activeTransfer ? (
          <div className="relative overflow-hidden bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl shadow-slate-950/50">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-12 h-12 rounded-xl bg-violet-600/10 flex items-center justify-center text-violet-400 shadow-inner">
                  {activeTransfer.direction === 'desktop_to_mobile' ? (
                    <Upload className="w-6 h-6" />
                  ) : (
                    <Download className="w-6 h-6" />
                  )}
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base truncate max-w-md">{activeTransfer.fileName}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-violet-950/60 border border-violet-800/40 text-violet-300 text-[10px] uppercase font-bold tracking-wider">
                      {activeTransfer.direction === 'desktop_to_mobile' ? 'Sending' : 'Receiving'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>Size: {formatBytes(activeTransfer.fileSize)}</span>
                    <span>Transferred: {formatBytes(activeTransfer.bytesTransferred)}</span>
                    <span className="font-mono text-violet-400 font-medium">{formatSpeed(activeTransfer.avgSpeed)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                  <div className="text-sm font-semibold text-white">{calculateETA(activeTransfer)}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">Peak: {formatSpeed(activeTransfer.peakSpeed)}</div>
                </div>
                <button
                  onClick={() => handleCancelTransfer(activeTransfer.id)}
                  className="px-4 py-2 bg-red-950/30 border border-red-900/40 hover:bg-red-900/20 text-red-200 rounded-xl transition-all duration-200 cursor-pointer text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Progress Bar & Numerical updates */}
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-400">
                <span>{((activeTransfer.bytesTransferred / activeTransfer.fileSize) * 100).toFixed(1)}%</span>
                <span className="md:hidden">{calculateETA(activeTransfer)}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/40 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-100 ease-out"
                  style={{ width: `${Math.min(100, (activeTransfer.bytesTransferred / activeTransfer.fileSize) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-slate-800 hover:border-violet-500/50 bg-slate-900/20 hover:bg-slate-900/30 rounded-2xl p-12 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-default">
            <ArrowLeftRight className="w-12 h-12 text-slate-600 mb-4" />
            <h3 className="text-base font-bold text-slate-200">Send File to Mobile Companion</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1">
              Drag and drop any file up to 100 MB directly into this window to start the transfer.
            </p>
            <span className="mt-4 text-[10px] text-slate-600 font-mono border border-slate-800/50 rounded-md px-2 py-1 bg-slate-950/20">
              Only one transfer at a time is supported
            </span>
          </div>
        )}
      </div>

      {/* History Log Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-white">Transfer History</h2>
            <p className="text-xs text-slate-500">Recent local network file sharing records</p>
          </div>
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 hover:bg-slate-900 border border-slate-800/60 text-slate-400 hover:text-red-400 rounded-xl transition-all duration-200 cursor-pointer text-xs font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Log
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <EmptyState
            title="No Transfer Records"
            description="No files have been shared between this desktop and your paired companion devices yet."
            primaryAction={{
              label: "Open Downloads Folder",
              onClick: handleOpenDownloads
            }}
            secondaryAction={{
              label: "How to Transfer",
              onClick: () => toast.success("To share files, drag and drop them here, or use the share sheet inside the mobile companion app.")
            }}
            illustration={ArrowLeftRight}
          />
        ) : (
          <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/50 text-slate-400 text-xs font-semibold tracking-wider bg-slate-950/10">
                    <th className="py-4 px-6">File Name</th>
                    <th className="py-4 px-4">Direction</th>
                    <th className="py-4 px-4">Size</th>
                    <th className="py-4 px-4">Speed (Avg / Peak)</th>
                    <th className="py-4 px-4">Duration</th>
                    <th className="py-4 px-4">Integrity</th>
                    <th className="py-4 px-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-slate-300 text-xs">
                  {history.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-900/20 transition-all duration-150">
                      <td className="py-4 px-6 font-medium text-white max-w-[200px] truncate" title={row.fileName}>
                        <div className="flex items-center gap-2.5">
                          <File className="w-4 h-4 text-violet-400 shrink-0" />
                          <span className="truncate">{row.fileName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          row.direction === 'desktop_to_mobile' 
                            ? 'bg-blue-950/40 text-blue-400 border border-blue-900/30' 
                            : 'bg-violet-950/40 text-violet-400 border border-violet-900/30'
                        }`}>
                          {row.direction === 'desktop_to_mobile' ? 'To Mobile' : 'From Mobile'}
                        </span>
                      </td>
                      <td className="py-4 px-4">{formatBytes(row.fileSize)}</td>
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {row.avgSpeed ? (
                          <>
                            {row.avgSpeed.toFixed(1)} MB/s
                            <span className="text-[10px] text-slate-600 block">Peak: {row.peakSpeed?.toFixed(1)} MB/s</span>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-4 px-4">{formatDuration(row.durationMs)}</td>
                      <td className="py-4 px-4">
                        {row.integrityVerified ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : row.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 text-yellow-500">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Unverified
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                            row.status === 'completed' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/40' :
                            row.status === 'failed' ? 'bg-red-950/50 text-red-400 border border-red-900/40' :
                            row.status === 'cancelled' ? 'bg-amber-950/50 text-amber-400 border border-amber-900/40' :
                            row.status === 'rejected' ? 'bg-slate-900 text-slate-400 border border-slate-800' :
                            'bg-violet-950/50 text-violet-400 border border-violet-900/40 animate-pulse'
                          }`}>
                            {row.status === 'transferring' && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                            {row.status}
                          </span>
                          {row.status === 'completed' && (
                            <button
                              onClick={() => handleOpenContainingFolder(row.transferId)}
                              className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title="Open Containing Folder"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
