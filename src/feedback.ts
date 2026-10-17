import * as Haptics from 'expo-haptics';

/** Same duration on every tick. Stays under the 300ms budget. */
export const TICK_ANIMATION_MS = 220;

/** Same haptic on every tick. */
const TICK_HAPTIC_STYLE = Haptics.ImpactFeedbackStyle.Medium;

export function playTickHaptic(): void {
  void Haptics.impactAsync(TICK_HAPTIC_STYLE).catch(() => {
    // Browsers without vibration hardware reject the Web Vibration API.
    // The tick itself still saves.
  });
}
