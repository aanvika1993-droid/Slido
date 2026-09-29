import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-gray-600">The event doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="font-medium text-brand-700 hover:underline">
        Go to my events
      </Link>
    </div>
  );
}
