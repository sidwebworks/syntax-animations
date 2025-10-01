import LocalForage from "localforage";
import type { SlideID, TimelineSlide } from "./store";

export const httpCache = LocalForage.createInstance({
  name: "http_cache",
});

export enum ProjectDataKeys {
  Order = "order",
  Slides = "slides",
}

export type DehydratedSlides = Record<SlideID, TimelineSlide & { code: string }>;

export const projectData = LocalForage.createInstance({
  name: "project_data",
});
