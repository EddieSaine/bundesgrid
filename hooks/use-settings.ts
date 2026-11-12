'use client';

import { create } from 'zustand';
import type { Horizon } from '@/lib/domain/types';

export interface Settings {
  horizon: Horizon;
  refreshMs: number;
  state: string;
  paletteOpen: boolean;
  setHorizon: (h: Horizon) => void;
  setRefreshMs: (ms: number) => void;
  setState: (s: string) => void;
  setPaletteOpen: (o: boolean) => void;
}

/** Global dashboard controls: time horizon, refresh interval, Bundesland cross-filter. */
export const useSettings = create<Settings>((set) => ({
  horizon: '24h',
  refreshMs: 60000,
  state: '',
  paletteOpen: false,
  setHorizon: (horizon: Horizon) => set({ horizon }),
  setRefreshMs: (refreshMs: number) => set({ refreshMs }),
  setState: (state: string) => set({ state }),
  setPaletteOpen: (paletteOpen: boolean) => set({ paletteOpen }),
}));
