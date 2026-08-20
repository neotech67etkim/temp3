"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 20 * 1000;

/**
 * Nav를 주기적으로 새로고침한다. 로그인한 모든 화면에 항상 떠 있으며,
 * 두 가지를 화면 이동 없이도 곧바로 알 수 있게 한다:
 * - 편집 중인 사람: 다른 사람이 "편집 시작"을 시도했다가 막혀 대기자로
 *   등록된 것.
 * - 편집을 기다리는 사람: 응답 없던 잠금이 10분 뒤 자동으로 해제 대상이
 *   되거나, 편집하던 사람이 저장하고 종료해서 이제 편집이 가능해진 것.
 *   (잠금 재사용 자체는 실제로 "편집 시작"을 눌러야 이뤄지지만, 최소한
 *   버튼이 다시 눌리는 상태로 바뀌었다는 건 새로고침 없이도 알 수 있다.)
 * 화면에는 아무것도 그리지 않는다(IdleAutoEndSession과 같은 패턴).
 */
export function EditSessionPoller() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
