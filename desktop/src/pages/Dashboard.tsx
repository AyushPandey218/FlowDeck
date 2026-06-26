import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Smartphone, Radio, Activity, QrCode, Trash2, Clock, X, Check, Copy, ShieldAlert, CheckCircle2, ChevronRight, Clipboard, ArrowLeftRight } from 'lucide-react';
import { THEME } from '../config/theme';
import { QRCodeSVG } from 'qrcode.react';
import { useUIStore } from '../store/uiStore';
import { useToast } from '../components/ToastSystem';
import EmptyState from '../components/EmptyState';



interface ProtocolStats {
  connectedClients: number;
  messagesSent: number;
  messagesReceived: number;
  lastPing: string;
  lastPong: string;
  serverStartedAt: number;
  uptimeSeconds: number;
}

interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  deviceNickname: string;
  pairedAt: number;
  lastActive: number;
  isBlocked: boolean;
}

export default function Dashboard() {
  const { setCurrentPage } = useUIStore();
  const toast = useToast();

  const [stats, setStats] = useState<ProtocolStats>({
    connectedClients: 0,
    messagesSent: 0,
    messagesReceived: 0,
    lastPing: 'N/A',
    lastPong: 'N/A',
    serverStartedAt: 0,
    uptimeSeconds: 0,
  });

  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingPayload, setPairingPayload] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [copied, setCopied] = useState(false);
  
  const [isFirstRun, setIsFirstRun] = useState(false);
  
  const [onboardingVersion, setOnboardingVersion] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [pagesCount, setPagesCount] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isSeedingPages, setIsSeedingPages] = useState(false);

  useEffect(() => {
    invoke<string>('get_setting', { key: 'is_first_run' })
      .then((val) => setIsFirstRun(val === 'true'))
      .catch((e) => console.error(e));

    invoke<string>('get_setting', { key: 'onboarding_version' })
      .then((val) => {
        const isAppOnboarding = val === '0' || !val;
        setOnboardingVersion(isAppOnboarding ? '0' : '1');
        useUIStore.getState().setIsOnboarding(isAppOnboarding);
      })
      .catch((e) => console.error(e));

    loadLayout();
  }, []);

  const loadLayout = () => {
    invoke<any[]>('get_layout')
      .then((data) => {
        setPagesCount(data.length);
      })
      .catch((err) => console.error(err));
  };

  const handleDismissFirstRun = () => {
    setIsFirstRun(false);
    invoke('set_setting', { key: 'is_first_run', value: 'false' })
      .catch((err) => console.error(err));
  };

  const handleCreateWorkPage = async () => {
    setIsSeedingPages(true);
    try {
      await invoke('add_page', { name: 'Work' });
      const layout = await invoke<any[]>('get_layout');
      const workPage = layout.find((p: any) => p.name === 'Work');
      if (workPage) {
        await invoke('add_category', { pageId: workPage.id, name: 'Applications' });
        const updatedLayout = await invoke<any[]>('get_layout');
        const workPageUpdated = updatedLayout.find((p: any) => p.id === workPage.id);
        if (workPageUpdated && workPageUpdated.categories && workPageUpdated.categories.length > 0) {
          const categoryId = workPageUpdated.categories[0].id;
          await invoke('add_action', {
            args: {
              categoryId,
              name: 'Mute Audio',
              actionType: 'TOGGLE_MUTE',
              payload: null,
              icon: '🔇'
            }
          });
        }
      }
      loadLayout();
      toast.success('Default page, category, and action created!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to create default layout.');
    } finally {
      setIsSeedingPages(false);
    }
  };

  const handleFinishOnboarding = () => {
    invoke('set_setting', { key: 'onboarding_version', value: '1' })
      .then(() => {
        setOnboardingVersion('1');
        useUIStore.getState().setIsOnboarding(false);
        toast.success('Onboarding complete!');
        setCurrentPage('actions');
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to save onboarding settings.');
      });
  };

  const handleSkipOnboarding = () => {
    invoke('set_setting', { key: 'onboarding_version', value: '1' })
      .then(() => {
        setOnboardingVersion('1');
        useUIStore.getState().setIsOnboarding(false);
        toast.success('Setup skipped.');
        setCurrentPage('actions');
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to save onboarding settings.');
      });
  };

  useEffect(() => {
    if (onboardingVersion === '0' && currentStep === 2 && !pairingPayload) {
      invoke<any>('generate_pairing_payload')
        .then((data) => {
          setPairingPayload(data);
          setTimeLeft(300);
        })
        .catch((err) => {
          console.error('Failed to generate pairing payload for onboarding:', err);
        });
    }
  }, [onboardingVersion, currentStep, pairingPayload]);

  const loadTrustedDevices = () => {
    invoke<TrustedDevice[]>('get_trusted_devices')
      .then((data) => {
        setTrustedDevices(data);
      })
      .catch((err) => {
        console.error('Failed to retrieve trusted devices:', err);
      });
  };

  const handleStartPairing = () => {
    invoke<any>('generate_pairing_payload')
      .then((data) => {
        setPairingPayload(data);
        setTimeLeft(300);
        setShowPairingModal(true);
      })
      .catch((err) => {
        console.error('Failed to generate pairing payload:', err);
      });
  };

  const handleRemoveDevice = (deviceId: string) => {
    invoke('remove_trusted_device', { deviceId })
      .then(() => {
        loadTrustedDevices();
      })
      .catch((err) => {
        console.error('Failed to remove trusted device:', err);
      });
  };

  useEffect(() => {
    // Get initial protocol stats
    invoke<ProtocolStats>('get_protocol_stats')
      .then((data) => {
        setStats(data);
      })
      .catch((err) => {
        console.error('Failed to retrieve initial protocol stats:', err);
      });

    // Load initial trusted devices
    loadTrustedDevices();

    // Listen for real-time stats updates from the ConnectionManager
    const unlistenPromise = listen<ProtocolStats>('protocol-stats-update', (event) => {
      setStats(event.payload);
      // Reload trusted devices list when any socket states update (reconnections or pairing success)
      loadTrustedDevices();
      
      // Close the pairing modal automatically when a client connects successfully
      if (event.payload.connectedClients > 0) {
        setShowPairingModal(false);
      }
    });

    const telemetryUnlisten = listen<any>('system-stats-update', (event) => {
      if (event.payload && typeof event.payload.latencyMs === 'number') {
        setLatencyMs(event.payload.latencyMs);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      telemetryUnlisten.then((unlisten) => unlisten());
    };
  }, []);

  // Tick uptime locally every second to avoid polling the backend
  useEffect(() => {
    const timer = setInterval(() => {
      setStats((prev) => {
        if (prev.serverStartedAt > 0) {
          const now = Math.floor(Date.now() / 1000);
          const currentUptime = now - prev.serverStartedAt;
          return {
            ...prev,
            uptimeSeconds: currentUptime > 0 ? currentUptime : 0,
          };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown timer for pairing payload expiry
  useEffect(() => {
    const isPairingActive = showPairingModal || (onboardingVersion === '0' && currentStep === 2);
    if (!isPairingActive || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPairingPayload(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showPairingModal, onboardingVersion, currentStep, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyPayload = () => {
    if (pairingPayload) {
      navigator.clipboard.writeText(JSON.stringify(pairingPayload));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className={THEME.title}>Dashboard</h1>
          <p className={THEME.subtitle}>Welcome to Flow Deck Host Client</p>
        </div>
      </div>

      {/* Onboarding Welcome Card */}
      {isFirstRun && (
        <div className={`${THEME.panel} glow-panel border border-violet-500/20 bg-gradient-to-r from-violet-900/10 via-indigo-900/5 to-slate-900/20 p-6 flex justify-between items-start gap-4 relative animate-in fade-in slide-in-from-top-4 duration-300`}>
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
              Welcome to Flow Deck
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              To get started, follow these simple onboarding steps:
            </p>
            <ol className="list-decimal pl-4 space-y-1.5 text-xs text-slate-300">
              <li>Pair your phone by clicking the <span className="font-semibold text-violet-400">Pair New Device</span> button below.</li>
              <li>Create actions (like opening apps or volume controls) in the <span className="font-semibold text-violet-400">Actions</span> tab.</li>
              <li>Test connectivity and layout sync live with your companion device!</li>
            </ol>
          </div>
          <button
            onClick={handleDismissFirstRun}
            className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Dismiss Welcome Guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Connection Card */}
        <div className={THEME.panel}>
          <div className="flex justify-between items-start mb-4">
            {stats.connectedClients > 0 ? (
              <span className={THEME.badgeGreen}>Connected</span>
            ) : (
              <span className={THEME.badgeYellow}>Waiting</span>
            )}
            <Radio className={`w-5 h-5 ${stats.connectedClients > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <h3 className={THEME.cardTitle}>Connection Status</h3>
          <p className="text-xl font-bold tracking-tight text-white mt-1">
            {stats.connectedClients > 0 ? (
              trustedDevices.find(d => d.lastActive > 0)?.deviceNickname || 'Flow Companion'
            ) : (
              'Ready to Connect'
            )}
          </p>
          <p className={THEME.textMeta + " mt-2"}>
            {stats.connectedClients > 0 ? 'Latency: ' + (latencyMs !== null ? `${latencyMs}ms` : 'active') : 'Open app on your phone'}
          </p>
        </div>

        {/* Clipboard Card */}
        <div className={THEME.panel}>
          <div className="flex justify-between items-start mb-4">
            <span className={THEME.badgeBlue}>Active</span>
            <Clipboard className="text-blue-400 w-5 h-5" />
          </div>
          <h3 className={THEME.cardTitle}>Clipboard Sync</h3>
          <p className="text-xl font-bold tracking-tight text-white mt-1">
            Enabled
          </p>
          <p className={THEME.textMeta + " mt-2"}>
            Monitoring background changes
          </p>
        </div>

        {/* Transfers Card */}
        <div className={THEME.panel}>
          <div className="flex justify-between items-start mb-4">
            <span className={THEME.badgePurple}>Ready</span>
            <ArrowLeftRight className="text-violet-400 w-5 h-5" />
          </div>
          <h3 className={THEME.cardTitle}>File Transfers</h3>
          <p className="text-xl font-bold tracking-tight text-white mt-1">
            0 Files Today
          </p>
          <p className={THEME.textMeta + " mt-2"}>
            Drop files to share instantly
          </p>
        </div>
      </div>

      {/* Paired Devices Management */}
      <div className={`${THEME.panel} glow-panel mt-6`}>
        <div className="flex justify-between items-center mb-5 border-b border-slate-900/50 pb-3">
          <div className="flex items-center gap-3">
            <Smartphone className="text-violet-400 w-6 h-6" />
            <h2 className="text-lg font-semibold text-white">Trusted Companion Devices</h2>
          </div>
          <button
            onClick={handleStartPairing}
            className={`${THEME.btnPrimary} flex items-center gap-2`}
          >
            <QrCode className="w-4 h-4" />
            <span>Pair New Device</span>
          </button>
        </div>

        {trustedDevices.length === 0 ? (
          <EmptyState
            title="No Companion Devices Paired"
            description="To start triggering actions or streaming system diagnostics, you need to pair your mobile client."
            primaryAction={{
              label: "Pair New Device",
              onClick: handleStartPairing
            }}
            illustration={Smartphone}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Nickname</th>
                  <th className="py-3 px-4">Device Name</th>
                  <th className="py-3 px-4">Paired At</th>
                  <th className="py-3 px-4">Last Active</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {trustedDevices.map((device) => {
                  return (
                    <tr key={device.deviceId} className="hover:bg-slate-900/20 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white">{device.deviceNickname}</td>
                      <td className="py-3.5 px-4 text-slate-350">{device.deviceName}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {device.pairedAt > 0 ? new Date(device.pairedAt * 1000).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-450">
                        {device.lastActive > 0 ? new Date(device.lastActive * 1000).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleRemoveDevice(device.deviceId)}
                          className="bg-rose-950/20 hover:bg-rose-600 active:scale-[0.98] text-rose-400 hover:text-white font-medium text-xs rounded-lg px-3 py-1.5 border border-rose-900/30 hover:border-rose-500/30 transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pairing Modal */}
      {showPairingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900/90 border border-slate-800/80 shadow-2xl rounded-2xl max-w-md w-full p-6 relative space-y-6">
            {/* Close Button */}
            <button
              onClick={() => setShowPairingModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-white flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5 text-violet-400" />
                <span>Pair Companion Device</span>
              </h3>
              <p className="text-xs text-slate-400">
                Scan this QR code using the Flow Deck mobile companion app to pair.
              </p>
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center bg-slate-950/50 p-6 rounded-2xl border border-slate-800/40">
              {timeLeft > 0 && pairingPayload ? (
                <>
                  <div className="bg-white p-3.5 rounded-2xl shadow-inner mb-4">
                    <QRCodeSVG
                      value={JSON.stringify(pairingPayload)}
                      size={200}
                      level="M"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <Clock className={`w-3.5 h-3.5 ${timeLeft < 60 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                    <span className={timeLeft < 60 ? 'text-rose-405 font-medium animate-pulse' : 'text-slate-350'}>
                      Token expires in: <span className="font-mono font-semibold">{formatTime(timeLeft)}</span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <ShieldAlert className="w-12 h-12 text-rose-400 animate-bounce" />
                  <p className="text-sm font-semibold text-rose-450">Pairing Token Expired</p>
                  <p className="text-xs text-slate-400 text-center px-4">
                    Tokens expire after 5 minutes. Please generate a new pairing payload to try again.
                  </p>
                  <button
                    onClick={handleStartPairing}
                    className={THEME.btnPrimary}
                  >
                    <span>Regenerate QR Code</span>
                  </button>
                </div>
              )}
            </div>

            {/* Manual actions */}
            {pairingPayload && timeLeft > 0 && (
              <div className="space-y-3">
                <button
                  onClick={handleCopyPayload}
                  className={`${THEME.btnSecondary} w-full flex items-center justify-center gap-2`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" />
                      <span>Copy Payload JSON</span>
                    </>
                  )}
                </button>
                <p className="text-[10px] text-center text-slate-500">
                  Useful for testing in the mobile emulator via clipboard paste.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Onboarding Wizard Overlay */}
      {onboardingVersion === '0' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900/90 border border-slate-800/80 shadow-2xl rounded-2xl max-w-2xl w-full p-8 relative flex flex-col justify-between min-h-[500px] text-white">
            
            {/* Header with step indicators */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center font-bold text-xs">
                    FD
                  </div>
                  <span className="text-sm font-semibold tracking-wide text-slate-200">Flow Deck Setup Wizard</span>
                </div>
                <button
                  onClick={handleSkipOnboarding}
                  className="text-xs text-slate-400 hover:text-white transition-colors hover:underline cursor-pointer"
                >
                  Skip Setup
                </button>
              </div>

              {/* Stepper Progress */}
              <div className="flex items-center justify-between mb-8 relative">
                <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
                <div 
                  className="absolute top-4 left-0 h-0.5 bg-violet-500 -translate-y-1/2 z-0 transition-all duration-305" 
                  style={{ width: `${((currentStep - 1) / 4) * 100}%` }}
                />
                
                {[
                  { num: 1, label: 'Welcome' },
                  { num: 2, label: 'Pair Device' },
                  { num: 3, label: 'Actions' },
                  { num: 4, label: 'Connection' },
                  { num: 5, label: 'Finish' }
                ].map((step) => {
                  const isCompleted = step.num < currentStep;
                  const isActive = step.num === currentStep;
                  return (
                    <div key={step.num} className="flex flex-col items-center relative z-10">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs border-2 transition-all duration-300 ${
                        isCompleted ? 'bg-violet-600 border-violet-500 text-white' : 
                        isActive ? 'bg-slate-900 border-violet-500 text-violet-400 shadow-md shadow-violet-950/50' : 
                        'bg-slate-900 border-slate-800 text-slate-500'
                      }`}>
                        {isCompleted ? <Check className="w-4 h-4" /> : step.num}
                      </div>
                      <span className={`text-[10px] mt-2 font-medium tracking-wide transition-colors duration-300 ${
                        isActive ? 'text-violet-400 font-bold' : isCompleted ? 'text-slate-350' : 'text-slate-500'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Step Content */}
              <div className="py-4 min-h-[220px]">
                {currentStep === 1 && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <h3 className="text-xl font-bold text-white">Welcome to Flow Deck</h3>
                    <p className="text-sm text-slate-400 leading-relaxed font-light">
                      Flow Deck transforms your phone or tablet into a premium dynamic desktop controller. Run apps, toggle volume, manage your clipboard, and monitor system diagnostics in real-time.
                    </p>
                    <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/40 flex items-start gap-3">
                      <Activity className="w-5 h-5 text-violet-400 shrink-0 mt-0.5 animate-pulse" />
                      <p className="text-xs text-slate-450 leading-relaxed font-light">
                        This setup wizard will help you pair your device, configure a basic layout, and verify that everything is running perfectly.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <h3 className="text-xl font-bold text-white">Pair Your Companion Device</h3>
                    <p className="text-sm text-slate-400 leading-relaxed font-light">
                      Scan this QR code using the Flow Deck mobile companion app to pair.
                    </p>
                    
                    <div className="flex flex-col items-center justify-center p-4 bg-slate-950/40 rounded-xl border border-slate-800/40">
                      {timeLeft > 0 && pairingPayload ? (
                        <div className="flex items-center gap-6">
                          <div className="bg-white p-2 rounded-xl">
                            <QRCodeSVG value={JSON.stringify(pairingPayload)} size={120} level="M" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-slate-350">
                              <Clock className="w-4 h-4 text-violet-400" />
                              <span>Expires in: <span className="font-mono text-white font-semibold">{formatTime(timeLeft)}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${stats.connectedClients > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'}`} />
                              <span className="text-xs font-semibold">
                                {stats.connectedClients > 0 ? 'Device Paired & Connected!' : 'Waiting for scan...'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 space-y-2">
                          <p className="text-xs text-rose-405 font-semibold">Pairing payload expired.</p>
                          <button 
                            onClick={() => { setPairingPayload(null); }}
                            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-4 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            Regenerate QR Code
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <h3 className="text-xl font-bold text-white">Setup Your Actions Layout</h3>
                    <p className="text-sm text-slate-400 leading-relaxed font-light">
                      Flow Deck triggers actions on your PC from customizable buttons. To do this, we need at least one Page and one Category in your layout.
                    </p>

                    {pagesCount === 0 ? (
                      <div className="p-5 bg-slate-950/50 rounded-xl border border-dashed border-slate-800 flex flex-col items-center text-center space-y-3">
                        <p className="text-xs text-amber-300 font-semibold">Flow Deck requires at least one page.</p>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                          Would you like to seed a default layout now? This creates a "Work" page, an "Applications" category, and a sample "Mute Audio" action.
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={handleCreateWorkPage}
                            disabled={isSeedingPages}
                            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-4 py-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isSeedingPages ? 'Creating...' : 'Create Work Page'}
                          </button>
                          <button
                            onClick={() => setCurrentStep(4)}
                            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-900 border border-slate-800 transition-all cursor-pointer"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 bg-slate-950/50 rounded-xl border border-slate-800 flex items-center gap-3">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                        <div>
                          <h4 className="text-xs font-bold text-slate-100">Layout Verified</h4>
                          <p className="text-xs text-slate-450 mt-0.5 leading-normal">
                            Your database contains {pagesCount} page(s). We are ready to execute remote actions!
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <h3 className="text-xl font-bold text-white">Connection Verification</h3>
                    <p className="text-sm text-slate-400 leading-relaxed font-light">
                      Let's check the current connection state of your paired companion device using real-time telemetry metrics.
                    </p>

                    {stats.connectedClients > 0 ? (
                      <div className="p-5 bg-slate-950/60 rounded-xl border border-emerald-500/20 text-slate-350 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Connected</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                          <div>
                            <span className="text-slate-500 block">Device Name</span>
                            <span className="text-white font-medium">
                              {trustedDevices.find(d => d.lastActive > 0)?.deviceNickname || 
                               trustedDevices.find(d => d.lastActive > 0)?.deviceName || 
                               'Flow Companion'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Ping Latency</span>
                            <span className="text-violet-400 font-mono font-semibold">
                              {latencyMs !== null ? `${latencyMs} ms` : 'recent'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-3 py-8">
                        <Smartphone className="w-8 h-8 text-amber-400 animate-bounce" />
                        <p className="text-xs font-semibold text-amber-305">Waiting for Companion Device</p>
                        <p className="text-xs text-slate-450 leading-relaxed max-w-sm">
                          Please make sure the mobile app is open on your paired device. Verification will update automatically once connected.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="space-y-4 text-center py-6 animate-in fade-in duration-200">
                    <div className="w-16 h-16 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mx-auto text-violet-400 mb-2">
                      <CheckCircle2 className="w-10 h-10 animate-pulse" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">You're Ready to Flow!</h3>
                    <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed font-light">
                      Your Flow Deck installation is successfully paired, configured, and verified.
                    </p>
                    <p className="text-xs text-slate-500 leading-normal">
                      Click Finish to open the Actions page and start configuring your custom buttons.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer controls */}
            <div className="flex justify-between items-center border-t border-slate-800/60 pt-4 mt-4">
              <button
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                disabled={currentStep === 1}
                className="text-xs font-semibold text-slate-400 hover:text-white px-4 py-2 rounded-xl transition-all hover:bg-slate-900 border border-slate-800 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              >
                Back
              </button>
              
              <div className="flex gap-3">
                {currentStep < 5 ? (
                  <button
                    onClick={() => setCurrentStep((prev) => prev + 1)}
                    disabled={(currentStep === 2 && stats.connectedClients === 0) || (currentStep === 3 && pagesCount === 0)}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span>Continue</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleFinishOnboarding}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-emerald-950/20"
                  >
                    Finish Setup
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

