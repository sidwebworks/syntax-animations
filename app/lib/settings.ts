import type { BundledLanguage, BundledTheme } from "shiki";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Settings = {
  enablePreviewPanel: boolean;
  enableSlidesPanel: boolean;

  language: BundledLanguage;
  theme: BundledTheme;

  /** Seconds each slide stays on screen. */
  slideInterval: number;
  /** Seconds each transition takes. */
  transition: number;
  stagger: number;
  lineNumbers: boolean;
};

type Actions = {
  onSettingChange: <K extends keyof Settings>(name: K, value: Settings[K]) => void;
};

export const useSettings = create(
  persist<Settings & Actions>(
    (set) => ({
      enablePreviewPanel: true,
      enableSlidesPanel: true,

      language: "typescript",
      theme: "catppuccin-mocha",

      slideInterval: 2,
      transition: 0.8,
      stagger: 0.3,
      lineNumbers: true,

      onSettingChange: (name, value) => set({ [name]: value }),
    }),
    {
      name: "settings",
      version: 1,
      // v0 kept animation settings in milliseconds under `moveOptions`.
      migrate: (persisted, version) => {
        if (version > 0) return persisted as Settings & Actions;
        const { moveOptions, enableRenderPanel, enableSettingsDialog, ...rest } = persisted as Record<string, any>;
        return {
          ...rest,
          slideInterval: (moveOptions?.slideInterval ?? 2000) / 1000,
          transition: (moveOptions?.duration ?? 800) / 1000,
          stagger: moveOptions?.stagger ?? 0.3,
          lineNumbers: moveOptions?.lineNumbers ?? true,
        } as Settings & Actions;
      },
    }
  )
);
