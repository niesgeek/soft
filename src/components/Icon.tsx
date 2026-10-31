import { useState } from "react";

export function Icon({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const letter = name.trim().charAt(0) || "软";
  if (failed || !src) {
    return (
      <span className="icon-fallback" aria-hidden="true">
        {letter}
      </span>
    );
  }
  return <img src={src} alt="" width={32} height={32} onError={() => setFailed(true)} />;
}
