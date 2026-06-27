import Link from "next/link";
import { Logo, Card } from "@/components/ui";
import { Compass } from "lucide-react";

// 404 page — keeps the brand styling instead of the default Next.js plain text.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <Card className="w-full max-w-sm p-7 text-center animate-fadeUp">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Compass size={22} />
        </div>
        <Logo className="mx-auto" />
        <h1 className="mt-4 text-lg font-bold text-ink">Page not found</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Back to sign in
        </Link>
      </Card>
    </main>
  );
}
