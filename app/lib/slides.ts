import LocalForage from "localforage";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { create } from "zustand";
import { editor } from "./editor";
import { useSettings } from "./settings";

export type SlideID = string;

/** Slide code lives in Monaco models; this only tracks which slides exist and which is open. */
export const useSlides = create<{ order: SlideID[]; active: SlideID }>(() => ({ order: [], active: "" }));

export const slidePath = (id: SlideID) => `file://${id}/`;

function slideModel(id: SlideID) {
  const { monaco } = editor();
  const model = monaco.editor.getModel(monaco.Uri.parse(slidePath(id)));
  if (!model) throw new Error(`No model for slide ${id}`);
  return model;
}

export const slideCode = (id: SlideID) => slideModel(id).getValue();

export const allSlideCode = () => useSlides.getState().order.map(slideCode);

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

function append(id: SlideID) {
  useSlides.setState((s) => ({ order: [...s.order, id], active: id }));
}

export const addSlide = () => append(createSlide());

export const duplicateSlide = (from: SlideID) => append(createSlide(slideCode(from)));

export function removeSlide(id: SlideID) {
  const { order, active } = useSlides.getState();
  if (order.length <= 1) return;
  const index = order.indexOf(id);
  const next = order.filter((s) => s !== id);
  useSlides.setState({ order: next, active: active === id ? next[Math.max(0, index - 1)] : active });
  slideModel(id).dispose();
}

export const selectSlide = (id: SlideID) => useSlides.setState({ active: id });

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

type SavedSlides = Record<SlideID, { code: string }>;

export async function loadSlides() {
  const order = (await project().getItem<SlideID[]>("order")) ?? [];
  const saved = (await project().getItem<SavedSlides>("slides")) ?? {};

  const ids = order.filter((id) => saved[id]).map((id) => createSlide(saved[id].code, id));
  if (ids.length === 0) ids.push(createSlide());
  useSlides.setState({ order: ids, active: ids[0] });

  useSlides.subscribe((s, prev) => s.order !== prev.order && scheduleSave());
  window.addEventListener("beforeunload", () => void saveSlides());
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
    const slides: SavedSlides = Object.fromEntries(order.map((id) => [id, { code: slideCode(id) }]));
    await project().setItem("order", order);
    await project().setItem("slides", slides);
  } catch (e) {
    toast(`Couldn't save the project: ${e instanceof Error ? e.message : e}`);
  } finally {
    useSaving.setState({ saving: false });
  }
}
