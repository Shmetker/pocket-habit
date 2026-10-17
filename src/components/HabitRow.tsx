import { StyleSheet, Text, View } from 'react-native';

import { describeStreak } from '../copy';
import type { StreakResult } from '../streak';
import { colors, font } from '../theme';
import { useFallbackFont } from '../typeface';
import { CheckCircle } from './CheckCircle';
import { FlameIcon } from './Icons';

type Props = {
  name: string;
  asOf: string;
  done: boolean;
  streak: StreakResult;
  best: number;
  onToggle: (asOf: string) => void;
};

export function HabitRow({ name, asOf, done, streak, best, onToggle }: Props) {
  const fallbackFont = useFallbackFont();
  const caption = describeStreak(streak, best);
  const checkLabel = done ? `Remove today's tick for ${name}` : `Tick ${name} for today`;

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[styles.name, fallbackFont]} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.meta}>
          {caption.showFlame ? <FlameIcon /> : null}
          {caption.countLabel ? (
            <Text style={[styles.count, fallbackFont]}>{caption.countLabel}</Text>
          ) : null}
          {caption.bestLabel ? (
            <Text style={[styles.best, fallbackFont]}>{`·  ${caption.bestLabel}`}</Text>
          ) : null}
          {caption.graceSavedLabel ? (
            <Text style={[styles.grace, fallbackFont]}>{`·  ${caption.graceSavedLabel}`}</Text>
          ) : null}
          {caption.showGraceDot ? <View style={styles.dot} /> : null}
          {caption.graceReturnLabel ? (
            <Text style={[styles.grace, fallbackFont]}>{caption.graceReturnLabel}</Text>
          ) : null}
          {caption.brokenLabel ? (
            <Text style={[styles.broken, fallbackFont]}>{caption.brokenLabel}</Text>
          ) : null}
          {caption.idleLabel ? (
            <Text style={[styles.idle, fallbackFont]}>{caption.idleLabel}</Text>
          ) : null}
        </View>
      </View>
      <CheckCircle done={done} label={checkLabel} onPress={() => onToggle(asOf)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  text: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 2,
  },
  count: {
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  best: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  grace: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.grace,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.grace,
  },
  broken: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  idle: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
});
