import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font } from '../theme';
import { useFallbackFont } from '../typeface';

type Props = {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
};

export function AddHabitSheet({ visible, initialName, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const fallbackFont = useFallbackFont();
  const [name, setName] = useState(initialName);
  const [focused, setFocused] = useState(true);

  const trimmed = name.trim();

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.fill}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close new habit"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.handle} />
          <View style={styles.gap16} />
          <Text style={[styles.title, fallbackFont]}>New habit</Text>
          <View style={styles.gap16} />
          <TextInput
            accessibilityLabel="Habit name"
            autoFocus
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Habit name"
            placeholderTextColor={colors.muted}
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (trimmed) {
                onSave(trimmed);
              }
            }}
            style={[styles.input, focused ? styles.inputFocused : styles.inputIdle, fallbackFont]}
          />
          <View style={styles.gap24} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save habit"
            disabled={!trimmed}
            onPress={() => onSave(trimmed)}
            style={[styles.save, !trimmed && styles.saveDisabled]}
          >
            <Text style={[styles.saveLabel, fallbackFont]}>Save</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.handle,
    alignSelf: 'center',
  },
  gap16: { height: 16 },
  gap24: { height: 24 },
  title: {
    fontFamily: font.semibold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontFamily: font.regular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: colors.action,
  },
  inputIdle: {
    borderWidth: 2,
    borderColor: colors.line,
  },
  save: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: {
    opacity: 0.45,
  },
  saveLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white,
  },
});
