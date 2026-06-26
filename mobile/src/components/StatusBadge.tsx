import React from 'react';
import { View, Text } from 'react-native';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'idle' | 'warning';
  text: string;
}

export default function StatusBadge({ status, text }: StatusBadgeProps) {
  let badgeStyle: any = {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  };
  let textClass = 'text-amber-400';
  let dotStyle = 'bg-amber-400';

  if (status === 'online') {
    badgeStyle = {
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderColor: 'rgba(16, 185, 129, 0.25)',
    };
    textClass = 'text-emerald-400';
    dotStyle = 'bg-emerald-400';
  } else if (status === 'offline') {
    badgeStyle = {
      backgroundColor: 'rgba(244, 63, 94, 0.1)',
      borderColor: 'rgba(244, 63, 94, 0.25)',
    };
    textClass = 'text-rose-400';
    dotStyle = 'bg-rose-400';
  } else if (status === 'idle') {
    badgeStyle = {
      backgroundColor: 'rgba(30, 41, 59, 0.8)',
      borderColor: 'rgba(51, 65, 85, 0.5)',
    };
    textClass = 'text-slate-400';
    dotStyle = 'bg-slate-500';
  }

  return (
    <View 
      className="flex-row items-center gap-1.5 px-3 py-1 rounded-full border"
      style={badgeStyle}
    >
      <View className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
      <Text className={`text-[10px] font-bold tracking-wider uppercase ${textClass}`}>{text}</Text>
    </View>
  );
}
