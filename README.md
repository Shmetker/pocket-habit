# Pocket Habit

A one-screen habit tracker. Add a habit, tick it for today, and keep a streak. Built with Expo, React Native, TypeScript, `expo-sqlite`, and `expo-haptics`. The same UI runs on iOS, Android, and web.

## Run locally

Node.js 22 or newer.

```bash
npm install
npm run web
```

The web dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). Expo’s document response does not go through Metro middleware, so `npm run web` runs a small local proxy that adds the same cross-origin isolation headers to every response, including the HTML. Metro still adds them to the JavaScript bundle.

```bash
npm start
```

Then open the project in Expo Go, a development build, or a simulator.

```bash
npm run typecheck
npm run lint
npm test
```

## Web export for Cloudflare Pages

Build command (output directory is `dist/`):

```bash
npx expo export -p web && cp public/_headers dist/_headers
```

`npm run export:web` is that same command. `npx expo export -p web` writes the static site to `dist/`. The `cp` puts `public/_headers` at `dist/_headers`, which Cloudflare Pages reads from the output root. `npm run serve:web` serves `dist/` on [http://127.0.0.1:43124](http://127.0.0.1:43124) with those headers so you can confirm SQLite before publishing.

`public/_headers` sets:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`expo-sqlite` on web loads SQLite through WebAssembly and `SharedArrayBuffer`. Browsers only enable that when the page is cross-origin isolated, which those two headers do. All of the app’s scripts, fonts, and wasm are same-origin, so `require-corp` can stay strict.

`wrangler.toml` names the Pages project `pocket-habit` and sets `pages_build_output_dir = "dist"`. With a Cloudflare API token and account id in the environment:

```bash
npx wrangler pages deploy dist --project-name pocket-habit
```

Pages build settings, if the GitHub repo is connected instead of a direct upload: build command `npx expo export -p web && cp public/_headers dist/_headers`, output directory `dist`, Node.js 22.

There are no `EXPO_PUBLIC_` variables. Do not put secrets in `EXPO_PUBLIC_*`: Expo inlines those into the client bundle. `.gitignore` ignores `.env*`.

## Data

Dates are local `YYYY-MM-DD` strings. The app never uses `Date#toISOString()` for a calendar day, because that is the UTC day.

`habits(id, name, createdAt, best)` and `checkins(habitId, date)` with primary key `(habitId, date)`. A tick inserts a row. An untick deletes it. There is no confirm step; a short Undo puts the row back.

`best` is extra storage so the record can be raised and never lowered. On open, Best is the greater of the stored value and the longest streak in the check-in history. After a tick, Best becomes the greater of the stored value and the new current streak. An untick does not reduce it.

Today is read again whenever the app returns to the foreground, including a timezone change while it was backgrounded.

## Streaks and the rolling grace window

`computeStreak(dates, clock)` is pure. The clock supplies the instant and the IANA time zone. The result is the current streak plus grace state, including how many days until grace returns.

The walk starts at today if today is ticked, otherwise at yesterday. An empty today is still open; it is not a miss.

The count is the number of check-in days in the live streak. A missed day can stay in the streak as a grace day and does not add to the count.

Grace uses a rolling window of 7 consecutive local calendar days:

- At most one grace day may fall inside any such window.
- Two grace dates are allowed only when they are at least 7 calendar days apart. A gap of 6 days still shares a 7-day window, so the older side of the streak ends.
- Two missed days in a row always end the streak, even if grace would otherwise be free.
- `daysUntilGraceReturns` is `max(0, 7 - days since the latest grace day in this streak)`. Zero means a new grace day is allowed.

While grace is used up, the row shows a quiet grace dot and “Grace back in N days”. When a grace day is what keeps the streak connected, the row also says “Streak kept, grace day used”.

A broken streak (check-ins exist, current streak is 0) says “Start again, your best is X” instead of a large 0. A new habit with no check-ins says “Tick today to start”.

The tick animation is 220ms every time, with the same medium haptic.

## Design notes

Visual specs come from the Figma file (list, empty state, add-habit sheet): cream background `#FAF8F5`, ink `#1E1B24`, muted `#6F6873`, card border `#8E8794`, done circles `#22A06B`, save and add buttons `#1A8457`, grace text `#9A6010`, Plus Jakarta Sans.

A few Figma details differ from the behavior spec, and the spec wins where they disagree:

- Figma’s grace note is “1 day saved”. The app uses “Streak kept, grace day used”, plus a quiet grace dot and “Grace back in N days” while that grace is still inside the rolling window.
- Figma has no broken-streak layout. The app shows “Start again, your best is X”.
- Figma draws a fake status bar and a decorative keyboard. The app uses the real status bar and the system keyboard.
- The Figma date is a static “Today, Fri 17”. The app formats the local date.
- Figma shows the Best note only when it is ahead of the current streak. The app does the same.
- The empty-state chips are in Figma. Tapping one opens the add sheet with that name filled in.
- Untick-with-undo is required by the spec and is not a separate Figma frame.
