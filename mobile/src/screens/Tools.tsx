import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import {
  Clipboard,
  ArrowLeftRight,
  Smartphone,
  Activity,
  ChevronRight,
  Wifi,
  WifiOff,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import GlassCard from '../components/GlassCard';
import { useWebSocketStore } from '../services/websocket/websocketStore';

interface ToolCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  onPress: () => void;
}

function ToolCard({ icon: Icon, iconColor, iconBg, iconBorder, title, description, badge, badgeColor, onPress }: ToolCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <GlassCard className="flex-row items-center gap-4">
        <View
          className="p-3 rounded-2xl"
          style={{
            backgroundColor: iconBg,
            borderColor: iconBorder,
            borderWidth: 1,
          }}
        >
          <Icon size={22} color={iconColor} />
        </View>
        <View className="flex-1 flex-col">
          <View className="flex-row items-center gap-2">
            <Text className="text-white text-sm font-semibold">{title}</Text>
            {badge && (
              <View
                className="px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: badgeColor ? `${badgeColor}15` : 'rgba(139, 92, 246, 0.1)',
                  borderColor: badgeColor ? `${badgeColor}30` : 'rgba(139, 92, 246, 0.2)',
                  borderWidth: 1,
                }}
              >
                <Text
                  className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: badgeColor || '#a78bfa' }}
                >
                  {badge}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-slate-500 text-xs font-light mt-0.5">{description}</Text>
        </View>
        <ChevronRight size={16} color="#475569" />
      </GlassCard>
    </TouchableOpacity>
  );
}

function TelemetryMiniCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <View
      className="flex-1 flex-col items-center py-3 rounded-2xl"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.3)',
        borderColor: 'rgba(30, 41, 59, 0.3)',
        borderWidth: 1,
      }}
    >
      <Icon size={16} color={color} />
      <Text className="text-white text-xs font-bold mt-1.5">{value}</Text>
      <Text className="text-slate-500 text-[9px] font-medium mt-0.5">{label}</Text>
    </View>
  );
}

export default function Tools() {
  const navigation = useNavigation<any>();
  const { connectionStatus, systemStats, clipboardHistory } = useWebSocketStore();
  const isConnected = connectionStatus === 'connected';

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="Tools" subtitle="Quick access utilities" />
      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 110 }}>

        {/* Connection Status Banner */}
        <GlassCard className="flex-row items-center gap-3 mb-5">
          <View
            className="p-2 rounded-full"
            style={{
              backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
              borderColor: isConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
              borderWidth: 1,
            }}
          >
            {isConnected ? (
              <Wifi size={16} color="#10b981" />
            ) : (
              <WifiOff size={16} color="#f43f5e" />
            )}
          </View>
          <View className="flex-1 flex-col">
            <Text className="text-white text-xs font-semibold">
              {isConnected ? 'Connected to Host PC' : 'Disconnected'}
            </Text>
            <Text className="text-slate-500 text-[10px] font-light mt-0.5">
              {isConnected ? 'All tools are available' : 'Some tools require a connection'}
            </Text>
          </View>
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isConnected ? '#10b981' : '#f43f5e' }}
          />
        </GlassCard>

        {/* Quick Telemetry Strip */}
        {isConnected && systemStats && (
          <View className="flex-row gap-2 mb-5">
            <TelemetryMiniCard
              icon={Cpu}
              label="CPU"
              value={`${systemStats.cpu?.toFixed(0) ?? '—'}%`}
              color="#8b5cf6"
            />
            <TelemetryMiniCard
              icon={MemoryStick}
              label="RAM"
              value={`${systemStats.ram?.toFixed(0) ?? '—'}%`}
              color="#06b6d4"
            />
            <TelemetryMiniCard
              icon={HardDrive}
              label="Disk"
              value={`${systemStats.disk?.toFixed(0) ?? '—'}%`}
              color="#f59e0b"
            />
            <TelemetryMiniCard
              icon={Clock}
              label="Ping"
              value={`${systemStats.latencyMs?.toFixed(0) ?? '—'} ms`}
              color="#ef4444"
            />
          </View>
        )}

        {/* Tool Cards */}
        <View className="flex-col gap-3">
          <ToolCard
            icon={Clipboard}
            iconColor="#8b5cf6"
            iconBg="rgba(139, 92, 246, 0.1)"
            iconBorder="rgba(139, 92, 246, 0.2)"
            title="Clipboard Sync"
            description="View and manage synced clipboard entries"
            badge={clipboardHistory.length > 0 ? `${clipboardHistory.length}` : undefined}
            badgeColor="#8b5cf6"
            onPress={() => navigation.navigate('ClipboardHistory')}
          />
          <ToolCard
            icon={ArrowLeftRight}
            iconColor="#06b6d4"
            iconBg="rgba(6, 182, 212, 0.1)"
            iconBorder="rgba(6, 182, 212, 0.2)"
            title="File Transfers"
            description="Send and receive files over local network"
            onPress={() => navigation.navigate('Transfers')}
          />
          <ToolCard
            icon={Smartphone}
            iconColor="#10b981"
            iconBg="rgba(16, 185, 129, 0.1)"
            iconBorder="rgba(16, 185, 129, 0.2)"
            title="Paired Devices"
            description="Manage paired Windows host connections"
            badge={isConnected ? 'Online' : 'Offline'}
            badgeColor={isConnected ? '#10b981' : '#f43f5e'}
            onPress={() => navigation.navigate('DevicesTab')}
          />
          <ToolCard
            icon={Activity}
            iconColor="#f59e0b"
            iconBg="rgba(245, 158, 11, 0.1)"
            iconBorder="rgba(245, 158, 11, 0.2)"
            title="System Monitor"
            description="Live hardware performance metrics"
            badge={isConnected ? 'Live' : undefined}
            badgeColor="#f59e0b"
            onPress={() => navigation.navigate('MonitorTab')}
          />
        </View>

      </ScrollView>
    </View>
  );
}
