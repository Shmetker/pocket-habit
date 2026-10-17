import { createContext, useContext } from 'react';
import type { TextStyle } from 'react-native';

import { FALLBACK_FONT_FAMILY } from './screen';

export const FontFallbackContext = createContext(false);

/** Overrides a custom family after a font load error. Null while the face is loaded. */
export function useFallbackFont(): TextStyle | null {
  const failed = useContext(FontFallbackContext);
  if (!failed) {
    return null;
  }
  return { fontFamily: FALLBACK_FONT_FAMILY };
}
