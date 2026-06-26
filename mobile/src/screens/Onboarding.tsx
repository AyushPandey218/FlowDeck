import React, { useState, useEffect } from 'react';
import { 
  View, Text, ScrollView, TouchableOpacity, TextInput, 
  ActivityIndicator, StyleSheet, Dimensions, useWindowDimensions, Image 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { 
  Sparkles, Laptop, Smartphone, Shield, Check, Info, 
  ChevronRight, ArrowRight, Camera, HelpCircle, Activity, ShieldAlert
} from 'lucide-react-native';
import { useWebSocketStore } from '../services/websocket/websocketStore';
import { websocketManager } from '../services/websocket/WebSocketManager';
import GlassCard from '../components/GlassCard';
import { useToast } from '../components/ToastSystem';
import CameraScannerOverlay from '../components/CameraScannerOverlay';

export default function Onboarding({ navigation }: any) {
  const toast = useToast();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [currentStep, setCurrentStep] = useState(0);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  
  // Pairing states
  const [nickname, setNickname] = useState('');

  const [scanned, setScanned] = useState(false);
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'pairing' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const { 
    deviceNickname, setDeviceNickname, setConnectionConfig, 
    connectionStatus, lastError, setOnboardingCompleted 
  } = useWebSocketStore();

  //Prefill nickname
  useEffect(() => {
    setNickname(deviceNickname);
  }, [deviceNickname]);

  // Monitor connection for pairing success
  useEffect(() => {
    if (connectionStatus === 'connected' && currentStep === 2) {
      setPairingStatus('success');
      toast.success("Successfully paired with Host PC!");
      // Automatically advance to permissions screen after a brief delay
      const t = setTimeout(() => {
        setCurrentStep(3);
      }, 1000);
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

      if (nickname.trim()) {
        setDeviceNickname(nickname.trim());
      }

      setPairingStatus('pairing');
      setErrorMessage('');
      setConnectionConfig(data.host, Number(data.port));
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



  const handleSkip = () => {
    setOnboardingCompleted(true);
    toast.success("Onboarding skipped!");
    navigation.replace("MainTabs");
  };

  const handleFinish = () => {
    setOnboardingCompleted(true);
    toast.success("Welcome to Flow Deck!");
    navigation.replace("MainTabs");
  };

  const handleNext = () => {
    if (currentStep === 3) {
      // Advance to Success screen
      setCurrentStep(4);
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  // Steps Rendering
  const renderStep0Welcome = () => (
    <View className="flex-col items-center justify-center py-6 gap-4">
      <View 
        className="mb-2"
        style={{
          shadowColor: '#8b5cf6',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.35,
          shadowRadius: 20,
          elevation: 10,
        }}
      >
        <Image 
          source={require('../../assets/icon.png')} 
          style={{ width: 88, height: 88, borderRadius: 22 }} 
          resizeMode="contain" 
        />
      </View>
      <Text className="text-white text-2xl font-black text-center tracking-tight">Welcome to Flow Deck</Text>
      <Text className="text-slate-400 text-sm font-light leading-relaxed text-center px-4">
        Your ultimate companion controller. Manage actions, trigger shortcuts, monitor system stats, and share files or clipboards directly from your pocket.
      </Text>
    </View>
  );

  const renderStep1Features = () => (
    <View className="flex-col py-2 gap-4">
      <Text className="text-white text-lg font-bold text-center tracking-tight mb-2">Explore the Possibilities</Text>
      <View className="flex-col gap-3">
        {[
          { icon: Sparkles, title: "Custom Triggers", desc: "Execute application launches, mute audio, or lock your host PC instantly." },
          { icon: Activity, title: "Telemetry Monitor", desc: "View live hardware metrics like CPU usage, RAM, Disk, and link latency." },
          { icon: Shield, title: "Clipboard Sync", desc: "Copy text on your host PC and paste it immediately on your phone (and vice versa)." },
          { icon: Smartphone, title: "File Transfers", desc: "Share photos, documents, and media locally at maximum LAN speed." },
        ].map((item, i) => (
          <GlassCard key={i} className="flex-row items-center gap-4 p-3.5">
            <View className="p-2 bg-violet-600/10 border border-violet-500/25 rounded-xl">
              <item.icon size={16} color="#c084fc" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-xs font-bold">{item.title}</Text>
              <Text className="text-slate-450 text-[10px] font-light mt-0.5 leading-normal">{item.desc}</Text>
            </View>
          </GlassCard>
        ))}
      </View>
    </View>
  );

  const renderStep2Pair = () => {
    const hasPermission = cameraPermission?.granted;

    return (
      <View className="flex-col py-2 gap-4">
        <Text className="text-white text-lg font-bold text-center tracking-tight mb-1">
          Link with Desktop App
        </Text>
        <Text className="text-slate-400 text-[11px] font-light text-center px-4 leading-normal mb-1">
          Open the Flow Deck Editor on your PC and scan the QR code to pair securely.
        </Text>

        {/* Nickname Input */}
        <View className="flex-col gap-1.5">
          <Text className="text-slate-350 text-[9px] font-bold uppercase tracking-wider">Device Nickname</Text>
          <GlassCard 
            className="flex-row items-center gap-3 py-2.5 px-4 border-slate-800/40"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.85)' }}
          >
            <Sparkles size={14} color="#c084fc" />
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="Enter custom nickname for this phone..."
              placeholderTextColor="#64748b"
              className="flex-1 text-white text-xs font-semibold"
            />
          </GlassCard>
        </View>

        {hasPermission ? (
          <>
            {/* Scanner Center Spacer to keep the cutout area clear */}
            <View style={{ height: 260 }} />

            {/* Pairing Status Overlay */}
            {pairingStatus === 'pairing' && (
              <GlassCard className="items-center py-3.5 gap-2 bg-violet-950/20 border-violet-800/40">
                <ActivityIndicator size="small" color="#c084fc" />
                <Text className="text-violet-300 text-xs font-semibold">Connecting to Host PC...</Text>
              </GlassCard>
            )}

            {pairingStatus === 'failed' && (
              <GlassCard className="flex-row items-center gap-3 py-3 bg-rose-950/20 border-rose-800/40">
                <ShieldAlert size={15} color="#f43f5e" />
                <View className="flex-1">
                  <Text className="text-rose-455 text-xs font-bold">Pairing Failed</Text>
                  <Text className="text-rose-350 text-[10px] font-light mt-0.5 leading-normal">{errorMessage}</Text>
                </View>
              </GlassCard>
            )}
          </>
        ) : (
          <GlassCard className="items-center py-6 gap-3 bg-slate-900/40 border-slate-850/40 border-dashed">
            <Camera size={24} color="#a78bfa" />
            <Text className="text-slate-300 text-xs text-center font-medium leading-relaxed px-4">
              Camera access is required to pair via QR code scanner.
            </Text>
            <TouchableOpacity
              onPress={requestCameraPermission}
              className="bg-violet-600 active:bg-violet-750 px-4 py-2 rounded-xl mt-1"
            >
              <Text className="text-white text-xs font-bold">Grant Permission</Text>
            </TouchableOpacity>
          </GlassCard>
        )}


      </View>
    );
  };

  const renderStep3Permissions = () => (
    <View className="flex-col py-4 gap-4">
      <Text className="text-white text-lg font-bold text-center tracking-tight mb-1">App Permissions</Text>
      <Text className="text-slate-400 text-xs font-light text-center px-4 leading-normal mb-2">
        We require certain permissions to keep stats, sync your clipboard, and link files.
      </Text>
      <View className="flex-col gap-3">
        <GlassCard className="flex-row items-center gap-4 p-3.5">
          <View className="p-2 bg-emerald-950/10 border border-emerald-900/20 rounded-xl">
            <Camera size={16} color="#34d399" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-xs font-bold">Camera Authorization</Text>
            <Text className="text-slate-400 text-[9px] leading-normal font-light mt-0.5">
              {cameraPermission?.granted ? "Granted ✨ Scanner ready" : "Required to scan pairing QR codes."}
            </Text>
          </View>
          {!cameraPermission?.granted && (
            <TouchableOpacity 
              onPress={requestCameraPermission}
              className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
            >
              <Text className="text-violet-300 text-[9px] font-bold">Grant</Text>
            </TouchableOpacity>
          )}
        </GlassCard>

        <GlassCard className="flex-row items-center gap-4 p-3.5">
          <View className="p-2 bg-sky-950/10 border border-sky-900/20 rounded-xl">
            <Shield size={16} color="#38bdf8" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-xs font-bold">Universal Clipboard Sync</Text>
            <Text className="text-slate-400 text-[9px] leading-normal font-light mt-0.5">
              Allows the app to read and write clipboard text data when syncing features are active.
            </Text>
          </View>
        </GlassCard>
      </View>
    </View>
  );

  const renderStep4Success = () => (
    <View className="flex-col items-center justify-center py-8 gap-4">
      <View className="p-5 rounded-full mb-2 bg-emerald-950/20 border border-emerald-900/30">
        <Check size={56} color="#10b981" />
      </View>
      <Text className="text-white text-2xl font-black text-center tracking-tight">Configuration Complete!</Text>
      <Text className="text-slate-400 text-sm font-light leading-relaxed text-center px-4">
        Your companion device is now configured. Next, we will cover some quick tips to help you get the most out of Flow Deck.
      </Text>
    </View>
  );

  const renderStep5Tips = () => (
    <View className="flex-col py-2 gap-4">
      <Text className="text-white text-lg font-bold text-center tracking-tight mb-2">💡 Quick Tips</Text>
      <View className="flex-col gap-3">
        {[
          { title: "Manage actions from PC", text: "Create pages, categories, and actions directly in the Desktop host editor. They sync to your phone automatically." },
          { title: "Real-time Telemetry Status", text: "Use the Monitor screen to view stats. Hardware telemetry collectors pause when the app is minimized to save battery." },
          { title: "Instant File Sharing", text: "Tap the quick-access 'Transfers' card on the Home screen to upload files. Integrity is verified automatically using SHA-256." }
        ].map((tip, i) => (
          <GlassCard key={i} className="flex-col gap-1 p-3">
            <Text className="text-violet-300 font-bold text-xs">{tip.title}</Text>
            <Text className="text-slate-400 text-[10px] font-light leading-normal mt-0.5">{tip.text}</Text>
          </GlassCard>
        ))}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-950">
      {currentStep === 2 && cameraPermission?.granted && (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={scanned || pairingStatus === 'pairing' ? undefined : (result) => handleBarCodeScanned(result.data)}
          />
          <CameraScannerOverlay />
        </>
      )}

      {/* Header bar with Skip option */}
      <View className="flex-row justify-between items-center px-6 py-4 mt-2 z-10">
        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
          Step {currentStep + 1} of 6
        </Text>
        {currentStep < 5 && (
          <TouchableOpacity onPress={handleSkip} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-900">
            <Text className="text-slate-400 text-[10px] font-semibold">Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {currentStep === 2 && cameraPermission?.granted ? (
        /* Render custom absolute layout for scanning to prevent overlap with the center cutout */
        <View className="flex-1 relative">
          {/* Top info and nickname container */}
          <View className="absolute top-[20px] left-6 right-6 gap-3 z-10">
            <View className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
              <Text className="text-white text-base font-bold text-center tracking-tight mb-1">
                Link with Desktop App
              </Text>
              <Text className="text-slate-400 text-[10px] font-light text-center px-2 leading-normal mb-3">
                Open the Flow Deck Editor on your PC and scan the QR code to pair securely.
              </Text>

              {/* Nickname Input */}
              <View className="flex-col gap-1.5">
                <Text className="text-slate-450 text-[9px] font-bold uppercase tracking-wider">Device Nickname</Text>
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
          </View>

          {/* Bottom status container */}
          {pairingStatus !== 'idle' && (
            <View className="absolute bottom-[90px] left-6 right-6 z-10">
              {pairingStatus === 'pairing' && (
                <View className="flex-row items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-violet-700 border border-violet-650 shadow-lg">
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text className="text-white text-xs font-bold">Connecting to Host PC...</Text>
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

              {pairingStatus === 'success' && (
                <View className="flex-row items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-700 border border-emerald-650 shadow-lg">
                  <Check size={16} color="#ffffff" />
                  <Text className="text-white text-xs font-bold">Successfully Paired!</Text>
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        /* Main body scroll container for all other steps */
        <ScrollView 
          className="flex-1 px-6" 
          contentContainerStyle={{ 
            flexGrow: 1, 
            justifyContent: 'center',
            paddingBottom: isLandscape ? 40 : 100 
          }}
        >
          {currentStep === 0 && renderStep0Welcome()}
          {currentStep === 1 && renderStep1Features()}
          {currentStep === 2 && !cameraPermission?.granted && renderStep2Pair()}
          {currentStep === 3 && renderStep3Permissions()}
          {currentStep === 4 && renderStep4Success()}
          {currentStep === 5 && renderStep5Tips()}
        </ScrollView>
      )}

      {/* Footer controls container */}
      <View 
        className="absolute bottom-0 left-0 right-0 px-6 py-4 flex-row items-center justify-between border-t border-slate-900/60"
        style={{ backgroundColor: 'rgba(2, 6, 23, 0.85)' }}
      >
        {/* Back button */}
        {currentStep > 0 ? (
          <TouchableOpacity 
            onPress={handleBack} 
            className="px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900/35"
          >
            <Text className="text-slate-300 text-xs font-semibold">Back</Text>
          </TouchableOpacity>
        ) : (
          <View className="w-16" />
        )}

        {/* Progress Indicator dots */}
        <View className="flex-row gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <View
              key={idx}
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: currentStep === idx ? '#a78bfa' : '#334155',
              }}
            />
          ))}
        </View>

        {/* Forward button */}
        {currentStep === 5 ? (
          <TouchableOpacity 
            onPress={handleFinish} 
            className="flex-row items-center gap-1.5 bg-violet-600 px-5 py-2.5 rounded-xl"
          >
            <Text className="text-white text-xs font-bold">Finish</Text>
            <Check size={14} color="#ffffff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            onPress={handleNext} 
            className="flex-row items-center gap-1 bg-violet-600 px-5 py-2.5 rounded-xl"
          >
            <Text className="text-white text-xs font-bold">Next</Text>
            <ChevronRight size={14} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
