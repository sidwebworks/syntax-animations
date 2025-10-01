import { loader, type Monaco } from "@monaco-editor/react";
import {
  createHighlighter,
  createOnigurumaEngine,
  type BundledLanguage,
  type BundledTheme,
  type HighlighterCore,
} from "shiki";

import { shikiToMonaco } from "@shikijs/monaco";
import type { editor } from "monaco-editor";
import { nanoid } from "nanoid";
import { devtools, persist } from "zustand/middleware";
import { create } from "zustand/react";
import { projectData, ProjectDataKeys, type DehydratedSlides } from "./cache";
import type { MoveOptions } from "./types";

/**
 ** Editor Store
 */
export enum EditorStatus {
  Animating,
  LoadingTheme,
  LoadingGrammar,
  Error,
  Idle,
  Saving,
}

export type TEditorState = {
  status: EditorStatus;

  highlighter?: HighlighterCore;
  monaco?: Monaco;
};

export type TEditorActions = {
  setStatus: (status: EditorStatus) => void;
};

export const useEditorStore = create<TEditorState & TEditorActions>((set, get) => ({
  status: EditorStatus.Idle,
  setStatus: (status) => set({ status }),
}));

/**
 ** Settings Store
 */
export type TSettingsState = {
  enablePreviewPanel: boolean;
  enableSlidesPanel: boolean;
  enableRenderPanel: boolean;
  enableSettingsDialog: boolean;

  language: BundledLanguage;
  theme: BundledTheme;

  moveOptions: MoveOptions & {
    slideInterval: number;
  };
};

export type TSettingsActions = {
  onSettingChange: <K extends keyof TSettingsState>(name: K, value: TSettingsState[K]) => void;
};

export const useSettingsStore = create(
  persist<TSettingsState & TSettingsActions>(
    (set) => ({
      // UI Flags
      enablePreviewPanel: true,
      enableRenderPanel: false,
      enableSlidesPanel: true,
      enableSettingsDialog: false,

      // Settings
      language: "typescript",
      theme: "catppuccin-mocha",

      moveOptions: {
        slideInterval: 2000,
        duration: 800,
        stagger: 0.3,
        lineNumbers: true,
        enhanceMatching: true,
        animateContainer: true,
      },

      onSettingChange: (name, value) => set({ [name]: value }),
    }),
    {
      name: "settings",
      partialize(state) {
        return { ...state, enableRenderPanel: false };
      },
    }
  )
);

export type SlideID = string;
export type TimelineSlide = { id: SlideID; uri: string };

export type TimelineState = {
  active: SlideID;
  order: SlideID[];
  slides: Record<SlideID, TimelineSlide>;
};

export type TimelineActions = {
  add: () => void;
  duplicate: (id: SlideID) => void;
  remove: (id: SlideID) => void;
  hydrate: () => Promise<void>;
  save: () => Promise<void>;
};

export const useTimelineStore = create(
  devtools<TimelineState & TimelineActions>((set, get) => ({
    active: "",
    order: [],
    slides: {},
    add: () => {
      const { language } = useSettingsStore.getState();
      const { monaco } = useEditorStore.getState();
      const { slides, order } = get();

      if (!monaco) return;

      const lastID = order.at(-1)!;

      const id = nanoid();
      let model: editor.ITextModel;

      // Determine model creation strategy based on whether it's the first slide or not
      if (order.length === 0) {
        model = monaco.editor.createModel("", language, monaco.Uri.parse(`file://${id}/`));
      } else {
        const item = slides[lastID];
        const existing = monaco.editor.getModel(monaco.Uri.parse(item.uri));
        if (!existing) return;
        model = monaco.editor.createModel("", existing.getLanguageId(), monaco.Uri.parse(`file://${id}/`));
      }

      const slide: TimelineSlide = {
        id,
        uri: model.uri.toString(),
      };

      set({
        active: id,
        slides: {
          ...slides,
          [id]: slide,
        },
        order: [...order, id],
      });
    },
    remove: (id) => {
      const { monaco } = useEditorStore.getState();

      if (!monaco) return;

      const { slides, order } = get();

      const found = slides[id];

      if (!found) return;

      const existing = monaco.editor.getModel(monaco.Uri.parse(found.uri));

      if (!existing) return;

      const nextOrder = order.filter((el) => el !== id);
      const nextSlides = { ...slides };
      delete nextSlides[id];

      const active = nextOrder.at(-1);

      set({
        active,
        order: nextOrder,
        slides: nextSlides,
      });

      existing.dispose();
    },
    duplicate: (from) => {
      const { monaco } = useEditorStore.getState();
      const { slides, order } = get();

      if (!monaco) return;

      const item = slides[from];
      const existing = monaco.editor.getModel(monaco.Uri.parse(item.uri));

      if (!existing) return;

      const id = nanoid();

      const model = monaco.editor.createModel(
        existing.getValue(),
        existing.getLanguageId(),
        monaco.Uri.parse(`file://${id}/`)
      );

      const slide: TimelineSlide = {
        id,
        uri: model.uri.toString(),
      };

      set({
        active: slide.id,
        slides: {
          ...slides,
          [slide.id]: slide,
        },
        order: [...order, slide.id],
      });
    },
    hydrate: async () => {
      const { monaco } = useEditorStore.getState();

      if (!monaco) return;

      const order = (await projectData.getItem<SlideID[]>(ProjectDataKeys.Order)) ?? [];
      const slides = (await projectData.getItem<DehydratedSlides>(ProjectDataKeys.Slides)) ?? {};
      const settings = useSettingsStore.getState();
      for (const id of order) {
        const slide = slides[id];

        if (!slide) {
          console.warn("Failed to hydrate slide");
          continue;
        }

        const uri = monaco.Uri.parse(slide.uri);

        if (!monaco.editor.getModel(uri)) {
          monaco.editor.createModel(slide.code, settings.language, uri);
        }
      }

      set({ order, slides, active: order[0] });
    },
    save: async () => {
      const { monaco } = useEditorStore.getState();

      if (!monaco) return;

      const { slides, order } = get();

      const dehydrated: DehydratedSlides = {};

      for (const id of order) {
        const slide = slides[id];

        const model = monaco.editor.getModel(monaco.Uri.parse(slide.uri));

        if (!model) {
          console.warn("failed to get slide model");
          continue;
        }

        dehydrated[id] = {
          id,
          uri: model.uri.toString(),
          code: model.getValue(),
        };
      }

      await projectData.setItem(ProjectDataKeys.Order, order);
      await projectData.setItem(ProjectDataKeys.Slides, dehydrated);
    },
  }))
);

export const setup = async () => {
  loader.config({
    paths: {
      vs: "https://unpkg.com/monaco-editor@0.52.0/min/vs",
    },
  });

  let timeline = useTimelineStore.getState();
  const settings = useSettingsStore.getState();

  const [monaco, highlighter] = await Promise.all([
    loader.init(),
    createHighlighter({
      langs: [settings.language],
      themes: [settings.theme],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    }),
  ]);

  // Register the languageIds first. Only registered languages will be highlighted.
  monaco.languages.register({ id: settings.language });

  shikiToMonaco(highlighter, monaco);

  useEditorStore.setState({
    highlighter,
    monaco,
  });

  await timeline.hydrate();

  timeline = useTimelineStore.getState();

  if (timeline.order.length < 1) {
    timeline.add();
  }
};
