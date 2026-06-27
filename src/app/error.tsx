"use client";

import { useEffect } from "react";
import { Logo, Button, Card } from "@/components/ui";
import { AlertTriangle } from "lucide-react";

// Route-level error boundary. Catches render/data errors in any page and shows a
// friendly recovery screen instead of a blank crash. Errors are logged so they
// surface in the browser console (and any attached client error tracker).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app:error-boundary]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <Card className="w-full max-w-sm p-7 text-center animate-fadeUp">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle size={22} />
        </div>
        <Logo className="mx-auto" />
        <h1 className="mt-4 text-lg font-bold text-ink">Something went wrong</h1>
        <p className="mt-1 text-sm text-ink-muted">
          We hit an unexpected error. You can try again, and if it keeps
          happening, refresh the page.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </Card>
    </main>
  );
}
