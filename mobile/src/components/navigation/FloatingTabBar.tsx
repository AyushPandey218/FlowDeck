import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutDashboard, Activity, Smartphone, Settings as SettingsIcon } from 'lucide-react-native';
import TabButton from './TabButton';

interface FloatingTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export default function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();

  // Position the bar dynamically above the device's navigation area
  const bottomOffset = Platform.OS === 'ios' 
    ? Math.max(insets.bottom, 12) 
    : Math.max(insets.bottom, 16);

  // Map route names to Lucide icons
  const getIcon = (routeName: string) => {
    switch (routeName) {
      case 'HomeTab':
        return LayoutDashboard;
      case 'MonitorTab':
        return Activity;
      case 'DevicesTab':
        return Smartphone;
      case 'SettingsTab':
        return SettingsIcon;
      default:
        return LayoutDashboard;
    };
  };

  // Map route names to labels
  const getLabel = (routeName: string) => {
    switch (routeName) {
      case 'HomeTab':
        return 'Home';
      case 'MonitorTab':
        return 'Monitor';
      case 'DevicesTab':
        return 'Devices';
      case 'SettingsTab':
        return 'Settings';
      default:
        return 'App';
    }
  };

  return (
    <View style={[styles.floatingContainer, { bottom: bottomOffset }]}>
      {/* Glassmorphism Blur background */}
      <BlurView 
        intensity={Platform.OS === 'ios' ? 60 : 80} // Increased blur intensity
        tint="dark" 
        style={styles.blurStyle}
      >
        <View style={styles.barContent}>
          {state.routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, { merge: true });
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <TabButton
                key={route.key}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
                icon={getIcon(route.name)}
                label={getLabel(route.name)}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 70, // Increased height
    borderRadius: 35, // Balanced pill capsule roundedness
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)', // Reduced border visibility by ~37%
    overflow: 'hidden',
    backgroundColor: 'rgba(2, 6, 23, 0.65)', // Sleek semi-transparent dark slate
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 15,
    elevation: 8, // Shadows for Android
  },
  blurStyle: {
    width: '100%',
    height: '100%',
  },
  barContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: '100%',
  },
});
