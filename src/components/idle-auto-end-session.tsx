"use client";

import { useEffect, useRef } from "react";
import { endEditSession } from "@/actions/context";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 편집 모드에서 10분간 아무 입력(마우스/키보드/스크롤/터치)이 없으면
 * 자동으로 저장하고 편집을 종료한다. 개별 작업은 이미 그때그때 NAS
 * 원본에 즉시 반영되므로(즉시 저장 기능), 자동 종료가 데이터를 잃게
 * 만들지는 않는다 - 그냥 자리를 비운 사이 잠금을 계속 붙잡고 있어서
 * 다른 사람이 그 과를 편집 못 하는 상황을 막아주는 안전장치다.
 *
 * 숨김 <form>을 실제 "저장하고 종료" 버튼과 똑같은 방식(action={endEditSession})으로
 * 두고 타이머가 끝나면 requestSubmit()으로 진짜 제출을 흉내낸다 - 서버
 * 액션을 클라이언트 코드에서 직접 호출하는 것보다 리다이렉트 처리가
 * 확실히 보장된다.
 */
export function IdleAutoEndSession() {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        formRef.current?.requestSubmit();
      }, IDLE_TIMEOUT_MS);
    }

    resetTimer();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, []);

  return (
    <form ref={formRef} action={endEditSession} className="hidden">
      <input type="hidden" name="mode" value="save" />
    </form>
  );
}
