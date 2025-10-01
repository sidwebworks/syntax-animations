"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogOverlay,
} from "~/components/ui/alert-dialog"; // Adjust path as needed
import { useEffect, useState } from "react";
import { ChromeIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "react-router";

export function MobileUnsupportedDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const isMobileScreen = window.innerWidth < 768; // Tailwind `md` breakpoint
      setOpen(isMobileScreen);
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
          <AlertDialogTitle>Unsupported Device</AlertDialogTitle>
          <AlertDialogDescription>
            This app requires browser APIs that are not available on most mobile browsers (e.g. pointer lock, screen
            capture, or crop-to-target). Please use a desktop browser based on Chromium for the best experience.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button className="max-w-max mx-auto py-8 mt-2 px-10 rounded-full" size="lg" variant={"outline"} asChild>
            <Link
              to="https://www.chromium.org/chromium-os/developer-library/getting-started/build-chromium/"
              rel="noreferrer noopener"
            >
              Get Chromium <ChromeIcon className="size-8 stroke-1" />
            </Link>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
