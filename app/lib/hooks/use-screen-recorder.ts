import { useCallback, useRef } from "react";

type UseScreenRecorderOptions = {
  mimeType?: string;
  videoBitsPerSecond?: number;
};

export function useScreenRecorder(options?: UseScreenRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const start = useCallback(
    async (ref: React.RefObject<HTMLElement | null>) => {
      try {
        const output = ref.current!;

        if (!output) throw new Error("Ref element not found");

        output!.style.cursor = "none";

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

  const stop = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    const output = ref.current!;

    if (output) output!.style.cursor = "unset";

    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }, []);

  return { start, stop };
}
