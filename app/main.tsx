import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { rootRoute } from "./root";
import { indexRoute } from "./routes/index";

// Show the loading spinner straight away while the index loader boots the editor.
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]), defaultPendingMs: 0, defaultPendingMinMs: 0 });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
