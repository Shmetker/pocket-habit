import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet } from 'react-native';

import { TICK_ANIMATION_MS } from '../feedback';
import { colors } from '../theme';
import { CheckIcon } from './Icons';

type Props = {
  done: boolean;
  label: string;
  onPress: () => void;
};

export function CheckCircle({ done, label, onPress }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const wasDone = useRef(done);

  useEffect(() => {
    if (done && !wasDone.current) {
      scale.setValue(0.86);
      Animated.timing(scale, {
        toValue: 1,
        duration: TICK_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
    if (!done) {
      scale.setValue(1);
    }
    wasDone.current = done;
  }, [done, scale]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ checked: done }}
      hitSlop={6}
      onPress={onPress}
      style={styles.hit}
    >
      <Animated.View style={[styles.circle, done ? styles.done : styles.open, { transform: [{ scale }] }]}>
        {done ? <CheckIcon /> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    backgroundColor: colors.done,
  },
  open: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.line,
  },
});
