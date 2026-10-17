import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFonts } from 'expo-font';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddHabitSheet } from './src/components/AddHabitSheet';
import { EmptyState } from './src/components/EmptyState';
import { HabitRow } from './src/components/HabitRow';
import { PlusIcon } from './src/components/Icons';
import { UndoToast } from './src/components/UndoToast';
import { systemClock, localToday } from './src/clock';
import { formatTodayHeading } from './src/dates';
import { playTickHaptic } from './src/feedback';
import { applyTick, applyUntick, type HabitView } from './src/habit';
import {
  FALLBACK_FONT_FAMILY,
  homeIsBlocked,
  markLocalChange,
  notebookCanOpen,
  planTap,
  publishReload,
  restoreRemovedDate,
} from './src/screen';
import { computeStreak } from './src/streak';
import {
  addHabit,
  listCheckins,
  listHabits,
  loadHabitViews,
  raiseBest,
  tick,
  untick,
} from './src/storage/sqlite';
import { colors, font, UNDO_MS } from './src/theme';
import { FontFallbackContext } from './src/typeface';

type UndoState = {
  habitId: string;
  date: string;
  name: string;
};

function createId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (randomUUID) {
    return randomUUID.call(globalThis.crypto);
  }
  return `habit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PocketHabit />
    </SafeAreaProvider>
  );
}

function PocketHabit() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const fontFailed = fontError != null;
  const fallbackFont = fontFailed ? { fontFamily: FALLBACK_FONT_FAMILY } : null;
  const [habits, setHabits] = useState<HabitView[] | null>(null);
  const [heading, setHeading] = useState(() =>
    formatTodayHeading(new Date(), systemClock().timeZone),
  );
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);

  const runSerialized = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const clearUndo = useCallback(() => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    setUndo(null);
  }, []);

  const showUndo = useCallback(
    (next: UndoState) => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
      setUndo(next);
      undoTimer.current = setTimeout(() => {
        setUndo(null);
        undoTimer.current = null;
      }, UNDO_MS);
    },
    [],
  );

  const refresh = useCallback(() => {
    const clock = systemClock();
    const startedAt = generation.current;
    setHeading(formatTodayHeading(clock.now(), clock.timeZone));
    return runSerialized(async () => {
      const views = await loadHabitViews(clock);
      const stale = generation.current !== startedAt;
      setHabits((current) => publishReload(current, views, stale));
      setHeading(formatTodayHeading(clock.now(), clock.timeZone));
      setError(null);
    });
  }, [runSerialized]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    document.body.style.backgroundColor = colors.background;
    document.body.style.margin = '0';
  }, []);

  useEffect(() => {
    if (!notebookCanOpen(fontsLoaded, fontFailed)) {
      return;
    }
    let cancelled = false;
    const clock = systemClock();
    const startedAt = generation.current;
    void runSerialized(async () => {
      try {
        const views = await loadHabitViews(clock);
        if (cancelled) {
          return;
        }
        setHabits((current) => publishReload(current, views, generation.current !== startedAt));
        setHeading(formatTodayHeading(clock.now(), clock.timeZone));
        setError(null);
      } catch (reason: unknown) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Couldn’t open the habit notebook');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fontsLoaded, fontFailed, runSerialized]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refresh().catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : 'Couldn’t refresh today');
        });
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => () => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
    }
  }, []);

  const openSheet = (name = '') => {
    setDraft(name);
    setSheetOpen(true);
  };

  const onSave = (name: string) => {
    const clock = systemClock();
    const today = localToday(clock);
    setSheetOpen(false);
    setDraft('');
    generation.current = markLocalChange(generation.current);
    const startedAt = generation.current;
    void runSerialized(async () => {
      await addHabit({ id: createId(), name, createdAt: today });
      const views = await loadHabitViews(clock);
      setHabits((current) => publishReload(current, views, generation.current !== startedAt));
      setHeading(formatTodayHeading(clock.now(), clock.timeZone));
      setError(null);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save that habit');
    });
  };

  const onToggle = (habit: HabitView, rowDate: string) => {
    const clock = systemClock();
    const decision = planTap(habit, clock, rowDate);
    if (decision.type === 'reload') {
      void refresh().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Couldn’t refresh today');
      });
      return;
    }

    generation.current = markLocalChange(generation.current);
    if (decision.type === 'untick') {
      setHabits(
        (current) =>
          current?.map((item) =>
            item.id === habit.id && item.asOf === decision.date ? applyUntick(item, clock) : item,
          ) ?? null,
      );
      showUndo({ habitId: habit.id, date: decision.date, name: habit.name });
      void runSerialized(() => untick(habit.id, decision.date)).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Couldn’t remove today’s tick');
        void refresh();
      });
      return;
    }

    clearUndo();
    playTickHaptic();
    setHabits(
      (current) =>
        current?.map((item) =>
          item.id === habit.id && item.asOf === decision.date ? applyTick(item, clock) : item,
        ) ?? null,
    );
    void runSerialized(async () => {
      await tick(habit.id, decision.date);
      if (decision.view.best > habit.best) {
        await raiseBest(habit.id, decision.view.best);
      }
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save today’s tick');
      void refresh();
    });
  };

  const onUndo = () => {
    if (!undo) {
      return;
    }
    const snapshot = undo;
    clearUndo();
    playTickHaptic();
    const clock = systemClock();
    generation.current = markLocalChange(generation.current);
    setHabits(
      (current) =>
        current?.map((item) =>
          item.id === snapshot.habitId ? restoreRemovedDate(item, snapshot.date, clock) : item,
        ) ?? null,
    );
    void runSerialized(async () => {
      await tick(snapshot.habitId, snapshot.date);
      const dates = await listCheckins(snapshot.habitId);
      const currentStreak = computeStreak(dates, systemClock()).current;
      const records = await listHabits();
      const record = records.find((item) => item.id === snapshot.habitId);
      if (record && currentStreak > record.best) {
        await raiseBest(record.id, currentStreak);
      }
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Couldn’t undo that tick');
      void refresh();
    });
  };

  const doneCount = habits?.filter((habit) => habit.doneToday).length ?? 0;
  const subtitle =
    habits === null
      ? 'Loading habits…'
      : habits.length === 0
        ? 'No habits yet'
        : `${doneCount} of ${habits.length} done`;

  const blocked = homeIsBlocked({
    fontsLoaded,
    fontFailed,
    habitsReady: habits !== null,
    failedToLoad: error !== null,
  });

  return (
    <FontFallbackContext.Provider value={fontFailed}>
    <View style={styles.page}>
      <StatusBar style="dark" />
      <View style={[styles.column, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, fallbackFont]}>{heading}</Text>
          <Text style={[styles.subtitle, fallbackFont]}>{subtitle}</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorTitle, fallbackFont]}>Pocket Habit can’t open its notebook</Text>
            <Text style={[styles.errorBody, fallbackFont]}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={() => {
                void refresh().catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : 'Still couldn’t open habits');
                });
              }}
              style={styles.retry}
            >
              <Text style={[styles.retryLabel, fallbackFont]}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {blocked ? (
          <Text style={[styles.loading, fallbackFont]}>Loading habits…</Text>
        ) : habits && habits.length === 0 ? (
          <EmptyState onSuggest={openSheet} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {habits?.map((habit) => (
              <HabitRow
                key={habit.id}
                name={habit.name}
                asOf={habit.asOf}
                done={habit.doneToday}
                streak={habit.streak}
                best={habit.best}
                onToggle={(rowDate) => onToggle(habit, rowDate)}
              />
            ))}
          </ScrollView>
        )}

        <View
          pointerEvents="box-none"
          style={[styles.dock, { bottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          {undo ? (
            <View style={styles.undoWrap}>
              <UndoToast label={`Removed today's tick for ${undo.name}`} onUndo={onUndo} />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add habit"
            onPress={() => openSheet()}
            style={styles.fab}
          >
            <View pointerEvents="none">
              <PlusIcon />
            </View>
          </Pressable>
        </View>
      </View>

      {sheetOpen ? (
        <AddHabitSheet
          key={draft}
          visible
          initialName={draft}
          onClose={() => setSheetOpen(false)}
          onSave={onSave}
        />
      ) : null}
    </View>
    </FontFallbackContext.Provider>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 24,
  },
  header: {
    gap: 4,
    marginBottom: 24,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.32,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.muted,
  },
  list: {
    gap: 12,
    paddingBottom: 128,
  },
  loading: {
    marginTop: 48,
    textAlign: 'center',
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.muted,
  },
  errorBox: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  errorTitle: {
    fontFamily: font.semibold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  errorBody: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.muted,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.action,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryLabel: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.white,
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    alignItems: 'flex-end',
    gap: 12,
  },
  undoWrap: {
    alignSelf: 'stretch',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
});
