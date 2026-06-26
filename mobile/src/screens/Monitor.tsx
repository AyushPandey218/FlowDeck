import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { Cpu, Database, Activity, HardDrive, ArrowUpRight, ArrowDownRight, Clock, Signal, TerminalSquare } from 'lucide-react-native';
import Header from '../components/Header';
import GlassCard from '../components/GlassCard';
import { useWebSocketStore } from '../services/websocket/websocketStore';
import { websocketManager } from '../services/websocket/WebSocketManager';

export default function Monitor() {
  const systemStats = useWebSocketStore((state) => state.systemStats);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    
    if (d > 0) {
      return `${d}d ${h}h ${m}m`;
    }
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="PC Monitor" subtitle="Live hardware stats" />
      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 110 }}>
        {!systemStats ? (
          <GlassCard className="items-center py-12 gap-3">
            <Activity size={32} color="#64748b" />
            <Text className="text-slate-400 text-sm font-semibold text-center leading-normal">
              Waiting for Telemetry
            </Text>
            <Text className="text-slate-500 text-xs text-center font-light leading-relaxed max-w-[200px]">
              Tauri server is offline or companion app is disconnected.
            </Text>
          </GlassCard>
        ) : (
          <View className="flex-col gap-4">
            {/* CPU / RAM / Disk / GPU Cards */}
            <View className="flex-col gap-4">
              {/* CPU */}
              <GlassCard className="flex-row justify-between items-center py-4">
                <View className="flex-row items-center gap-3">
                  <View 
                    className="p-2.5 rounded-2xl"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.5)',
                      borderColor: 'rgba(30, 41, 59, 0.4)',
                      borderWidth: 1,
                    }}
                  >
                    <Cpu size={16} color="#a78bfa" />
                  </View>
                  <Text className="text-slate-300 text-sm font-semibold">CPU</Text>
                </View>
                <Text className="text-white text-base font-bold font-mono">{Math.round(systemStats.cpu)}%</Text>
              </GlassCard>

              {/* RAM */}
              <GlassCard className="flex-row justify-between items-center py-4">
                <View className="flex-row items-center gap-3">
                  <View 
                    className="p-2.5 rounded-2xl"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.5)',
                      borderColor: 'rgba(30, 41, 59, 0.4)',
                      borderWidth: 1,
                    }}
                  >
                    <Database size={16} color="#a78bfa" />
                  </View>
                  <Text className="text-slate-300 text-sm font-semibold">RAM</Text>
                </View>
                <Text className="text-white text-base font-bold font-mono">{Math.round(systemStats.ram)}%</Text>
              </GlassCard>

              {/* Disk */}
              <GlassCard className="flex-row justify-between items-center py-4">
                <View className="flex-row items-center gap-3">
                  <View 
                    className="p-2.5 rounded-2xl"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.5)',
                      borderColor: 'rgba(30, 41, 59, 0.4)',
                      borderWidth: 1,
                    }}
                  >
                    <HardDrive size={16} color="#a78bfa" />
                  </View>
                  <Text className="text-slate-300 text-sm font-semibold">Disk</Text>
                </View>
                <Text className="text-white text-base font-bold font-mono">{Math.round(systemStats.disk)}%</Text>
              </GlassCard>

            </View>

            {/* Network Rates */}
            <GlassCard className="flex-row justify-between items-center py-4">
              <View className="flex-row items-center gap-2.5 w-[47%]">
                <ArrowUpRight size={18} color="#10b981" />
                <View className="flex-col">
                  <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Upload</Text>
                  <Text className="text-white text-xs font-bold mt-0.5">{formatBytes(systemStats.networkUp)}</Text>
                </View>
              </View>
              <View 
                style={{
                  width: 1,
                  height: 32,
                  backgroundColor: 'rgba(30, 41, 59, 0.3)',
                }}
              />
              <View className="flex-row items-center gap-2.5 w-[47%] pl-4">
                <ArrowDownRight size={18} color="#8b5cf6" />
                <View className="flex-col">
                  <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Download</Text>
                  <Text className="text-white text-xs font-bold mt-0.5">{formatBytes(systemStats.networkDown)}</Text>
                </View>
              </View>
            </GlassCard>

            {/* Latency / Uptime */}
            <GlassCard className="flex-row justify-between items-center py-4">
              <View className="flex-row items-center gap-2.5 w-[47%]">
                <Signal size={18} color="#0284c7" />
                <View className="flex-col">
                  <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Latency</Text>
                  <Text className="text-white text-xs font-bold mt-0.5">{systemStats.latencyMs} ms</Text>
                </View>
              </View>
              <View 
                style={{
                  width: 1,
                  height: 32,
                  backgroundColor: 'rgba(30, 41, 59, 0.3)',
                }}
              />
              <View className="flex-row items-center gap-2.5 w-[47%] pl-4">
                <Clock size={18} color="#6366f1" />
                <View className="flex-col">
                  <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Uptime</Text>
                  <Text className="text-white text-xs font-bold mt-0.5">{formatUptime(systemStats.uptime)}</Text>
                </View>
              </View>
            </GlassCard>

            <TouchableOpacity 
              onPress={() => websocketManager.openTaskManager()}
              className="mt-6 flex-row items-center justify-center gap-2.5 bg-violet-600/20 py-3.5 rounded-2xl border border-violet-500/30 active:bg-violet-600/30"
            >
              <TerminalSquare size={18} color="#a855f7" />
              <Text className="text-violet-400 font-bold text-sm">Open Task Manager</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
