"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/[^0-9]/g, "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) router.push(`/event/${clean}`);
      }}
      className="flex w-full max-w-md overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"
    >
      <span className="flex items-center pl-4 text-lg text-gray-400">#</span>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        placeholder="Enter event code"
        aria-label="Event code"
        className="min-w-0 flex-1 px-2 py-3 text-lg outline-none"
      />
      <Button type="submit" className="m-1.5" disabled={!clean}>
        Join
      </Button>
    </form>
  );
}
