import React, { useState, useMemo } from 'react';
import { View, ScrollView, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { CustomAlert } from '../components/AlertSystem';
import {
  Upload,
  Download,
  Trash2,
  File,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  X,
  FileText,
  Share2,
  Search,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import Header from '../components/Header';
import GlassCard from '../components/GlassCard';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastSystem';
import { useTransferStore } from '../services/websocket/transferStore';
import { websocketManager } from '../services/websocket/WebSocketManager';
import { computeFileHash } from '../services/websocket/fileHasher';
import { useWebSocketStore } from '../services/websocket/websocketStore';
import { FLOW_DECK_DIR } from '../services/websocket/transferService';
import { haptics } from '../services/haptics';

export default function TransfersScreen() {
  const activeTransfer = useTransferStore((s) => s.activeTransfer);
  const history = useTransferStore((s) => s.history);
  const clearHistory = useTransferStore((s) => s.clearHistory);
  const [hashing, setHashing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const connectionStatus = useWebSocketStore((s) => s.connectionStatus);
  const isConnected = connectionStatus === 'connected';
  const toast = useToast();

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase().trim();
    return history.filter(item => 
      item.fileName.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      item.direction.toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

  const handlePickFile = async () => {
    if (activeTransfer) {
      haptics.triggerWarning();
      CustomAlert.alert('Transfer Active', 'Only one file transfer is supported at a time.');
      return;
    }
    let targetUri = '';
    let isTempCopy = false;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        setHashing(true);

        const ext = asset.name.includes('.') ? asset.name.slice(asset.name.lastIndexOf('.')) : '';
        const cleanName = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
        targetUri = `${FileSystem.cacheDirectory}${cleanName}`;
        isTempCopy = true;

        await FileSystem.copyAsync({
          from: asset.uri,
          to: targetUri,
        });

        // Calculate SHA-256 hash using the streaming fileHasher helper
        const { hash, size } = await computeFileHash(targetUri);
        setHashing(false);

        if (size > 100 * 1024 * 1024) {
          haptics.triggerWarning();
          CustomAlert.alert('File Too Large', 'File exceeds the maximum size limit of 100 MB.');
          if (isTempCopy) {
            await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => {});
          }
          return;
        }

        // Initiate upload request to Desktop
        websocketManager.requestUpload(targetUri, asset.name, size, hash);
      }
    } catch (err: any) {
      setHashing(false);
      if (isTempCopy && targetUri) {
        await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => {});
      }
      CustomAlert.alert('File Selection Failed', err.message || 'Could not load file');
    }
  };

  const handleAccept = () => {
    if (activeTransfer) {
      websocketManager.acceptIncomingTransfer(activeTransfer.transferId);
    }
  };

  const handleReject = () => {
    if (activeTransfer) {
      websocketManager.rejectIncomingTransfer(activeTransfer.transferId);
    }
  };

  const handleCancel = () => {
    if (activeTransfer) {
      websocketManager.cancelTransfer(activeTransfer.transferId);
    }
  };

  const handleClearHistory = () => {
    CustomAlert.alert(
      'Clear Transfer Log',
      'This will remove all transfer history records from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear Log', style: 'destructive', onPress: () => clearHistory() },
      ]
    );
  };

  const handleShareFile = async (fileName: string) => {
    try {
      const fileUri = `${FLOW_DECK_DIR}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        CustomAlert.alert('File Not Found', 'This file has been moved or deleted.');
        return;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        CustomAlert.alert('Sharing Unavailable', 'Native sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(fileUri);
    } catch (err: any) {
      CustomAlert.alert('Error', err.message || 'Could not open file sharing');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (mbps: number | null) => {
    if (mbps === null || mbps === undefined || mbps === 0) return '-';
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

  const calculateETA = () => {
    if (!activeTransfer) return '';
    const remainingBytes = activeTransfer.fileSize - activeTransfer.bytesTransferred;
    if (remainingBytes <= 0) return 'Completing...';
    if (activeTransfer.avgSpeed <= 0) return 'Calculating...';

    const remainingMB = remainingBytes / (1024 * 1024);
    const etaSec = remainingMB / activeTransfer.avgSpeed;
    if (etaSec < 60) {
      return `${Math.ceil(etaSec)}s remaining`;
    }
    const mins = Math.floor(etaSec / 60);
    const secs = Math.ceil(etaSec % 60);
    return `${mins}m ${secs}s remaining`;
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="Transfers" subtitle="Local network file sharing" />

      {/* Main content scroll area */}
      <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 110 }}>
        
        {/* Active Transfer Overlay (Inside page flow, high visibility) */}
        {activeTransfer && (
          <GlassCard className="flex-col gap-4 mb-6 p-5" style={{ borderRadius: 20 }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {activeTransfer.direction === 'desktop_to_mobile' ? (
                    <Download size={20} color="#a78bfa" />
                  ) : (
                    <Upload size={20} color="#a78bfa" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-bold truncate max-w-[200px]" numberOfLines={1}>
                    {activeTransfer.fileName}
                  </Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">
                    {activeTransfer.direction === 'desktop_to_mobile' ? 'Downloading' : 'Uploading'} • {formatBytes(activeTransfer.fileSize)}
                  </Text>
                </View>
              </View>

              {activeTransfer.status !== 'pending' && (
                <TouchableOpacity
                  onPress={handleCancel}
                  className="px-3 py-1.5 bg-red-950/30 border border-red-900/40 rounded-xl"
                >
                  <Text className="text-red-400 text-xs font-semibold">Cancel</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* If pending incoming download: Accept/Reject triggers */}
            {activeTransfer.status === 'pending' && activeTransfer.direction === 'desktop_to_mobile' ? (
              <View className="flex-col gap-3 mt-2">
                <Text className="text-amber-400 text-xs font-semibold leading-normal">
                  Desktop wants to send you a file. Do you accept?
                </Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleAccept}
                    className="flex-1 py-3 bg-violet-600 rounded-xl items-center"
                  >
                    <Text className="text-white text-xs font-bold">Accept Download</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleReject}
                    className="flex-1 py-3 bg-slate-900 border border-slate-800 rounded-xl items-center"
                  >
                    <Text className="text-slate-400 text-xs font-bold">Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : activeTransfer.status === 'pending' && activeTransfer.direction === 'mobile_to_desktop' ? (
              <View className="flex-row items-center gap-2 mt-2">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-slate-400 text-xs">Waiting for Desktop approval...</Text>
              </View>
            ) : (
              /* If active streaming progress */
              <View className="flex-col gap-3 mt-1">
                {/* Progress bar */}
                <View className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-900 p-0.5">
                  <View
                    className="h-full bg-violet-500 rounded-full"
                    style={{
                      width: `${Math.min(100, (activeTransfer.bytesTransferred / activeTransfer.fileSize) * 100)}%`,
                    }}
                  />
                </View>
                {/* Statistics */}
                <View className="flex-row justify-between items-center text-[10px]">
                  <Text className="text-slate-400 text-[10px]">
                    {((activeTransfer.bytesTransferred / activeTransfer.fileSize) * 100).toFixed(1)}% • {formatSpeed(activeTransfer.avgSpeed)}
                  </Text>
                  <Text className="text-slate-500 text-[10px]">{calculateETA()}</Text>
                </View>
              </View>
            )}
          </GlassCard>
        )}

        {/* Hashing file picker overlay */}
        {hashing && (
          <GlassCard className="flex-row items-center gap-3 mb-6 p-4 border border-violet-800/40" style={{ borderRadius: 16 }}>
            <ActivityIndicator size="small" color="#a78bfa" />
            <View className="flex-1">
              <Text className="text-white text-xs font-bold">Verifying Integrity...</Text>
              <Text className="text-slate-500 text-[10px] mt-0.5">Computing file SHA-256 hash before transfer</Text>
            </View>
          </GlassCard>
        )}

        {/* Picker Trigger Zone */}
        {!activeTransfer && !hashing && (
          <TouchableOpacity
            onPress={handlePickFile}
            activeOpacity={0.7}
            disabled={!isConnected}
            className="mb-6"
          >
            <View
              className={`border-2 border-dashed rounded-2xl p-8 items-center justify-center ${
                isConnected 
                  ? 'border-slate-800 bg-slate-900/10' 
                  : 'border-slate-900/40 bg-slate-950/20 opacity-50'
              }`}
              style={{ paddingVertical: 32 }}
            >
              <ArrowLeftRight size={32} color={isConnected ? '#8b5cf6' : '#475569'} className="mb-3" />
              <Text className="text-slate-300 text-xs font-bold mb-3">
                {isConnected ? 'Send File to Desktop' : 'File Sharing Unavailable'}
              </Text>
              {isConnected ? (
                <View className="px-5 py-2.5 bg-violet-600 rounded-xl mb-3">
                  <Text className="text-white text-xs font-bold">Select File to Upload</Text>
                </View>
              ) : (
                <View className="px-5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl mb-3">
                  <Text className="text-slate-500 text-xs font-bold">Connect to Host PC</Text>
                </View>
              )}
              <Text className="text-slate-500 text-[10px] text-center max-w-[200px]">
                {isConnected 
                  ? 'Pick images, PDFs, ZIPs or generic files up to 100 MB.' 
                  : 'Ensure the host PC is online and connected to enable local transfers.'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* History Header */}
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-slate-200 text-sm font-bold">Recent Shared Files</Text>
            <Text className="text-slate-500 text-[10px] mt-0.5">Transfer logs and integrity verifications</Text>
          </View>
          {history.length > 0 && (
            <TouchableOpacity
              onPress={handleClearHistory}
              className="flex-row items-center gap-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl"
            >
              <Trash2 size={12} color="#94a3b8" />
              <Text className="text-slate-400 text-[10px] font-semibold">Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* History Search Box */}
        {history.length > 0 && (
          <View 
            className="flex-row items-center px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 mb-4"
          >
            <Search size={14} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search shared files..."
              placeholderTextColor="#64748b"
              className="flex-1 text-xs text-white p-0 h-5"
              style={{ outlineStyle: 'none' } as any}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* History content with EmptyState */}
        {history.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No Transfer Records"
            description="You haven't shared any files between this device and your host PC yet."
            primaryAction={{
              label: isConnected ? "Upload First File" : "Connect to Share",
              onClick: isConnected ? handlePickFile : () => toast.warn("Offline. Connect to Desktop to transfer files.")
            }}
            secondaryAction={{
              label: "How it works",
              onClick: () => toast.success("Once connected, you can upload files here or send files from the desktop app to download them automatically.")
            }}
          />
        ) : filteredHistory.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No Results Found"
            description={`No transfer log entries matched "${searchQuery}".`}
            primaryAction={{
              label: "Clear Search",
              onClick: () => setSearchQuery('')
            }}
            secondaryAction={{
              label: "History Tips",
              onClick: () => toast.success("You can search by filename, transfer status (completed, failed), or direction.")
            }}
          />
        ) : (
          /* History logs list */
          <View className="flex-col gap-2.5">
            {filteredHistory.map((item) => {
              const isToMobile = item.direction === 'desktop_to_mobile';
              return (
                <GlassCard
                  key={item.id}
                  className="flex-col gap-2.5 p-4"
                  style={{ borderRadius: 16 }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2 flex-1">
                      <File size={14} color="#a78bfa" className="shrink-0" />
                      <Text className="text-white text-xs font-semibold truncate flex-1" numberOfLines={1}>
                        {item.fileName}
                      </Text>
                    </View>
                    
                    {isToMobile && item.status === 'completed' && (
                      <TouchableOpacity
                        onPress={() => handleShareFile(item.fileName)}
                        className="mr-3 p-1.5 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-800/30 rounded-lg flex-row items-center gap-1"
                        activeOpacity={0.7}
                      >
                        <Share2 size={10} color="#a78bfa" />
                        <Text className="text-violet-300 text-[9px] font-bold">Open</Text>
                      </TouchableOpacity>
                    )}

                    <Text className="text-slate-500 text-[10px]">{formatBytes(item.fileSize)}</Text>
                  </View>

                  <View className="flex-row items-center justify-between border-t border-slate-900 pt-2 text-[10px]">
                    <View className="flex-row items-center gap-1.5">
                      <View
                        className="rounded-md border p-1"
                        style={{
                          backgroundColor: isToMobile ? 'rgba(139, 92, 246, 0.1)' : 'rgba(52, 211, 153, 0.1)',
                          borderColor: isToMobile ? 'rgba(139, 92, 246, 0.2)' : 'rgba(52, 211, 153, 0.2)',
                        }}
                      >
                        {isToMobile ? (
                          <Download size={10} color="#a78bfa" />
                        ) : (
                          <Upload size={10} color="#34d399" />
                        )}
                      </View>
                      <Text className="text-slate-400 text-[9px]">
                        {isToMobile ? 'Received' : 'Sent'}
                      </Text>
                    </View>

                    {item.avgSpeed !== null && (
                      <Text className="text-slate-500 text-[9px]">
                        {formatSpeed(item.avgSpeed)} • {formatDuration(item.durationMs)}
                      </Text>
                    )}

                    <View className="flex-row items-center gap-1">
                      {item.status === 'completed' && item.integrityVerified ? (
                        <View className="flex-row items-center gap-0.5 bg-emerald-950/40 border border-emerald-900/30 rounded px-1.5 py-0.5">
                          <CheckCircle2 size={8} color="#34d399" />
                          <Text className="text-emerald-400 text-[8px] font-bold uppercase tracking-wider">OK</Text>
                        </View>
                      ) : item.status === 'completed' ? (
                        <View className="flex-row items-center gap-0.5 bg-yellow-950/40 border border-yellow-900/30 rounded px-1.5 py-0.5">
                          <AlertCircle size={8} color="#eab308" />
                          <Text className="text-yellow-400 text-[8px] font-bold uppercase tracking-wider">Unverified</Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-0.5 bg-red-950/40 border border-red-900/30 rounded px-1.5 py-0.5">
                          <XCircle size={8} color="#f87171" />
                          <Text className="text-red-400 text-[8px] font-bold uppercase tracking-wider">{item.status}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </GlassCard>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
