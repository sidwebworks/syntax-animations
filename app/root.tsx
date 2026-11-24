import { createRootRoute, Outlet, type ErrorComponentProps } from "@tanstack/react-router";
import "./app.css";
import { Toaster } from "./components/ui/sonner";

export const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
  errorComponent: ErrorBoundary,
  notFoundComponent: () => <ErrorPage message="404" details="The requested page could not be found." />,
});

function ErrorBoundary({ error }: ErrorComponentProps) {
  const dev = import.meta.env.DEV && error instanceof Error;
  return <ErrorPage message="Oops!" details={dev ? error.message : "An unexpected error occurred."} stack={dev ? error.stack : undefined} />;
}

function ErrorPage({ message, details, stack }: { message: string; details: string; stack?: string }) {
  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
