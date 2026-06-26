import * as Haptics from 'expo-haptics';
import { useWebSocketStore } from './websocket/websocketStore';

/**
 * Utility to safely trigger device haptic feedback.
 * Respects user preference in the settings store and handles device compatibility.
 */
class HapticsService {
  private get isEnabled(): boolean {
    try {
      return useWebSocketStore.getState().hapticFeedbackEnabled;
    } catch {
      return true;
    }
  }

  /**
   * Triggers a light tactile feedback on button press.
   */
  public async triggerLight() {
    if (!this.isEnabled) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.log('[HAPTICS] Light impact failed:', error);
    }
  }

  /**
   * Triggers a success notification feedback.
   */
  public async triggerSuccess() {
    if (!this.isEnabled) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log('[HAPTICS] Success notification failed:', error);
    }
  }

  /**
   * Triggers a warning notification feedback.
   */
  public async triggerWarning() {
    if (!this.isEnabled) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error) {
      console.log('[HAPTICS] Warning notification failed:', error);
    }
  }

  /**
   * Triggers an error notification feedback.
   */
  public async triggerError() {
    if (!this.isEnabled) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (error) {
      console.log('[HAPTICS] Error notification failed:', error);
    }
  }
}

export const haptics = new HapticsService();
