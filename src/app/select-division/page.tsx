import { auth } from "@/auth";
import { orgDb, getActiveContextInfo } from "@/lib/db";
import { editableDivisionKeysFor } from "@/lib/org-access";
import { getNasStore } from "@/lib/app-config";
import { DEPT_COMMON_KEY } from "@/lib/work-order-tree";
import { BackToDashboard } from "@/components/back-to-dashboard";
import { EditSessionForm } from "@/components/edit-session-form";

export default async function SelectDivisionPage() {
  const session = await auth();
  if (!session?.user) return null;

  const allDivisions = await orgDb.division.findMany({
    select: { id: true, name: true, departmentId: true },
    orderBy: { name: "asc" },
  });
  const options = editableDivisionKeysFor(session.user, allDivisions, DEPT_COMMON_KEY);

  const store = getNasStore();
  const lockStatuses = Object.fromEntries(
    options.map((o) => [o.key, store.getLockStatus(o.key)]),
  );

  const current = getActiveContextInfo();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">편집할 과 선택</h1>
      <p className="mt-1 text-sm text-slate-500">
        업무 조회(대시보드, 목록, 상세보기)는 언제든 가능합니다. 상태
        변경·업무 추가·진행률 입력처럼 실제로 내용을 바꾸려면, 먼저 어느 과를
        편집할지 선택해서 그 과의 편집 잠금을 확보해야 합니다. 한 번에 한
        사람만 같은 과를 편집할 수 있습니다.
      </p>

      {current && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          현재 <strong>{current.key}</strong>
          {current.mode === "edit" ? "를 편집 중입니다" : "를 보기 전용으로 열람 중입니다"}
          . 다른 과로 바꾸려면 먼저 저장하거나 취소하세요.
        </div>
      )}

      {options.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          소속된 과가 없어 편집할 수 있는 대상이 없습니다. 관리자에게 문의하세요.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {options.map((o) => {
            const lock = lockStatuses[o.key];
            return (
              <div
                key={o.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{o.label}</p>
                  {lock ? (
                    <p className="mt-0.5 text-xs text-red-500">
                      {lock.holderName}님이 편집 중 (
                      {new Date(lock.acquiredAt).toLocaleString("ko-KR")}부터)
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-400">현재 편집 중인 사람 없음</p>
                  )}
                </div>
                <EditSessionForm divisionKey={o.key} locked={!!lock} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
