import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Activity, Cpu, Database, HardDrive, ArrowUpRight, ArrowDownRight, Clock, Signal } from 'lucide-react';
import { THEME } from '../config/theme';

interface SystemStats {
  telemetryVersion: number;
  cpu: number;
  ram: number;
  gpu: number | null;
  disk: number;
  networkUp: number;
  networkDown: number;
  uptime: number;
  latencyMs: number;
}

const MAX_HISTORY = 40;

const Sparkline = ({ data, color, maxVal }: { data: number[], color: string, maxVal?: number }) => {
  if (data.length < 2) return <div className="h-12 w-full flex items-end opacity-20"><div className="w-full h-px bg-slate-500 border-dashed border-t border-slate-500"></div></div>;
  
  const max = maxVal || Math.max(...data, 1);
  const min = 0;
  
  const width = 100;
  const height = 40;
  
  const points = data.map((val, i) => {
    const x = (i / (MAX_HISTORY - 1)) * width;
    const y = height - ((val - min) / (max - min)) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12 overflow-visible" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="drop-shadow-sm"
      />
      <path
        fill={`url(#gradient-${color.replace(/[^a-zA-Z0-9]/g, '')})`}
        d={`M0,${height} L${points} L${(data.length - 1) / (MAX_HISTORY - 1) * width},${height} Z`}
        className="opacity-20"
      />
      <defs>
        <linearGradient id={`gradient-${color.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default function Monitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [history, setHistory] = useState<{ cpu: number[], ram: number[], netUp: number[], netDown: number[] }>({ cpu: [], ram: [], netUp: [], netDown: [] });

  useEffect(() => {
    const unlisten = listen<SystemStats>('system-stats-update', (event) => {
      setStats(event.payload);
      setHistory(prev => {
        return {
          cpu: [...prev.cpu, event.payload.cpu].slice(-MAX_HISTORY),
          ram: [...prev.ram, event.payload.ram].slice(-MAX_HISTORY),
          netUp: [...prev.netUp, event.payload.networkUp].slice(-MAX_HISTORY),
          netDown: [...prev.netDown, event.payload.networkDown].slice(-MAX_HISTORY),
        };
      });
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (d > 0) {
      return `${d}d ${h}h ${m}m`;
    }
    if (h > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    return `${m}m ${s}s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className={THEME.title}>System Monitor</h1>
          <p className={THEME.subtitle}>Real-time system telemetry and statistics</p>
        </div>
        <span className={stats ? THEME.badgeGreen : THEME.badgeYellow}>
          {stats ? 'Telemetry Active' : 'Telemetry Idle'}
        </span>
      </div>

      {!stats ? (
        <div className={`${THEME.panel} p-8 text-center space-y-3 max-w-md mx-auto mt-12`}>
          <Activity className="w-10 h-10 text-slate-500 animate-pulse mx-auto" />
          <h3 className="text-slate-200 font-semibold">Waiting for Connection</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Lightweight telemetry collection is paused. Connect your mobile companion app to start streaming real-time PC diagnostics.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* CPU */}
            <div className={THEME.panel + " space-y-4"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-violet-400" />
                  <span className={THEME.cardTitle}>CPU Usage</span>
                </div>
                <span className="text-lg font-bold text-white font-mono">{stats.cpu.toFixed(1)}%</span>
              </div>
              <Sparkline data={history.cpu} color="#a78bfa" maxVal={100} />
            </div>

            {/* RAM */}
            <div className={THEME.panel + " space-y-4"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span className={THEME.cardTitle}>RAM Usage</span>
                </div>
                <span className="text-lg font-bold text-white font-mono">{stats.ram.toFixed(1)}%</span>
              </div>
              <Sparkline data={history.ram} color="#34d399" maxVal={100} />
            </div>

            {/* Network Upload */}
            <div className={THEME.panel + " space-y-4"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-amber-400" />
                  <span className={THEME.cardTitle}>Upload</span>
                </div>
                <span className="text-sm font-bold text-white font-mono">{formatBytes(stats.networkUp)}</span>
              </div>
              <Sparkline data={history.netUp} color="#fbbf24" />
            </div>

            {/* Network Download */}
            <div className={THEME.panel + " space-y-4"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-sky-400" />
                  <span className={THEME.cardTitle}>Download</span>
                </div>
                <span className="text-sm font-bold text-white font-mono">{formatBytes(stats.networkDown)}</span>
              </div>
              <Sparkline data={history.netDown} color="#38bdf8" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Disk */}
            <div className={THEME.panel + " flex items-center justify-between"}>
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-rose-400" />
                <div>
                  <p className={THEME.textMeta}>DISK USAGE</p>
                  <p className="text-sm font-bold text-white mt-0.5">{stats.disk.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {/* Uptime */}
            <div className={THEME.panel + " flex items-center justify-between"}>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-indigo-400" />
                <div>
                  <p className={THEME.textMeta}>SYSTEM UPTIME</p>
                  <p className="text-sm font-bold text-white mt-0.5">{formatUptime(stats.uptime)}</p>
                </div>
              </div>
            </div>

            {/* Latency */}
            <div className={THEME.panel + " flex items-center justify-between"}>
              <div className="flex items-center gap-3">
                <Signal className="w-5 h-5 text-fuchsia-400" />
                <div>
                  <p className={THEME.textMeta}>NETWORK LATENCY</p>
                  <p className="text-sm font-bold text-white mt-0.5">{stats.latencyMs} ms</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
