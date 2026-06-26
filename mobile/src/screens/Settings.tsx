import React from 'react';
import { View, ScrollView, Text, TouchableOpacity, Linking } from 'react-native';
import { 
  Info, Sun, Moon, Sparkles, Clipboard, ChevronRight, 
  ToggleLeft, ToggleRight, ArrowLeftRight, Globe, Mail, Smartphone, Heart, Code, Coffee
} from 'lucide-react-native';

import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import GlassCard from '../components/GlassCard';
import SectionHeader from '../components/SectionHeader';
import { useWebSocketStore } from '../services/websocket/websocketStore';
import { useToast } from '../components/ToastSystem';

export default function Settings() {
  const toast = useToast();
  const navigation = useNavigation<any>();



  const themes = [
    { label: 'Dark Mode', value: 'dark', icon: Moon, active: true },
    { label: 'Light Mode', value: 'light', icon: Sun, active: false },
    { label: 'System Theme', value: 'system', icon: Sparkles, active: false },
  ];

  const {
    connectionStatus,
    clipboardSyncEnabled,
    setClipboardSyncEnabled,
    feedbackGithubUrl,
    feedbackEmail,
    deviceNickname,
    hapticFeedbackEnabled,
    setHapticFeedbackEnabled,
  } = useWebSocketStore();



  const handleToggleClipboardSync = () => {
    setClipboardSyncEnabled(!clipboardSyncEnabled);
    toast.success(clipboardSyncEnabled ? "Clipboard sync disabled." : "Clipboard sync enabled.");
  };

  const handleToggleHapticFeedback = () => {
    setHapticFeedbackEnabled(!hapticFeedbackEnabled);
    toast.success(hapticFeedbackEnabled ? "Haptic feedback disabled." : "Haptic feedback enabled.");
  };

  const handleOpenFeedback = async (url: string) => {
    if (!url) return;
    const lowerUrl = url.toLowerCase().trim();
    if (lowerUrl.startsWith('https://') || lowerUrl.startsWith('mailto:')) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          toast.error("Unable to open the link on this system.");
        }
      } catch (e) {
        toast.error("Failed to open link.");
      }
    } else {
      toast.error("Invalid link protocol: only https:// and mailto: are allowed.");
    }
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="Settings" subtitle="App configurations" />
      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 110 }}>
        <View className="flex-col gap-6">

          {/* GENERAL SECTION */}
          <View className="flex-col">
            <SectionHeader title="General" subtitle="Application information and feedback" />
            <GlassCard className="flex-col gap-4">
              
              {/* Theme Preferences */}
              <View className="flex-col gap-2">
                <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Theme Preference</Text>
                <View className="flex-row gap-2 flex-wrap">
                  {themes.map((t, i) => (
                    <TouchableOpacity
                      key={i}
                      activeOpacity={0.8}
                      disabled={!t.active}
                      className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl flex-1 justify-center border"
                      style={t.active ? {
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.3)',
                      } : {
                        backgroundColor: 'rgba(15, 23, 42, 0.4)',
                        borderColor: 'rgba(30, 41, 59, 0.4)',
                        opacity: 0.5,
                      }}
                    >
                      <t.icon size={12} color={t.active ? '#c084fc' : '#64748b'} />
                      <Text className={`text-[11px] ${t.active ? 'text-violet-200 font-semibold' : 'text-slate-400'}`}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Haptic Feedback Toggle */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleToggleHapticFeedback}
                className="flex-row items-center justify-between border-t border-slate-900 pt-3"
              >
                <View className="flex-row items-center gap-3 flex-1 mr-2">
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: hapticFeedbackEnabled ? 'rgba(139, 92, 246, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      borderWidth: 1,
                      borderColor: hapticFeedbackEnabled ? 'rgba(139, 92, 246, 0.3)' : 'rgba(30, 41, 59, 0.4)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Smartphone size={14} color={hapticFeedbackEnabled ? '#a78bfa' : '#64748b'} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-xs font-semibold">Haptic Feedback</Text>
                    <Text className="text-slate-500 text-[9px] mt-0.5 leading-normal" numberOfLines={2}>
                      Provides vibration feedback when interacting with actions and notifications.
                    </Text>
                  </View>
                </View>
                {hapticFeedbackEnabled ? (
                  <ToggleRight size={24} color="#a78bfa" />
                ) : (
                  <ToggleLeft size={24} color="#475569" />
                )}
              </TouchableOpacity>

              {/* Feedback Links */}
              <View className="flex-col gap-2 border-t border-slate-900 pt-3">
                <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Feedback & Support</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenFeedback("https://github.com/AyushPandey218")}
                  className="flex-row items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800"
                >
                  <View className="flex-row items-center gap-2.5">
                    <Code size={14} color="#a78bfa" />
                    <Text className="text-slate-300 text-xs font-semibold">GitHub Profile</Text>
                  </View>
                  <ChevronRight size={14} color="#64748b" />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenFeedback("https://buymeacoffee.com/ayush_wg218")}
                  className="flex-row items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800"
                >
                  <View className="flex-row items-center gap-2.5">
                    <Coffee size={14} color="#f43f5e" />
                    <Text className="text-slate-300 text-xs font-semibold">Buy Me a Coffee</Text>
                  </View>
                  <ChevronRight size={14} color="#64748b" />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => toast.success("Use my mail: ayushpandey0618@gmail.com")}
                  className="flex-row items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800"
                >
                  <View className="flex-row items-center gap-2.5">
                    <Mail size={14} color="#a78bfa" />
                    <Text className="text-slate-350 text-xs font-semibold">Email Me</Text>
                  </View>
                  <ChevronRight size={14} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* About Application */}
              <View className="flex-col gap-2.5 border-t border-slate-900 pt-3">
                <View className="flex-row items-center gap-2">
                  <Info size={14} color="#a78bfa" />
                  <Text className="text-white text-xs font-bold">Flow Deck Companion</Text>
                </View>
                <Text className="text-slate-400 text-[10px] font-light leading-normal">
                  Monitor and control your Windows PC directly over your local area network (LAN).
                </Text>
                <View className="flex-row justify-between items-center mt-1 bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                  <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Build Version</Text>
                  <Text className="text-white text-xs font-mono font-medium">v0.1.0-alpha</Text>
                </View>
              </View>

            </GlassCard>
          </View>

          {/* CONNECTION SECTION */}
          <View className="flex-col">
            <SectionHeader title="Connection" subtitle="Device linking and pairing status" />
            <GlassCard className="flex-col gap-4">
              
              {/* Current Connection Info */}
              <View 
                className="flex-row justify-between items-center p-3 rounded-xl"
                style={{
                  backgroundColor: 'rgba(2, 6, 23, 0.4)',
                  borderColor: 'rgba(15, 23, 42, 0.5)',
                  borderWidth: 1,
                }}
              >
                <View className="flex-col">
                  <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Host PC</Text>
                  <Text className="text-white text-xs font-medium mt-0.5">
                    {connectionStatus === 'connected' ? 'Connected PC' : 'Not Connected'}
                  </Text>
                </View>
                <View className="flex-col items-end">
                  <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Connection Status</Text>
                  <Text className={`text-xs font-semibold mt-0.5 ${
                    connectionStatus === 'connected' ? 'text-emerald-400' :
                    connectionStatus === 'connecting' ? 'text-amber-400' : 'text-rose-400'
                  }`}>{connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}</Text>
                </View>
              </View>

              {/* Companion Nickname info */}
              <View className="flex-row justify-between items-center bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                <Text className="text-slate-500 text-[10px] font-semibold">Device Nickname</Text>
                <Text className="text-white text-xs font-semibold">{deviceNickname}</Text>
              </View>

              {/* Pair Device Shortcut */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('PairDevice')}
                className="flex-row items-center justify-between p-3 rounded-xl bg-violet-600/10 border border-violet-900/35"
              >
                <View className="flex-row items-center gap-2">
                  <Smartphone size={14} color="#a78bfa" />
                  <Text className="text-violet-300 text-xs font-semibold">Pair New Companion Device</Text>
                </View>
                <ChevronRight size={14} color="#a78bfa" />
              </TouchableOpacity>
            </GlassCard>
          </View>

          {/* CLIPBOARD SECTION */}
          <View className="flex-col">
            <SectionHeader title="Clipboard" subtitle="Universal clipboard synchronization" />
            <GlassCard className="flex-col gap-4">
              
              {/* Sync Toggle */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleToggleClipboardSync}
                className="flex-row items-center justify-between"
              >
                <View className="flex-row items-center gap-3 flex-1 mr-2">
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: clipboardSyncEnabled ? 'rgba(139, 92, 246, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      borderWidth: 1,
                      borderColor: clipboardSyncEnabled ? 'rgba(139, 92, 246, 0.3)' : 'rgba(30, 41, 59, 0.4)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Clipboard size={14} color={clipboardSyncEnabled ? '#a78bfa' : '#64748b'} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-xs font-semibold">Enable Clipboard Sync</Text>
                    <Text className="text-slate-500 text-[9px] mt-0.5 leading-normal" numberOfLines={2}>
                      {clipboardSyncEnabled ? 'Shared clipboard is currently active' : 'Turn on to share text copies between devices'}
                    </Text>
                  </View>
                </View>
                {clipboardSyncEnabled ? (
                  <ToggleRight size={24} color="#a78bfa" />
                ) : (
                  <ToggleLeft size={24} color="#475569" />
                )}
              </TouchableOpacity>

              {/* View History shortcut */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ClipboardHistory')}
                className="flex-row items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800"
              >
                <View className="flex-row items-center gap-2">
                  <Clipboard size={12} color="#94a3b8" />
                  <Text className="text-slate-300 text-xs font-semibold">View Clipboard History</Text>
                </View>
                <ChevronRight size={14} color="#64748b" />
              </TouchableOpacity>
            </GlassCard>
          </View>

          {/* TRANSFERS SECTION */}
          <View className="flex-col">
            <SectionHeader title="Transfers" subtitle="Local area network file transfer configuration" />
            <GlassCard className="flex-col gap-4">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Transfers')}
                className="flex-row items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800"
              >
                <View className="flex-row items-center gap-2">
                  <ArrowLeftRight size={12} color="#94a3b8" />
                  <Text className="text-slate-300 text-xs font-semibold">View Sharing & Transfer Logs</Text>
                </View>
                <ChevronRight size={14} color="#64748b" />
              </TouchableOpacity>
            </GlassCard>
          </View>



        </View>
      </ScrollView>
    </View>
  );
}
