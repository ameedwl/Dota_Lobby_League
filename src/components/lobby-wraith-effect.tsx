"use client";
import { useEffect, useRef } from "react";
import { startWraith } from "@/lib/wraith-controller";

export function LobbyWraithEffect() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) return startWraith(canvas.current, window, document);
  }, []);
  return <canvas ref={canvas} className="lobby-wraith-effect" aria-hidden="true" tabIndex={-1}/>;
}
