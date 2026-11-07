import type { BundledLanguage, BundledTheme } from "shiki";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Gradient stops for the area around the code. `theme` uses the theme's background. */
export const BACKGROUNDS = {
  theme: [],
  midnight: ["#0f172a", "#312e81"],
  ocean: ["#0ea5e9", "#6366f1"],
  sunset: ["#f97316", "#db2777"],
  forest: ["#065f46", "#0f766e"],
  graphite: ["#18181b", "#52525b"],
} satisfies Record<string, string[]>;

export const ASPECTS = { auto: null, "16:9": 16 / 9, "1:1": 1, "4:5": 4 / 5, "9:16": 9 / 16 } satisfies Record<
  string,
  number | null
>;

/** Allowed ranges for numeric settings, shared by the settings UI and project import. */
export const LIMITS = {
  slideInterval: { min: 0, max: 60 },
  transition: { min: 0.1, max: 10 },
  stagger: { min: 0, max: 1 },
  padding: { min: 0, max: 400 },
  /** Per-slide hold override. */
  hold: { min: 0, max: 60 },
};

export const clampTo = (limit: { min: number; max: number }, n: number) => Math.min(limit.max, Math.max(limit.min, n));

export type Settings = {
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
  /** Type new code in with a cursor instead of fading it in. */
  typing: boolean;

  aspect: keyof typeof ASPECTS;
  background: keyof typeof BACKGROUNDS;
  /** Pixels between the code window and the edge of the video. */
  padding: number;
  windowChrome: boolean;
  title: string;

  /** Short side of the exported video, in pixels. */
  resolution: 720 | 1080 | 2160;
  fps: 30 | 60;
  format: "mp4" | "webm";
};

/** Settings that describe the video itself, so they travel with a shared project. */
export const PROJECT_SETTINGS = [
  "language",
  "theme",
  "slideInterval",
  "transition",
  "stagger",
  "lineNumbers",
  "typing",
  "aspect",
  "background",
  "padding",
  "windowChrome",
  "title",
] as const satisfies (keyof Settings)[];

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
      typing: false,

      aspect: "auto",
      background: "theme",
      padding: 48,
      windowChrome: false,
      title: "",

      resolution: 1080,
      fps: 60,
      format: "mp4",

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
