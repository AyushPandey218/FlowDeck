import React from 'react';
import { View, Text, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBadge from './StatusBadge';
import { useWebSocketStore } from '../services/websocket/websocketStore';

interface HeaderProps {
  title: string;
  subtitle?: string;
  status?: 'online' | 'offline' | 'idle' | 'warning';
  statusText?: string;
}

export default function Header({ title, subtitle, status: propStatus, statusText: propStatusText }: HeaderProps) {
  const connectionStatus = useWebSocketStore((state) => state.connectionStatus);
  const insets = useSafeAreaInsets();

  // Map connectionStatus ('connected' | 'connecting' | 'disconnected') to StatusBadge props
  let status: 'online' | 'offline' | 'idle' | 'warning' = 'offline';
  let statusText = 'Server Offline';

  if (connectionStatus === 'connected') {
    status = 'online';
    statusText = 'Server Online';
  } else if (connectionStatus === 'connecting') {
    status = 'idle';
    statusText = 'Connecting';
  }

  const finalStatus = propStatus !== undefined ? propStatus : status;
  const finalStatusText = propStatusText !== undefined ? propStatusText : statusText;

  return (
    <View 
      className="flex-row justify-between items-center px-6 py-4"
      style={{
        paddingTop: insets.top + 16,
        backgroundColor: 'rgba(2, 6, 23, 0.2)',
        borderBottomColor: 'rgba(15, 23, 42, 0.4)',
        borderBottomWidth: 1,
      }}
    >
      <View className="flex-row items-center gap-3">
        <Image 
          source={require('../../assets/icon.png')} 
          style={{ width: 28, height: 28, borderRadius: 6 }} 
          resizeMode="contain" 
        />
        <View className="flex-col">
          <Text className="text-lg font-bold text-white tracking-tight">{title}</Text>
          {subtitle ? <Text className="text-[10px] text-slate-400 font-light mt-0.5">{subtitle}</Text> : null}
        </View>
      </View>
      <StatusBadge status={finalStatus} text={finalStatusText} />
    </View>
  );
}
