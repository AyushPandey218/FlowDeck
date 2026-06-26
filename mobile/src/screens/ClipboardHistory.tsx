import React, { useState, useCallback } from 'react';
import { View, ScrollView, Text, TouchableOpacity, TextInput } from 'react-native';
import { CustomAlert } from '../components/AlertSystem';
import { Clipboard, ArrowUpRight, ArrowDownLeft, Monitor, Smartphone, Copy, Trash2, Search, X } from 'lucide-react-native';
import Header from '../components/Header';
import GlassCard from '../components/GlassCard';
import * as ExpoClipboard from 'expo-clipboard';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastSystem';
import { useWebSocketStore } from '../services/websocket/websocketStore';

interface ClipboardEntry {
  text: string;
  sourceDeviceId: string;
  timestamp: number;
  syncId: string;
  version: number;
  direction: 'desktop_to_mobile' | 'mobile_to_desktop' | 'local';
}

export default function ClipboardHistoryScreen() {
  const clipboardHistory = useWebSocketStore((s) => s.clipboardHistory);
  const clipboardSyncEnabled = useWebSocketStore((s) => s.clipboardSyncEnabled);
  const removeClipboardEntry = useWebSocketStore((s) => s.removeClipboardEntry);
  const clearClipboardHistory = useWebSocketStore((s) => s.clearClipboardHistory);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const toast = useToast();

  const filtered = searchQuery
    ? clipboardHistory.filter((e) => e.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : clipboardHistory;

  const handleCopyAgain = async (entry: ClipboardEntry, idx: number) => {
    await ExpoClipboard.setStringAsync(entry.text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleDelete = (idx: number) => {
    removeClipboardEntry(idx);
  };

  const handleClearAll = () => {
    CustomAlert.alert(
      'Clear Clipboard History',
      'This will remove all clipboard history from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => clearClipboardHistory(),
        },
      ]
    );
  };

  const formatTime = (epochMs: number) => {
    const now = Date.now();
    const diffMs = now - epochMs;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(epochMs).toLocaleDateString();
  };

  const getDirectionStyle = (direction: string) => {
    switch (direction) {
      case 'desktop_to_mobile':
        return {
          label: 'Desktop → Mobile',
          color: '#a78bfa',
          bgColor: 'rgba(139, 92, 246, 0.1)',
          borderColor: 'rgba(139, 92, 246, 0.2)',
          Icon: ArrowDownLeft,
        };
      case 'mobile_to_desktop':
        return {
          label: 'Mobile → Desktop',
          color: '#34d399',
          bgColor: 'rgba(52, 211, 153, 0.1)',
          borderColor: 'rgba(52, 211, 153, 0.2)',
          Icon: ArrowUpRight,
        };
      default:
        return {
          label: 'Local',
          color: '#94a3b8',
          bgColor: 'rgba(148, 163, 184, 0.1)',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          Icon: Smartphone,
        };
    }
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="Clipboard History" subtitle="Synced clipboard entries" />
      <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Status Card */}
        {!clipboardSyncEnabled && (
          <GlassCard className="flex-row items-center gap-3 mb-4" style={{ borderRadius: 16, padding: 14 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                borderWidth: 1,
                borderColor: 'rgba(251, 191, 36, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clipboard size={14} color="#fbbf24" />
            </View>
            <View className="flex-1">
              <Text className="text-amber-300 text-xs font-semibold">Sync Disabled</Text>
              <Text className="text-slate-500 text-[10px] mt-0.5">
                Enable in Settings → Clipboard Sync toggle
              </Text>
            </View>
          </GlassCard>
        )}

        {/* Search & Actions */}
        <View className="flex-row items-center gap-2 mb-4">
          <View
            className="flex-1 flex-row items-center"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              borderColor: 'rgba(30, 41, 59, 0.5)',
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Search size={12} color="#64748b" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search..."
              placeholderTextColor="#475569"
              className="flex-1 text-white text-xs ml-2"
              style={{ paddingVertical: 2 }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={12} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={handleClearAll}
            disabled={clipboardHistory.length === 0}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              borderColor: 'rgba(30, 41, 59, 0.5)',
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              opacity: clipboardHistory.length === 0 ? 0.3 : 1,
            }}
          >
            <Text className="text-rose-400 text-[10px] font-semibold">Clear All</Text>
          </TouchableOpacity>
        </View>

        {/* Count */}
        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-3">
          {filtered.length} {filtered.length === 1 ? 'Entry' : 'Entries'}
        </Text>

        {/* Empty State */}
        {filtered.length === 0 ? (
          clipboardHistory.length === 0 ? (
            <EmptyState
              icon={Clipboard}
              title="No Clipboard History"
              description="No clipboard entries have been synced to this device yet."
              primaryAction={{
                label: clipboardSyncEnabled ? "Check Connection" : "Enable Sync in Settings",
                onClick: () => {
                  toast.success(clipboardSyncEnabled ? "Clipboard sync is online." : "Please enable Clipboard Sync under settings.");
                }
              }}
              secondaryAction={{
                label: "How to Sync",
                onClick: () => toast.success("Copy text on your computer, and it will automatically sync to your phone's clipboard!")
              }}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No Matching Entries"
              description={`We couldn't find any clipboard items matching "${searchQuery}".`}
              primaryAction={{
                label: "Clear Search",
                onClick: () => setSearchQuery('')
              }}
              secondaryAction={{
                label: "Search Tips",
                onClick: () => toast.success("Try searching for specific substrings or checking capitalization.")
              }}
            />
          )
        ) : (
          <View className="flex-col gap-2">
            {filtered.map((entry, idx) => {
              const dirStyle = getDirectionStyle(entry.direction);
              const DirIcon = dirStyle.Icon;
              return (
                <GlassCard
                  key={`${entry.syncId}-${idx}`}
                  className="flex-col gap-2"
                  style={{ borderRadius: 16, padding: 14 }}
                >
                  {/* Text Preview */}
                  <Text
                    className="text-slate-200 text-xs font-mono leading-relaxed"
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {entry.text}
                  </Text>

                  {/* Metadata Row */}
                  <View className="flex-row items-center gap-2 mt-1">
                    {/* Direction Badge */}
                    <View
                      className="flex-row items-center gap-1"
                      style={{
                        backgroundColor: dirStyle.bgColor,
                        borderColor: dirStyle.borderColor,
                        borderWidth: 1,
                        borderRadius: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <DirIcon size={8} color={dirStyle.color} />
                      <Text style={{ color: dirStyle.color, fontSize: 9, fontWeight: '600' }}>
                        {dirStyle.label}
                      </Text>
                    </View>

                    <Text className="text-slate-600 text-[9px]">{formatTime(entry.timestamp)}</Text>

                    {/* Spacer */}
                    <View className="flex-1" />

                    {/* Action Buttons */}
                    <TouchableOpacity
                      onPress={() => handleCopyAgain(entry, idx)}
                      activeOpacity={0.7}
                      style={{
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.2)',
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Copy size={10} color={copiedIdx === idx ? '#34d399' : '#a78bfa'} />
                      <Text
                        style={{
                          color: copiedIdx === idx ? '#34d399' : '#a78bfa',
                          fontSize: 9,
                          fontWeight: '600',
                        }}
                      >
                        {copiedIdx === idx ? 'Copied!' : 'Copy'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleDelete(idx)}
                      activeOpacity={0.7}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderColor: 'rgba(239, 68, 68, 0.2)',
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 4,
                      }}
                    >
                      <Trash2 size={10} color="#f87171" />
                    </TouchableOpacity>
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
