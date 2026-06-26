import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/navigationRef';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { enableScreens } from 'react-native-screens';
import './global.css';
import AppNavigator from './src/navigation/AppNavigator';
import { websocketManager } from './src/services/websocket/WebSocketManager';
import { ToastProvider } from './src/components/ToastSystem';
import { AlertProvider } from './src/components/AlertSystem';

SplashScreen.preventAutoHideAsync();

// Disable native screens optimization to resolve context loss issues with React 19 / RN 0.85
enableScreens(false);

export default function App() {
  const [isReady, setIsReady] = useState(false);

  const onReady = useCallback(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
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
          <NavigationContainer ref={navigationRef} onReady={onReady}>
            <AppNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </AlertProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
