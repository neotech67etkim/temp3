"use client";

/**
 * 프로그램을 새 버전으로 재설치/재빌드한 직후에도 창을 닫지 않고 그대로
 * 쓰고 있으면, 화면(브라우저)은 옛 버전 JS를 들고 있는데 서버 쪽 코드/버전은
 * 이미 새 것이라 맞물리지 않는 경우가 있다("Failed to find Server Action",
 * "ChunkLoadError", 알 수 없는 "Minified React error #..." 등으로 나타남).
 * 이런 경우 React의 reset()(그 화면만 다시 그리기)은 옛 JS를 그대로 재사용해서
 * 똑같은 에러가 반복된다 - 창을 새로고침해서 지금 서버가 주는 새 JS를 다시
 * 받아와야 실제로 해결된다. 그래서 이 패턴이면 "다시 시도" 대신
 * "새로고침"으로 안내하고 버튼도 진짜 새로고침을 하게 한다.
 */
const STALE_BUILD_PATTERN =
  /ChunkLoadError|Loading chunk|Minified React error|Failed to find Server Action/i;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isStaleBuild = STALE_BUILD_PATTERN.test(error.message ?? "");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-lg font-semibold text-slate-900">
        문제가 발생했습니다
      </h1>
      <p className="text-sm text-slate-600">
        {isStaleBuild
          ? "프로그램이 새 버전으로 업데이트된 뒤라, 지금 열려 있는 화면이 이전 버전을 그대로 들고 있는 상태로 보입니다. 새로고침하면 해결됩니다."
          : error.message || "알 수 없는 오류가 발생했습니다."}
      </p>
      <button
        onClick={() => (isStaleBuild ? window.location.reload() : reset())}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {isStaleBuild ? "새로고침" : "다시 시도"}
      </button>
    </div>
  );
}
