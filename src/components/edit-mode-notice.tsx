import Link from "next/link";

/**
 * 편집 세션(과 파일 체크아웃)이 없는 "모니터링 모드"에서 입력 폼 대신
 * 보여주는 안내. 모니터링 모드에서 폼을 그대로 보여주면 제출 시
 * requireActiveEditSession()이 던지는 에러로 화면이 깨지므로, 애초에
 * 입력칸 자체를 감추고 이 안내로 대체한다.
 */
export function EditModeNotice({ message }: { message?: string }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
      {message ?? "편집을 원하시면"}{" "}
      <Link
        href="/select-division"
        className="font-medium text-blue-600 hover:underline"
      >
        편집 시작
      </Link>
      을 눌러주세요.
    </p>
  );
}
