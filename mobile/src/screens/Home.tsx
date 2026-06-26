import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Text, TouchableOpacity, TextInput, Image } from 'react-native';
import { 
  Terminal, 
  Globe, 
  Folder, 
  Volume2, 
  VolumeX, 
  Lock, 
  ShieldAlert, 
  CheckCircle, 
  Layers,
  MessageSquare, // for Discord
  Music,         // for Spotify
  Gamepad2,      // for Steam
  ArrowLeftRight,
  ChevronRight,
  Search,
  X,
  Minimize2,
  Monitor,
  Keyboard
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import GlassCard from '../components/GlassCard';
import ActionButton from '../components/ActionButton';
import SectionHeader from '../components/SectionHeader';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastSystem';
import { useWebSocketStore } from '../services/websocket/websocketStore';
import { websocketManager } from '../services/websocket/WebSocketManager';
import { haptics } from '../services/haptics';
import { Action } from '@flowdeck/shared';

const getIconInfo = (iconKey: string | null) => {
  // Handle Base64 encoded icons from app discovery
  if (iconKey && (iconKey.startsWith('data:image/') || iconKey.length > 50)) {
    return { Component: null, color: '#a78bfa', base64: iconKey };
  }
  switch (iconKey) {
    case 'chrome':
      return { Component: Globe, color: '#4285F4' }; // Chrome Blue
    case 'vscode':
      return { Component: Terminal, color: '#007ACC' }; // VSCode Blue
    case 'discord':
      return { Component: MessageSquare, color: '#5865F2' }; // Discord Blurple
    case 'spotify':
      return { Component: Music, color: '#1DB954' }; // Spotify Green
    case 'steam':
      return { Component: Gamepad2, color: '#00ADEE' }; // Steam Cyan
    case 'folder':
      return { Component: Folder, color: '#eab308' }; // Folder Yellow
    case 'volume':
      return { Component: Volume2, color: '#c084fc' }; // Volume Violet
    case 'mute':
      return { Component: VolumeX, color: '#f87171' }; // Mute Red
    case 'lock':
      return { Component: Lock, color: '#ef4444' }; // Lock Red
    case 'minimize':
      return { Component: Minimize2, color: '#818cf8' }; // Indigo
    case 'close_all':
      return { Component: X, color: '#f43f5e' }; // Rose Red
    case 'desktop':
      return { Component: Monitor, color: '#38bdf8' }; // Sky Blue
    case 'keyboard':
      return { Component: Keyboard, color: '#f472b6' }; // Pink
    case 'globe':
      return { Component: Globe, color: '#a78bfa' }; // General purple
    default:
      if (iconKey) {
        return {
          Component: ({ size, color }: any) => (
            <Text style={{ fontSize: (size || 16) * 1.1, color: color, textAlign: 'center', lineHeight: (size || 16) * 1.1 }}>
              {iconKey}
            </Text>
          ),
          color: '#a78bfa'
        };
      }
      return { Component: Globe, color: '#a78bfa' };
  }
};

export default function Home() {
  const connectionStatus = useWebSocketStore((state) => state.connectionStatus);
  const actions = useWebSocketStore((state) => state.actions);
  const pages = useWebSocketStore((state) => state.pages);

  const isConnected = connectionStatus === 'connected';
  const navigation = useNavigation<any>();
  const toast = useToast();

  const [activePageId, setActivePageId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (pages.length > 0 && (!activePageId || !pages.some(p => p.id === activePageId))) {
      setActivePageId(pages[0].id);
    }
  }, [pages]);

  const activePage = pages.find((p) => p.id === activePageId);

  // Map category IDs to category metadata for quick lookups
  const categoriesMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; pageId: string; pageName: string }>();
    pages.forEach(p => {
      p.categories?.forEach(c => {
        map.set(c.id, { id: c.id, name: c.name, pageId: p.id, pageName: p.name });
      });
    });
    return map;
  }, [pages]);

  // Memoized search filtering
  const filteredActions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return actions.filter(action => {
      const cat = categoriesMap.get(action.categoryId);
      const pageName = cat ? cat.pageName : '';
      const catName = cat ? cat.name : '';
      return (
        action.name.toLowerCase().includes(q) ||
        action.actionType.toLowerCase().includes(q) ||
        catName.toLowerCase().includes(q) ||
        pageName.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, actions, categoriesMap]);

  // Grouped search results by page
  const groupedSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const groups: { [pageId: string]: { pageName: string; actions: Action[] } } = {};
    
    filteredActions.forEach((action: Action) => {
      const cat = categoriesMap.get(action.categoryId);
      if (cat) {
        const pId = cat.pageId;
        const pName = cat.pageName;
        if (!groups[pId]) {
          groups[pId] = { pageName: pName, actions: [] };
        }
        groups[pId].actions.push(action);
      }
    });

    return Object.keys(groups).map(pId => ({
      pageId: pId,
      pageName: groups[pId].pageName,
      actions: groups[pId].actions
    }));
  }, [filteredActions, categoriesMap, searchQuery]);

  return (
    <View className="flex-1 bg-slate-950">
      <Header
        title="Flow Deck"
        subtitle="Control your Windows PC"
      />
      <View className="flex-1">
        {/* Page Pills Tab Bar */}
        {pages.length > 0 && (
          <View 
            className="py-3 bg-slate-950 shrink-0"
            style={{
              borderBottomColor: 'rgba(15, 23, 42, 0.5)',
              borderBottomWidth: 1,
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
            >
              {pages
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((p) => {
                  const isActive = p.id === activePageId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.7}
                      onPress={() => setActivePageId(p.id)}
                      className="px-4 py-2 rounded-2xl"
                      style={isActive ? {
                        backgroundColor: 'rgba(124, 58, 237, 0.15)',
                        borderColor: 'rgba(139, 92, 246, 0.35)',
                        borderWidth: 1,
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.2,
                        shadowRadius: 1.5,
                        elevation: 1,
                      } : {
                        backgroundColor: 'rgba(15, 23, 42, 0.4)',
                        borderColor: 'rgba(30, 41, 59, 0.4)',
                        borderWidth: 1,
                      }}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          isActive ? 'text-violet-300' : 'text-slate-400'
                        }`}
                      >
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        )}

        {/* Search Bar */}
        <View className="px-6 py-2 bg-slate-950 shrink-0">
          <View 
            className="flex-row items-center px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
          >
            <Search size={16} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search actions..."
              placeholderTextColor="#64748b"
              className="flex-1 text-xs text-white p-0 h-6"
              style={{ outlineStyle: 'none' } as any}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                <X size={16} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 110 }}>
          {/* Connection Notice */}
          <GlassCard className="mb-6 flex-row items-center gap-4">
            {isConnected ? (
              <>
                <View 
                  className="p-3 rounded-full"
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderColor: 'rgba(16, 185, 129, 0.2)',
                    borderWidth: 1,
                  }}
                >
                  <CheckCircle size={20} color="#10b981" />
                </View>
                <View className="flex-1 flex-col">
                  <Text className="text-white text-sm font-semibold">Host PC Connected</Text>
                  <Text className="text-slate-400 text-xs font-light mt-0.5 leading-normal">
                    Connected and ready to execute actions.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View 
                  className="p-3 rounded-full"
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderColor: 'rgba(245, 158, 11, 0.2)',
                    borderWidth: 1,
                  }}
                >
                  <ShieldAlert size={20} color="#f59e0b" />
                </View>
                <View className="flex-1 flex-col">
                  <Text className="text-white text-sm font-semibold">No Host PC Active</Text>
                  <Text className="text-slate-400 text-xs font-light mt-0.5 leading-normal">
                    Open Settings or Pair to connect with your PC.
                  </Text>
                </View>
              </>
            )}
          </GlassCard>

          {/* File Transfer Quick Access */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Transfers')}
            className="mb-6"
          >
            <GlassCard className="flex-row items-center justify-between p-4" style={{ borderColor: isConnected ? 'rgba(139, 92, 246, 0.25)' : 'rgba(30, 41, 59, 0.4)' }}>
              <View className="flex-row items-center gap-3 flex-1">
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: isConnected ? 'rgba(139, 92, 246, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: isConnected ? 'rgba(139, 92, 246, 0.25)' : 'rgba(30, 41, 59, 0.4)',
                  }}
                >
                  <ArrowLeftRight size={16} color={isConnected ? '#a78bfa' : '#64748b'} />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-xs font-bold">File Sharing & Transfers</Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">
                    {isConnected ? 'Send and receive files with your host PC' : 'Connect to Host PC to transfer files'}
                  </Text>
                </View>
              </View>
              <ChevronRight size={14} color="#64748b" />
            </GlassCard>
          </TouchableOpacity>

          {/* Active Page Dashboard */}
          {pages.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No Pages Configured"
              description="No dashboard pages exist yet. Create a layout on the desktop builder to sync it here."
              primaryAction={{
                label: "Sync Status",
                onClick: () => {
                  if (isConnected) {
                    toast.success("Connected to host. Layout will auto-sync on change.");
                  } else {
                    toast.warn("Offline. Ensure the desktop server is running and paired.");
                  }
                }
              }}
              secondaryAction={{
                label: "Layout Help",
                onClick: () => toast.success("Create pages and categories in the desktop app, and they will immediately appear on your mobile screen.")
              }}
            />
          ) : searchQuery.trim().length > 0 ? (
            groupedSearchResults.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No Actions Found"
                description={`We couldn't find any actions matching "${searchQuery}".`}
                primaryAction={{
                  label: "Clear Search",
                  onClick: () => setSearchQuery('')
                }}
                secondaryAction={{
                  label: "Search Tips",
                  onClick: () => toast.success("You can search by action name, action type, page name, or category name.")
                }}
              />
            ) : (
              <View className="space-y-6">
                {groupedSearchResults.map((group) => (
                  <View key={group.pageId} className="mb-6">
                    <SectionHeader
                      title={group.pageName}
                      subtitle="Matching actions in this page"
                    />
                    <View className="flex-row flex-wrap gap-y-4 gap-x-[3.5%] justify-start">
                      {group.actions.map((action) => {
                        const iconInfo = getIconInfo(action.icon);
                        return (
                          <View key={action.id} className="w-[31%]">
                            {iconInfo.base64 ? (
                              <ActionButton
                                name={action.name}
                                type={action.actionType}
                                icon={({ size, color: _c }: any) => (
                                  <Image source={{ uri: iconInfo.base64 }} style={{ width: size || 16, height: size || 16 }} resizeMode="contain" />
                                )}
                                color={iconInfo.color}
                                onPress={() => { haptics.triggerLight(); websocketManager.executeAction(action.id); }}
                                disabled={!isConnected}
                              />
                            ) : (
                              <ActionButton
                                name={action.name}
                                type={action.actionType}
                                icon={iconInfo.Component!}
                                color={iconInfo.color}
                                onPress={() => { haptics.triggerLight(); websocketManager.executeAction(action.id); }}
                                disabled={!isConnected}
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )
          ) : activePage ? (
            <View className="space-y-6">
              {activePage.categories && activePage.categories.length > 0 ? (
                activePage.categories
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((cat) => {
                    const categoryActions = actions
                      .filter((a) => a.categoryId === cat.id)
                      .sort((a, b) => a.orderIndex - b.orderIndex);

                    return (
                      <View key={cat.id} className="mb-4">
                        <SectionHeader
                          title={cat.name}
                          subtitle={isConnected ? "Tap to execute action" : "Disabled until connected"}
                        />
                        {categoryActions.length === 0 ? (
                          <Text className="text-slate-600 text-xs italic pl-1 mb-2">
                            No actions configured in this category
                          </Text>
                        ) : (
                          <View className="flex-row flex-wrap gap-y-4 gap-x-[3.5%] justify-start">
                            {categoryActions.map((action) => {
                              const iconInfo = getIconInfo(action.icon);
                              return (
                                <View key={action.id} className="w-[31%]">
                                  {iconInfo.base64 ? (
                                    <ActionButton
                                      name={action.name}
                                      type={action.actionType}
                                      icon={({ size, color: _c }: any) => (
                                        <Image source={{ uri: iconInfo.base64 }} style={{ width: size || 16, height: size || 16 }} resizeMode="contain" />
                                      )}
                                      color={iconInfo.color}
                                      onPress={() => { haptics.triggerLight(); websocketManager.executeAction(action.id); }}
                                      disabled={!isConnected}
                                    />
                                  ) : (
                                    <ActionButton
                                      name={action.name}
                                      type={action.actionType}
                                      icon={iconInfo.Component!}
                                      color={iconInfo.color}
                                      onPress={() => { haptics.triggerLight(); websocketManager.executeAction(action.id); }}
                                      disabled={!isConnected}
                                    />
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })
              ) : (
                <EmptyState
                  icon={Layers}
                  title="Empty Page"
                  description="This page does not contain any categories of actions yet. Add columns on your desktop dashboard."
                  primaryAction={{
                    label: "Check Sync",
                    onClick: () => toast.success("Connected and listening for updates from Desktop.")
                  }}
                  secondaryAction={{
                    label: "Layout Help",
                    onClick: () => toast.success("Dashboard layouts must be built on the Desktop host using the designer.")
                  }}
                />
              )}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}
