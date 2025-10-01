import { ChromeIcon, Hammer } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button } from "./ui/button";

export function DeviceSupportDialog(props: { supported: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      setOpen(!props.supported || window.innerWidth < 768);
    };

    check(); // Initial check

    // Optional: Re-check on resize
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [props.supported]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogOverlay className="backdrop-blur-[1px]" />
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
