import React from 'react';
import { View, Text } from 'react-native';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <View className="mb-4 flex-col">
      <Text className="text-slate-200 text-xs font-semibold uppercase tracking-wider">{title}</Text>
      {subtitle ? <Text className="text-slate-500 text-[10px] font-light mt-0.5">{subtitle}</Text> : null}
    </View>
  );
}
