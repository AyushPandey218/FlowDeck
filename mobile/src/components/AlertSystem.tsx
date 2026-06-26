import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AlertConfig = {
  title: string;
  message: string;
  buttons?: AlertButton[];
};

let globalAlertSetter: ((config: AlertConfig | null) => void) | null = null;

export const CustomAlert = {
  alert: (title: string, message: string, buttons?: AlertButton[]) => {
    if (globalAlertSetter) {
      globalAlertSetter({ title, message, buttons: buttons || [{ text: 'OK' }] });
    } else {
      // Fallback
      import('react-native').then(rn => rn.Alert.alert(title, message, buttons as any));
    }
  }
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  useEffect(() => {
    globalAlertSetter = setAlertConfig;
    return () => {
      globalAlertSetter = null;
    };
  }, []);

  const closeAlert = () => setAlertConfig(null);

  return (
    <>
      {children}
      <Modal transparent visible={!!alertConfig} animationType="fade">
        {alertConfig && (
          <View style={styles.overlay}>
            <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
            <View style={styles.alertBox}>
              <Text style={styles.title}>{alertConfig.title}</Text>
              <Text style={styles.message}>{alertConfig.message}</Text>
              <View style={styles.buttonContainer}>
                {alertConfig.buttons?.map((btn, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.button,
                      btn.style === 'cancel' && styles.buttonCancel,
                      btn.style === 'destructive' && styles.buttonDestructive
                    ]}
                    onPress={() => {
                      closeAlert();
                      if (btn.onPress) btn.onPress();
                    }}
                  >
                    <Text style={[
                      styles.buttonText,
                      btn.style === 'cancel' && styles.buttonTextCancel,
                      btn.style === 'destructive' && styles.buttonTextDestructive
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  alertBox: {
    width: '85%',
    backgroundColor: 'rgba(20, 21, 35, 0.95)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonCancel: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderColor: 'rgba(51, 65, 85, 0.6)',
  },
  buttonDestructive: {
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderColor: 'rgba(225, 29, 72, 0.4)',
  },
  buttonText: {
    color: '#c4b5fd',
    fontWeight: '600',
    fontSize: 15,
  },
  buttonTextCancel: {
    color: '#94a3b8',
  },
  buttonTextDestructive: {
    color: '#fda4af',
  },
});
