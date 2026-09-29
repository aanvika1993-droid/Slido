"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

export function useJoinUrl(code: string) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return { url: origin ? `${origin}/event/${code}` : "", host: origin.replace(/^https?:\/\//, "") };
}

export function JoinQr({ code, size = 96 }: { code: string; size?: number }) {
  const { url } = useJoinUrl(code);
  if (!url) return <div style={{ width: size, height: size }} />;
  return (
    <div className="rounded-lg bg-white p-2">
      <QRCodeSVG value={url} size={size} fgColor="#111827" bgColor="#ffffff" aria-label={`QR code to join event ${code}`} />
    </div>
  );
}
