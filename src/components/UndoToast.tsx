import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font } from '../theme';
import { useFallbackFont } from '../typeface';

type Props = {
  label: string;
  onUndo: () => void;
};

export function UndoToast({ label, onUndo }: Props) {
  const fallbackFont = useFallbackFont();
  return (
    <View accessibilityLiveRegion="polite" style={styles.bar}>
      <Text style={[styles.label, fallbackFont]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={onUndo} hitSlop={8}>
        <Text style={[styles.undo, fallbackFont]}>Undo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  undo: {
    fontFamily: font.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.action,
  },
});
