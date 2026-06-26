import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/navigationRef';
import { StatusBar } from 'expo-status-bar';
import { enableScreens } from 'react-native-screens';
import './global.css';
import AppNavigator from './src/navigation/AppNavigator';
import { websocketManager } from './src/services/websocket/WebSocketManager';
import { ToastProvider } from './src/components/ToastSystem';
import { AlertProvider } from './src/components/AlertSystem';

// Disable native screens optimization to resolve context loss issues with React 19 / RN 0.85
enableScreens(false);

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isReady) {
      websocketManager.connect();
    }
    return () => {
      websocketManager.disconnect();
    };
  }, [isReady]);

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AlertProvider>
          <NavigationContainer ref={navigationRef} onReady={() => setIsReady(true)}>
            <AppNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </AlertProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
