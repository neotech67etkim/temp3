"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 대시보드처럼 여러 과를 한눈에 모아 보는 화면에서, 다른 사람이 저장한
 * 최신 내용이 자동으로 반영되도록 주기적으로 화면을 새로고침한다.
 * (조회는 잠금과 무관하게 항상 최신 파일을 읽어오므로, 그냥 다시 불러오기만
 * 하면 된다 - 별도의 "변경 감지" 없이도 매번 최신 상태가 나온다.)
 */
export function AutoRefresh({ intervalSeconds = 60 }: { intervalSeconds?: number }) {
  const router = useRouter();
  // 서버 렌더링 시점과 클라이언트 시점의 시각이 달라 하이드레이션 불일치가
  // 나지 않도록, 실제 시각은 interval이 최초로 한 번 돈 뒤부터만 표시한다.
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setLastRefreshed(new Date().toLocaleTimeString("ko-KR"));
    }, intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [router, intervalSeconds]);

  return (
    <p className="text-xs text-slate-400">
      {lastRefreshed ? `자동 새로고침 · 마지막 업데이트 ${lastRefreshed}` : "자동 새로고침 활성화됨"}
    </p>
  );
}
