import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react-native';

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
      if (next.length > 3) {
        return next.slice(next.length - 3);
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
  const insets = useSafeAreaInsets();
  return (
    <View 
      pointerEvents="box-none" 
      style={[styles.container, { top: insets.top + 10 }]}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </View>
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

  const handlePressIn = () => {
    clearTimer();
    const elapsed = Date.now() - startTime.current;
    remainingTime.current = Math.max(0, remainingTime.current - elapsed);
  };

  const handlePressOut = () => {
    startTime.current = Date.now();
    startTimer();
  };

  const getStyle = () => {
    switch (toast.type) {
      case 'success':
        return {
          bgColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(16, 185, 129, 0.3)',
          textColor: '#a7f3d0',
          icon: <CheckCircle size={20} color="#10b981" style={styles.icon} />,
        };
      case 'warning':
        return {
          bgColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(245, 158, 11, 0.3)',
          textColor: '#fef3c7',
          icon: <AlertTriangle size={20} color="#f59e0b" style={styles.icon} />,
        };
      case 'error':
        return {
          bgColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(244, 63, 94, 0.3)',
          textColor: '#fecdd3',
          icon: <AlertOctagon size={20} color="#f43f5e" style={styles.icon} />,
        };
    }
  };

  const stylesConfig = getStyle();

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.card,
        {
          backgroundColor: stylesConfig.bgColor,
          borderColor: stylesConfig.borderColor,
        }
      ]}
    >
      <View style={styles.content}>
        {stylesConfig.icon}
        <Text style={[styles.text, { color: stylesConfig.textColor }]}>
          {toast.message}
        </Text>
      </View>
      <Pressable onPress={() => onRemove(toast.id)} style={styles.closeBtn} hitSlop={10}>
        <X size={16} color="#94a3b8" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  }
});
