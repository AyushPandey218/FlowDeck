import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, Camera, ShieldAlert, Sparkles, Check } from 'lucide-react-native';
import GlassCard from '../components/GlassCard';
import { useWebSocketStore } from '../services/websocket/websocketStore';
import { websocketManager } from '../services/websocket/WebSocketManager';
import CameraScannerOverlay from '../components/CameraScannerOverlay';

export default function PairDevice({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [nickname, setNickname] = useState('');
  const [scanned, setScanned] = useState(false);
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'pairing' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');



  const { deviceNickname, setDeviceNickname, setConnectionConfig, connectionStatus, lastError } = useWebSocketStore();

  // Load persisted nickname initially
  useEffect(() => {
    setNickname(deviceNickname);
  }, [deviceNickname]);

  // Monitor connection status to update local pairing feedback
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setPairingStatus('success');
      const t = setTimeout(() => {
        navigation.navigate('MainTabs', { screen: 'HomeTab' });
      }, 1500);
      return () => clearTimeout(t);
    } else if (connectionStatus === 'disconnected' && lastError !== 'None' && pairingStatus === 'pairing') {
      setPairingStatus('failed');
      setErrorMessage(lastError);
      setScanned(false);
    }
  }, [connectionStatus, lastError, pairingStatus]);

  const handlePairingPayload = (payloadString: string) => {
    try {
      const data = JSON.parse(payloadString);
      if (!data.host || !data.port || !data.pairingToken) {
        throw new Error('Missing host, port, or token in QR payload');
      }

      // Save custom nickname
      if (nickname.trim()) {
        setDeviceNickname(nickname.trim());
      }

      setPairingStatus('pairing');
      setErrorMessage('');

      // Set target connection config
      setConnectionConfig(data.host, Number(data.port));

      // Trigger socket connection with pairing token
      websocketManager.connect(data.pairingToken);
    } catch (err: any) {
      setPairingStatus('failed');
      setErrorMessage(err.message || 'Invalid QR payload format');
      setScanned(false);
    }
  };

  const handleBarCodeScanned = (data: string) => {
    if (scanned || pairingStatus === 'pairing') return;
    setScanned(true);
    handlePairingPayload(data);
  };



  if (!permission) {
    // Camera permissions are still loading
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-slate-950">
        <View 
          className="flex-row items-center px-4 py-3"
          style={{
            paddingTop: 50,
            backgroundColor: 'rgba(2, 6, 23, 0.4)',
            borderBottomColor: 'rgba(15, 23, 42, 0.2)',
            borderBottomWidth: 1,
          }}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 mr-2 bg-slate-900/50 rounded-full border border-slate-800">
            <ArrowLeft size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-white">Pair New Device</Text>
        </View>

        <View className="flex-1 justify-center px-8 items-center gap-4">
          <GlassCard className="items-center justify-center py-8 px-6 gap-4 w-full">
            <View className="p-4 bg-violet-950/20 border border-violet-850 rounded-full">
              <Camera size={36} color="#c084fc" />
            </View>
            <Text className="text-white text-base font-bold text-center">Camera Access Required</Text>
            <Text className="text-slate-400 text-xs text-center font-light leading-relaxed px-4">
              To pair with your computer using a QR code, Flow Deck needs permission to use your camera.
            </Text>
            <TouchableOpacity
              onPress={requestPermission}
              className="bg-violet-600 active:bg-violet-750 px-6 py-3 rounded-xl mt-2 w-full items-center"
            >
              <Text className="text-white text-xs font-bold">Grant Camera Permission</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-950">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned || pairingStatus === 'pairing' ? undefined : (result) => handleBarCodeScanned(result.data)}
      />
      
      <CameraScannerOverlay />

      {/* Floating Header */}
      <View 
        className="flex-row items-center px-4 py-3 absolute top-0 left-0 right-0 z-10"
        style={{
          paddingTop: 50,
          backgroundColor: 'rgba(2, 6, 23, 0.45)',
          borderBottomColor: 'rgba(15, 23, 42, 0.2)',
          borderBottomWidth: 1,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 mr-2 bg-slate-900/50 rounded-full border border-slate-800">
          <ArrowLeft size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-white">Pair New Device</Text>
      </View>

      {/* Device Nickname Input (Absolute Top) */}
      <View className="absolute top-[110px] left-6 right-6 z-10">
        <View className="flex-col gap-1.5">
          <Text className="text-slate-350 text-[10px] font-bold uppercase tracking-wider">Device Nickname</Text>
          <View 
            className="flex-row items-center gap-3 py-2.5 px-4 rounded-xl border border-slate-700/50 bg-slate-950/90"
          >
            <Sparkles size={14} color="#c084fc" />
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="Enter custom nickname for this phone..."
              placeholderTextColor="#64748b"
              className="flex-1 text-white text-xs font-semibold"
            />
          </View>
        </View>
      </View>

      {/* Pairing Status Overlay (Absolute Bottom) */}
      {pairingStatus !== 'idle' && (
        <View className="absolute bottom-[40px] left-6 right-6 z-10">
          {pairingStatus === 'pairing' && (
            <View className="flex-row items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-violet-700 border border-violet-650 shadow-lg">
              <ActivityIndicator size="small" color="#ffffff" />
              <Text className="text-white text-xs font-bold">Connecting to Host PC...</Text>
            </View>
          )}

          {pairingStatus === 'success' && (
            <View className="flex-row items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-700 border border-emerald-650 shadow-lg">
              <Check size={16} color="#ffffff" />
              <Text className="text-white text-xs font-bold">Successfully Paired!</Text>
            </View>
          )}

          {pairingStatus === 'failed' && (
            <View className="flex-row items-center gap-3 py-3 px-4 rounded-xl bg-rose-700 border border-rose-650 shadow-lg">
              <ShieldAlert size={16} color="#ffffff" />
              <View className="flex-1">
                <Text className="text-white text-xs font-bold">Pairing Failed</Text>
                <Text className="text-rose-100 text-[10px] font-medium mt-0.5 leading-normal">{errorMessage}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
