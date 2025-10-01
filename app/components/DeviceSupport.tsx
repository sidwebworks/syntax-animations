import { useIsomorphicLayoutEffect } from "@dnd-kit/utilities";
import { ChromeIcon, Hammer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"; // Adjust path as needed
import { getRequiredBrowserFeatures } from "~/lib/utils";
import { Button } from "./ui/button";

export function DeviceSupportDialog() {
  const [open, setOpen] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const check = () => {
      const features = getRequiredBrowserFeatures();
      const supported = features.every((r) => {
        const type = typeof r[0];
        return type === r[1];
      });

      setOpen(!supported || window.innerWidth < 768);
    };

    check(); // Initial check

    // Optional: Re-check on resize
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogOverlay className="backdrop-blur-xs" />
      <AlertDialogContent className="items-center">
        <AlertDialogHeader>
          <AlertDialogTitle>Unsupported Browser</AlertDialogTitle>
          <AlertDialogDescription>
            This app requires browser APIs that are not available on some browsers (e.g. screen capture or
            crop-to-target). Please use a desktop browser based on Chromium for the best experience.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-4 grid sm:grid-cols-2">
          <Button className="px-16 py-7 rounded-full" size="lg" variant={"outline"} asChild>
            <Link to="https://chromeenterprise.google/" rel="noreferrer noopener">
              Get Chrome <ChromeIcon className="size-6 stroke-1" />
            </Link>
          </Button>

          <Button className="px-16 py-7 rounded-full" size="lg" variant={"outline"} asChild>
            <Link
              to="https://www.chromium.org/chromium-os/developer-library/getting-started/build-chromium/"
              rel="noreferrer noopener"
            >
              Build from source <Hammer className="size-6 stroke-1" />
            </Link>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
