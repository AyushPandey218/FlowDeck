import React, { useEffect } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';

interface TabButtonProps {
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  icon: any; // Lucide icon component
  label: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(Animated.View);

export default function TabButton({
  isFocused,
  onPress,
  onLongPress,
  icon: Icon,
  label,
}: TabButtonProps) {
  // Shared values for transitions
  const flexGrow = useSharedValue(isFocused ? 1.8 : 1.0);
  const opacity = useSharedValue(isFocused ? 1.0 : 0.45);
  const textWidth = useSharedValue(isFocused ? 1.0 : 0.0); // interpolation target
  const padding = useSharedValue(isFocused ? 18 : 11); // Animated padding

  useEffect(() => {
    // Critically damped spring configuration with zero bounce/oscillation
    const springConfig = { 
      damping: 22, 
      stiffness: 150, 
      overshootClamping: true 
    };
    
    flexGrow.value = withSpring(isFocused ? 1.8 : 1.0, springConfig);
    opacity.value = withSpring(isFocused ? 1.0 : 0.45, springConfig);
    textWidth.value = withSpring(isFocused ? 1.0 : 0.0, springConfig);
    padding.value = withSpring(isFocused ? 18 : 11, springConfig);
  }, [isFocused]);

  // Dynamic animated styles
  const containerStyle = useAnimatedStyle(() => {
    return {
      flexGrow: flexGrow.value,
      paddingHorizontal: padding.value, // Dynamically grow padding
      backgroundColor: isFocused 
        ? 'rgba(139, 92, 246, 0.16)' // Translucent Flow Deck Purple
        : 'rgba(15, 23, 42, 0.2)',
      borderColor: isFocused
        ? 'rgba(139, 92, 246, 0.35)' // Glowing purple accent border (reduced visibility)
        : 'rgba(255, 255, 255, 0.03)', // Softened border
      opacity: opacity.value,
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    // Set target width based on label text to prevent wrapping or jumps
    const maxTargetWidth = label === 'Monitor' ? 52 : label === 'Settings' ? 55 : label === 'Devices' ? 52 : 40;
    return {
      width: textWidth.value * maxTargetWidth,
      opacity: textWidth.value,
      marginLeft: textWidth.value * 10, // Increased icon-label spacing to 10
    };
  });

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.buttonContainer, containerStyle]}
    >
      <Animated.View style={styles.iconWrapper}>
        <Icon 
          size={18} 
          color={isFocused ? '#c084fc' : '#94a3b8'} // Violet-400 vs Slate-400
          strokeWidth={2.2} // Constant stroke width prevents sudden visual jumps
        />
      </Animated.View>
      <Animated.View style={[styles.textWrapper, labelStyle]}>
        <Text 
          numberOfLines={1} 
          style={[styles.label, { color: isFocused ? '#f8fafc' : '#94a3b8' }]}
        >
          {label}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    height: 48, // Increased height
    borderRadius: 24, // Balanced capsule shape
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  iconWrapper: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0, // Prevent flexbox from squeezing the icon size during transitions
  },
  textWrapper: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
