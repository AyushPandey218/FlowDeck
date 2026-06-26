import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      const next = [...prev, { id, type, message }];
      if (next.length > 5) {
        return next.slice(next.length - 5);
      }
      return next;
    });
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{
      showToast,
      success: (msg) => showToast('success', msg),
      warn: (msg) => showToast('warning', msg),
      error: (msg) => showToast('error', msg),
    }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 w-80 max-w-[calc(100vw-3rem)]">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const remainingTime = useRef(4000);
  const startTime = useRef(Date.now());
  const timerId = useRef<any>(null);

  const startTimer = () => {
    startTime.current = Date.now();
    timerId.current = setTimeout(() => {
      onRemove(toast.id);
    }, remainingTime.current);
  };

  const clearTimer = () => {
    if (timerId.current) {
      clearTimeout(timerId.current);
      timerId.current = null;
    }
  };

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, []);

  const handleMouseEnter = () => {
    clearTimer();
    const elapsed = Date.now() - startTime.current;
    remainingTime.current = Math.max(0, remainingTime.current - elapsed);
  };

  const handleMouseLeave = () => {
    startTime.current = Date.now();
    startTimer();
  };

  const getStyle = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-slate-900/90 backdrop-blur-md border-emerald-500/20 text-emerald-300 shadow-emerald-950/20',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
        };
      case 'warning':
        return {
          bg: 'bg-slate-900/90 backdrop-blur-md border-amber-500/20 text-amber-300 shadow-amber-950/20',
          icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
        };
      case 'error':
        return {
          bg: 'bg-slate-900/90 backdrop-blur-md border-rose-500/20 text-rose-300 shadow-rose-950/20',
          icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
        };
    }
  };

  const styles = getStyle();

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`border p-4 rounded-xl flex items-start justify-between gap-3 shadow-xl transition-all duration-300 hover:scale-[1.02] ${styles.bg}`}
    >
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        {styles.icon}
        <p className="text-xs font-semibold leading-relaxed text-slate-100 break-words">{toast.message}</p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
