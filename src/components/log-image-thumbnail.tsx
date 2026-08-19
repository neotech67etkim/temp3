"use client";

import { useState } from "react";

/**
 * Electron 앱에는 target="_blank"로 새 창을 띄워줄 핸들러가 없어서
 * (setWindowOpenHandler 미설정) 새 창이 안 뜨거나 빈 창만 뜬다. 그래서
 * 새 창 링크 대신, 같은 화면 안에서 확대해서 보여주는 라이트박스로
 * 대체한다(브라우저/Electron 어디서든 동일하게 동작).
 *
 * 이 컴포넌트만 별도 클라이언트 컴포넌트로 분리한 이유: 목록 전체를
 * 클라이언트 컴포넌트로 만들면 Date.toLocaleString() 같은 로케일 의존
 * 포맷팅이 서버(SSR)와 클라이언트(hydration)에서 다시 실행되면서 결과가
 * 미묘하게 달라져 hydration mismatch(React #418)가 날 수 있다. 이미지
 * 경로(문자열)만 받는 이 작은 컴포넌트만 클라이언트로 두면 그 위험이 없다.
 */
export function LogImageThumbnail({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 block cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="첨부 스크린샷"
          className="max-h-64 rounded-md border border-slate-200"
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            닫기 ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="첨부 스크린샷 확대"
            className="max-h-full max-w-full rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
