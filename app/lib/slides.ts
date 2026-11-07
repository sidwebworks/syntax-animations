import LocalForage from "localforage";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { create } from "zustand";
import { editor } from "./editor";
import { useSettings } from "./settings";

export type SlideID = string;

type SlideOptions = {
  /** Lines to keep bright, like `3-5, 8`. Empty focuses everything. */
  focus?: string;
  /** Seconds this slide stays on screen, instead of the global setting. */
  hold?: number;
};

/** A slide as it's saved and shared. */
export type SlideData = SlideOptions & { code: string };

/** Slide code lives in Monaco models; this tracks which slides exist, their options and which is open. */
export const useSlides = create<{ order: SlideID[]; active: SlideID; options: Record<SlideID, SlideOptions> }>(() => ({
  order: [],
  active: "",
  options: {},
}));

export const slidePath = (id: SlideID) => `file://${id}/`;

function slideModel(id: SlideID) {
  const { monaco } = editor();
  const model = monaco.editor.getModel(monaco.Uri.parse(slidePath(id)));
  if (!model) throw new Error(`No model for slide ${id}`);
  return model;
}

export const slideCode = (id: SlideID) => slideModel(id).getValue();

export function allSlides(): SlideData[] {
  const { order, options } = useSlides.getState();
  return order.map((id) => ({ ...options[id], code: slideCode(id) }));
}

export const setSlideOptions = (id: SlideID, patch: SlideOptions) =>
  useSlides.setState((s) => ({ options: { ...s.options, [id]: { ...s.options[id], ...patch } } }));

/** `"3-5, 8"` as 1-based inclusive ranges. Anything unreadable is ignored. */
export function parseLineRanges(text = ""): [number, number][] {
  return text.split(",").flatMap((part) => {
    const [a, b = a] = part.split("-").map((n) => Number.parseInt(n.trim(), 10));
    return a > 0 && b >= a ? [[a, Math.min(b, 2 ** 31)] as [number, number]] : [];
  });
}

/** Calls `onChange` with the new code after every edit. Returns an unsubscribe function. */
export function watchSlide(id: SlideID, onChange: (code: string) => void) {
  const model = slideModel(id);
  const sub = model.onDidChangeContent(() => onChange(model.getValue()));
  return () => sub.dispose();
}

function createSlide(code = "", id = nanoid()) {
  const { monaco } = editor();
  const model = monaco.editor.createModel(code, useSettings.getState().language, monaco.Uri.parse(slidePath(id)));
  model.onDidChangeContent(scheduleSave);
  return id;
}

function append(id: SlideID, options: SlideOptions = {}) {
  useSlides.setState((s) => ({ order: [...s.order, id], active: id, options: { ...s.options, [id]: options } }));
}

export const addSlide = () => append(createSlide());

export const duplicateSlide = (from: SlideID) => append(createSlide(slideCode(from)), useSlides.getState().options[from]);

export function removeSlide(id: SlideID) {
  const { order, active } = useSlides.getState();
  if (order.length <= 1) return;
  const index = order.indexOf(id);
  const next = order.filter((s) => s !== id);
  const { [id]: _, ...options } = useSlides.getState().options;
  useSlides.setState({ order: next, active: active === id ? next[Math.max(0, index - 1)] : active, options });
  slideModel(id).dispose();
}

export const selectSlide = (id: SlideID) => useSlides.setState({ active: id });

/** The open slide's 1-based position. */
export const useFrameNumber = () => useSlides((s) => s.order.indexOf(s.active) + 1);

/** Moves `id` to where `to` is now, shifting the rest. */
export function moveSlide(id: SlideID, to: SlideID) {
  const order = [...useSlides.getState().order];
  const target = order.indexOf(to);
  order.splice(target, 0, ...order.splice(order.indexOf(id), 1));
  useSlides.setState({ order });
}

let db: LocalForage | undefined;
// One store per origin, so previews on other hostnames don't share projects.
const project = () => (db ??= LocalForage.createInstance({ name: "project_data", storeName: location.hostname }));

type SavedSlides = Record<SlideID, SlideData>;

export async function loadSlides() {
  const order = (await project().getItem<SlideID[]>("order")) ?? [];
  const saved = (await project().getItem<SavedSlides>("slides")) ?? {};
  const kept = order.filter((id) => saved[id]);
  replaceSlides(kept.map((id) => saved[id]), kept);

  useSlides.subscribe((s, prev) => (s.order !== prev.order || s.options !== prev.options) && scheduleSave());
  window.addEventListener("beforeunload", () => void saveSlides());
}

/** Swaps every slide for `slides`, keeping `ids` when given. */
export function replaceSlides(slides: SlideData[], ids: SlideID[] = []) {
  for (const id of useSlides.getState().order) slideModel(id).dispose();
  const order = slides.map((s, i) => createSlide(s.code, ids[i]));
  if (order.length === 0) order.push(createSlide());
  const options = Object.fromEntries(slides.map(({ code, ...rest }, i) => [order[i], rest]));
  useSlides.setState({ order, active: order[0], options });
}

export const useSaving = create<{ saving: boolean }>(() => ({ saving: false }));

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSlides, 500);
}

export async function saveSlides() {
  clearTimeout(saveTimer);
  useSaving.setState({ saving: true });
  try {
    const { order } = useSlides.getState();
    const all = allSlides();
    const slides: SavedSlides = Object.fromEntries(order.map((id, i) => [id, all[i]]));
    await project().setItem("order", order);
    await project().setItem("slides", slides);
  } catch (e) {
    toast(`Couldn't save the project: ${e instanceof Error ? e.message : e}`);
  } finally {
    useSaving.setState({ saving: false });
  }
}
