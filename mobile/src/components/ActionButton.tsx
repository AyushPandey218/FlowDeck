import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';

interface ActionButtonProps {
  name: string;
  type: string;
  icon: any; // Lucide icon node
  onPress?: () => void;
  disabled?: boolean;
  color?: string;
}

export default function ActionButton({ name, type, icon: Icon, onPress, disabled = false, color = '#a78bfa' }: ActionButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      className="p-4 rounded-3xl flex-col items-start"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.45)', // bg-slate-900/45
        borderColor: 'rgba(30, 41, 59, 0.5)',     // border-slate-800/50
        borderWidth: 1,
        opacity: disabled ? 0.6 : 1.0,            // opacity-60
        shadowColor: '#000000',                   // shadow-md
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
      }}
    >
      <View 
        className="p-2 rounded-xl mb-3"
        style={{
          backgroundColor: 'rgba(2, 6, 23, 0.5)',   // bg-slate-950/50
          borderColor: 'rgba(30, 41, 59, 0.4)',     // border-slate-800/40
          borderWidth: 1,
        }}
      >
        <Icon size={16} color={color} />
      </View>
      <Text className="text-white text-xs font-semibold tracking-tight" numberOfLines={1}>
        {name}
      </Text>
      <Text className="text-[9px] text-slate-500 font-mono uppercase tracking-wider mt-1">
        {type}
      </Text>
    </TouchableOpacity>
  );
}
