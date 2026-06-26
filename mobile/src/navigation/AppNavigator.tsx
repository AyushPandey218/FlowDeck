import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LayoutDashboard, Activity, Smartphone, Settings as SettingsIcon, Wrench } from 'lucide-react-native';
import Home from '../screens/Home';
import Monitor from '../screens/Monitor';
import Devices from '../screens/Devices';
import Settings from '../screens/Settings';
import Tools from '../screens/Tools';
import PairDevice from '../screens/PairDevice';
import ClipboardHistory from '../screens/ClipboardHistory';
import Transfers from '../screens/Transfers';
import Onboarding from '../screens/Onboarding';
import { useWebSocketStore } from '../services/websocket/websocketStore';

import FloatingTabBar from '../components/navigation/FloatingTabBar';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={Home}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <LayoutDashboard size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="MonitorTab"
        component={Monitor}
        options={{
          tabBarLabel: 'Monitor',
          tabBarIcon: ({ color }) => <Activity size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="ToolsTab"
        component={Tools}
        options={{
          tabBarLabel: 'Tools',
          tabBarIcon: ({ color }) => <Wrench size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="DevicesTab"
        component={Devices}
        options={{
          tabBarLabel: 'Devices',
          tabBarIcon: ({ color }) => <Smartphone size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={Settings}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <SettingsIcon size={18} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { onboardingCompleted } = useWebSocketStore();
  return (
    <Stack.Navigator 
      screenOptions={{ headerShown: false }}
      initialRouteName={onboardingCompleted ? "MainTabs" : "Onboarding"}
    >
      <Stack.Screen name="Onboarding" component={Onboarding} />
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="PairDevice" component={PairDevice} />
      <Stack.Screen name="ClipboardHistory" component={ClipboardHistory} />
      <Stack.Screen name="Transfers" component={Transfers} />
    </Stack.Navigator>
  );
}
