import React from 'react';
import { View, ViewProps } from 'react-native';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export default function GlassCard({ children, className = '', style, ...props }: GlassCardProps) {
  return (
    <View
      className={className}
      style={[
        {
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          borderColor: 'rgba(30, 41, 59, 0.4)',
          borderWidth: 1,
          borderRadius: 24,
          padding: 20,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.4,
          shadowRadius: 15,
          elevation: 6,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
