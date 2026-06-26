import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { Smartphone, Laptop, Link2Off, Plus } from 'lucide-react-native';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import GlassCard from '../components/GlassCard';
import { useWebSocketStore } from '../services/websocket/websocketStore';
import { websocketManager } from '../services/websocket/WebSocketManager';

export default function Devices({ navigation }: any) {
  const { pairedHost, deviceNickname, deviceName, connectionStatus, setPairedHost } = useWebSocketStore();
  const isConnected = connectionStatus === 'connected';

  const handleUnpair = () => {
    websocketManager.unpair();
    setPairedHost(null);
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="Devices" subtitle="Paired Windows hosts" />
      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 110 }}>
        {pairedHost ? (
          <View className="flex-col gap-5">
            <GlassCard className="flex-col gap-4">
              <View className="flex-row items-center gap-3">
                <View 
                  className="p-3 rounded-full"
                  style={{
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderColor: 'rgba(139, 92, 246, 0.2)',
                    borderWidth: 1,
                  }}
                >
                  <Laptop size={22} color="#8b5cf6" />
                </View>
                <View className="flex-1 flex-col">
                  <Text className="text-white text-sm font-semibold">{deviceNickname}</Text>
                  <Text className="text-slate-400 text-xs font-light mt-0.5">{deviceName}</Text>
                </View>
                <View 
                  className="px-2.5 py-1 rounded-full border"
                  style={{
                    backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                    borderColor: isConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                  }}
                >
                  <Text className={`text-[10px] font-bold uppercase tracking-wider ${
                    isConnected ? 'text-emerald-400' : 'text-rose-400'
                  }`}>{connectionStatus}</Text>
                </View>
              </View>



              <View 
                className="w-full"
                style={{
                  height: 1,
                  backgroundColor: 'rgba(30, 41, 59, 0.3)',
                }}
              />

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleUnpair}
                className="w-full flex-row justify-center items-center gap-2 bg-slate-900 border border-slate-800 py-3 rounded-xl"
              >
                <Link2Off size={14} color="#f43f5e" />
                <Text className="text-rose-400 text-xs font-semibold">Unpair Host PC</Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        ) : (
          <View className="flex-col gap-6 items-center">
            <EmptyState
              icon={Smartphone}
              title="No Host PC Paired"
              description="Pair this device with your Windows host to enable remote commands and hardware monitoring."
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('PairDevice')}
              className="w-full flex-row justify-center items-center gap-2 bg-violet-600 py-3.5 rounded-xl"
              style={{
                borderColor: 'rgba(139, 92, 246, 0.3)',
                borderWidth: 1,
                shadowColor: 'rgb(46, 16, 101)',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              <Plus size={16} color="#ffffff" />
              <Text className="text-white text-sm font-semibold">Pair New Host PC</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
