import { shikiToMonaco } from "@shikijs/monaco";
import "shiki-magic-move/dist/style.css";
import { toast } from "sonner";
import { getTextmateGrammar, getTextmateTheme } from "./api";
import { EditorStatus, useEditorStore, type TSettingsState } from "./store";
import { withCache } from "./utils";

export const useSyntaxHighlighter = () => {
  const editor = useEditorStore();
  const highlighter = editor.highlighter!;
  const monaco = editor.monaco!;

  const setLanguage = async (value: TSettingsState["language"]) => {
    try {
      const data = await withCache(`textmate_lang_${value}`, async () => {
        editor.setStatus(EditorStatus.LoadingGrammar);
        const grammar = await getTextmateGrammar(value);
        editor.setStatus(EditorStatus.Idle);
        return grammar;
      });
      highlighter.loadLanguageSync(data);
      monaco.languages.register({ id: value });
      shikiToMonaco(highlighter, monaco);
      monaco.editor.getModels().map((m) => monaco.editor.setModelLanguage(m, value));
    } catch (error: any) {
      toast(`Failed to load language - ${value}`);
    }
  };

  const setTheme = async (value: TSettingsState["theme"]) => {
    try {
      const data = await withCache(`textmate_theme_${value}`, async () => {
        editor.setStatus(EditorStatus.LoadingTheme);
        const theme = await getTextmateTheme(value);
        editor.setStatus(EditorStatus.Idle);
        return theme;
      });
      highlighter.loadThemeSync(data);
      shikiToMonaco(highlighter, monaco);
    } catch (error: any) {
      toast(`Failed to load theme - ${value}`);
    }
  };

  return { setLanguage, setTheme };
};

import { useCallback, useRef } from "react";

type UseScreenRecorderOptions = {
  mimeType?: string;
  videoBitsPerSecond?: number;
};

export function useScreenRecorder(options?: UseScreenRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = useCallback(
    async (ref: React.RefObject<HTMLElement | null>) => {
      try {
        const output = ref.current!;

        if (!output) throw new Error("Ref element not found");

        output.parentElement!.style.cursor = "none";

        // Get display media
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "window",
            frameRate: 60,
          },
          preferCurrentTab: true,
          audio: false,
        });

        const [track] = stream.getVideoTracks();

        // Apply restriction and cropping
        const restrictionTarget = await RestrictionTarget.fromElement(output);
        await track.restrictTo(restrictionTarget);
        const cropTarget = await CropTarget.fromElement(output);
        await track.cropTo(cropTarget);

        // Prepare to record
        const chunks: BlobPart[] = [];
        chunksRef.current = chunks;

        const recorder = new MediaRecorder(stream, {
          mimeType: options?.mimeType ?? "video/webm;codecs=vp9",
          videoBitsPerSecond: options?.videoBitsPerSecond ?? 10_000_000,
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = (e) => track.stop();

        recorder.addEventListener("stop", (ev) => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);

          // Trigger download
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = "screen-recording.webm";
          document.body.appendChild(a);
          a.click();

          // Clean up
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        });

        const promise = new Promise((resolve, reject) => {
          recorder.addEventListener("start", (ev) => resolve(ev));
          recorder.addEventListener("error", (ev) => reject(ev));
        });

        mediaRecorderRef.current = recorder;
        recorder.start();
        return promise;
      } catch (err) {
        console.error("Screen recording error:", err);
      }
    },
    [options]
  );

  const stopRecording = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    const output = ref.current!;

    if (output) output.parentElement!.style.cursor = "unset";

    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }, []);

  return { startRecording, stopRecording };
}
