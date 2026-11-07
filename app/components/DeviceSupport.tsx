import { ChromeIcon } from "lucide-react";
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
} from "~/components/ui/alert-dialog";
import { Button } from "./ui/button";

export function DeviceSupportDialog(props: { supported: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      setOpen(!props.supported || window.innerWidth < 768);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [props.supported]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogOverlay className="backdrop-blur-[1px]" />
      <AlertDialogContent className="items-center">
        <AlertDialogHeader>
          <AlertDialogTitle>{props.supported ? "Screen too small" : "Unsupported browser"}</AlertDialogTitle>
          <AlertDialogDescription>
            {props.supported
              ? "The editor needs a desktop-sized window."
              : "This app renders video with WebCodecs and WebAssembly, which this browser doesn't support. Please use a recent desktop version of Chrome, Edge, Safari or Firefox."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!props.supported && (
        <AlertDialogFooter className="mt-4 grid">
          <Button className="px-16 py-7 rounded-full" size="lg" variant={"outline"} asChild>
            <Link to="https://www.google.com/chrome/" rel="noreferrer noopener">
              Get Chrome <ChromeIcon className="size-6 stroke-1" />
            </Link>
          </Button>
        </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
