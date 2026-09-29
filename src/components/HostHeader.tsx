"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">P</span>
      Pulse
    </Link>
  );
}

export function HostHeader({ userName, children }: { userName?: string; children?: ReactNode }) {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Logo />
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        {userName && (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="hidden text-gray-600 hover:text-gray-900 sm:inline">
              My events
            </Link>
            <span className="hidden text-gray-400 sm:inline">|</span>
            <span className="hidden text-gray-700 md:inline">{userName}</span>
            <button onClick={logout} className="text-gray-600 hover:text-gray-900">
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
