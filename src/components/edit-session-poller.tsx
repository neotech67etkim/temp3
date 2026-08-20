"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 20 * 1000;

/**
 * 편집 중인 동안 Nav를 주기적으로 새로고침해서, 다른 사람이 "편집 시작"을
 * 시도했다가 막혀 대기자로 등록된 걸 화면 이동 없이도 곧바로 알 수 있게
 * 한다. 화면에는 아무것도 그리지 않는다(IdleAutoEndSession과 같은 패턴).
 */
export function EditSessionPoller() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
