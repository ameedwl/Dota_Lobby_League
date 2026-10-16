"use client";
import {useBirthdayEvent} from "@/components/events/birthday-event";
import { useEffect, useRef } from "react";
import { startWraith } from "@/lib/wraith-controller";

export function LobbyWraithEffect() {
  const {active,intro}=useBirthdayEvent();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current&&!intro) return startWraith(canvas.current, window, document,{birthday:active});
  }, [active,intro]);
  return <canvas ref={canvas} className="lobby-wraith-effect" aria-hidden="true" tabIndex={-1}/>;
}
