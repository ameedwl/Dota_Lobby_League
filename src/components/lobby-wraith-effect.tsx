"use client";
import {useMatchTribute} from "@/components/events/match-tribute";
import {useBirthdayEvent} from "@/components/events/birthday-event";
import { useEffect, useRef } from "react";
import { startWraith } from "@/lib/wraith-controller";

export function LobbyWraithEffect() {
  const {active,intro}=useBirthdayEvent();
  const {intro:tributeIntro}=useMatchTribute();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current&&!intro&&!tributeIntro) return startWraith(canvas.current, window, document,{birthday:active});
  }, [active,intro,tributeIntro]);
  return <canvas ref={canvas} className="lobby-wraith-effect" aria-hidden="true" tabIndex={-1}/>;
}
