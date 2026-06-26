import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ActionConfig {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: any; // Lucide icon component
  title: string;
  description: string;
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
}

export default function EmptyState({ 
  icon: Icon, 
  title, 
  description,
  primaryAction,
  secondaryAction
}: EmptyStateProps) {
  return (
    <View 
      className="flex-col items-center justify-center p-8 rounded-3xl py-10 my-4"
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(30, 41, 59, 0.6)',
        backgroundColor: 'rgba(15, 23, 42, 0.2)',
      }}
    >
      {Icon && (
        <View 
          className="p-4 rounded-full mb-4"
          style={{
            backgroundColor: 'rgba(2, 6, 23, 0.6)',
            borderColor: 'rgba(139, 92, 246, 0.3)',
            borderWidth: 1,
          }}
        >
          <Icon size={28} color="#8b5cf6" />
        </View>
      )}
      <Text className="text-slate-100 text-sm font-semibold text-center mb-1.5">{title}</Text>
      <Text className="text-slate-400 text-xs text-center font-light leading-normal max-w-[260px] mb-4">
        {description}
      </Text>

      {(primaryAction || secondaryAction) && (
        <View className="flex-row flex-wrap items-center justify-center gap-3 pt-2">
          {primaryAction && (
            <TouchableOpacity
              onPress={primaryAction.onClick}
              activeOpacity={0.8}
              className="px-4 py-2.5 rounded-xl bg-violet-650"
              style={{ backgroundColor: '#7c3aed' }}
            >
              <Text className="text-white text-xs font-semibold">{primaryAction.label}</Text>
            </TouchableOpacity>
          )}
          {secondaryAction && (
            <TouchableOpacity
              onPress={secondaryAction.onClick}
              activeOpacity={0.7}
              className="px-3 py-2.5 rounded-xl border border-slate-700"
              style={{ borderColor: '#334155' }}
            >
              <Text className="text-slate-400 text-xs font-semibold">{secondaryAction.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
