import { bundledLanguages, bundledThemes } from "shiki";
import { setLanguage, setTheme } from "./editor";
import { ASPECTS, BACKGROUNDS, clampTo, LIMITS, PROJECT_SETTINGS, useSettings, type Settings } from "./settings";
import { allSlides, replaceSlides, type SlideData } from "./slides";

/** Everything needed to recreate a video: its slides and the settings that shape it. */
type Project = {
  version: 1;
  settings: Partial<Pick<Settings, (typeof PROJECT_SETTINGS)[number]>>;
  slides: SlideData[];
};

const LINK_PREFIX = "#project=";
/** Unpacked size limit, so a crafted link can't inflate to gigabytes. */
const MAX_PROJECT_BYTES = 5_000_000;

function currentProject(): Project {
  const settings = useSettings.getState();
  return {
    version: 1,
    settings: Object.fromEntries(PROJECT_SETTINGS.map((key) => [key, settings[key]])),
    slides: allSlides(),
  };
}

export async function openProject(project: Project) {
  const { language, theme, ...rest } = project.settings;
  if (language) await setLanguage(language);
  if (theme) await setTheme(theme);
  useSettings.setState(rest);
  replaceSlides(project.slides);
}

export async function openProjectFile(file: File) {
  let project: Project | null = null;
  try {
    project = readProject(JSON.parse(await file.text()));
  } catch {}
  if (!project) throw new Error(`${file.name} isn't a Syntax Animations project`);
  await openProject(project);
}

export const projectFile = () =>
  new Blob([JSON.stringify(currentProject(), null, 2)], { type: "application/json" });

/** A link that carries the whole project in its hash, so nothing is uploaded. */
export async function shareLink() {
  const stream = new Blob([JSON.stringify(currentProject())]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `${location.origin}${location.pathname}${LINK_PREFIX}${toBase64Url(bytes)}`;
}

export const hasProjectLink = () => location.hash.startsWith(LINK_PREFIX);

/** The project in the current URL, or null if the link is missing or broken. */
export async function projectFromLink() {
  if (!hasProjectLink()) return null;
  try {
    const bytes = fromBase64Url(location.hash.slice(LINK_PREFIX.length));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return readProject(JSON.parse(await readLimited(stream)));
  } catch {
    return null;
  }
}

/** Projects come from files and links anyone can make, so only known, well-typed fields get through. */
function readProject(data: unknown): Project | null {
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.slides) || !isRecord(data.settings)) return null;

  const slides: SlideData[] = [];
  for (const s of data.slides) {
    if (!isRecord(s) || typeof s.code !== "string") return null;
    slides.push({
      code: s.code,
      focus: typeof s.focus === "string" ? s.focus : undefined,
      hold: isNumber(s.hold) ? clampTo(LIMITS.hold, s.hold) : undefined,
    });
  }

  const defaults = useSettings.getState();
  const allowed: Partial<Record<keyof Settings, object>> = {
    language: bundledLanguages,
    theme: bundledThemes,
    aspect: ASPECTS,
    background: BACKGROUNDS,
  };
  const settings: Record<string, unknown> = {};
  for (const key of PROJECT_SETTINGS) {
    let value = data.settings[key];
    if (typeof value !== typeof defaults[key]) continue;
    if (allowed[key] && !Object.hasOwn(allowed[key], value as string)) continue;
    if (typeof value === "number") {
      if (!isNumber(value)) continue;
      if (key in LIMITS) value = clampTo(LIMITS[key as keyof typeof LIMITS], value);
    }
    settings[key] = value;
  }

  return { version: 1, settings: settings as Project["settings"], slides };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

async function readLimited(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    if ((size += chunk.length) > MAX_PROJECT_BYTES) throw new Error("Project is too large");
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
