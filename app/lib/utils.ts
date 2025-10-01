import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { httpCache } from "./cache";
import { EditorStatus } from "./store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const withCache = async <T>(key: string, fn: () => T | Promise<T>) => {
  const existing = await httpCache.getItem(key);

  if (existing) return existing;

  const result = await fn();
  httpCache.setItem(key, result);

  return result;
};

export const APP_TEXT_MAPPING = {
  status: {
    [EditorStatus.Error]: "error occured",
    [EditorStatus.Animating]: "animating",
    [EditorStatus.Idle]: "idle",
    [EditorStatus.LoadingGrammar]: "loading grammar",
    [EditorStatus.LoadingTheme]: "loading theme",
  },
};

export const sleep = (time: number) => new Promise((r) => setTimeout(r, time));
