import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, SUGGESTIONS } from '../theme';
import { useFallbackFont } from '../typeface';
import { FlameLargeIcon } from './Icons';

type Props = {
  onSuggest: (name: string) => void;
};

export function EmptyState({ onSuggest }: Props) {
  const fallbackFont = useFallbackFont();
  return (
    <View style={styles.block}>
      <FlameLargeIcon />
      <View style={styles.gap16} />
      <Text style={[styles.title, fallbackFont]}>Start with one small habit</Text>
      <View style={styles.gap8} />
      <Text style={[styles.subtitle, fallbackFont]}>Tick it daily to build a streak</Text>
      <View style={styles.gap24} />
      <View style={styles.chips}>
        {SUGGESTIONS.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={`Start a ${name} habit`}
            onPress={() => onSuggest(name)}
            style={styles.chip}
          >
            <Text style={[styles.chipLabel, fallbackFont]}>{name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingTop: 96,
    alignItems: 'center',
  },
  gap16: { height: 16 },
  gap8: { height: 8 },
  gap24: { height: 24 },
  title: {
    fontFamily: font.semibold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.ink,
  },
});
