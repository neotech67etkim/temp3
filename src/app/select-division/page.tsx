import { auth } from "@/auth";
import { orgDb, getActiveContextInfo } from "@/lib/db";
import { editableDivisionKeysFor } from "@/lib/org-access";
import { getNasStore } from "@/lib/app-config";
import { DEPT_COMMON_KEY } from "@/lib/work-order-tree";
import { BackToDashboard } from "@/components/back-to-dashboard";
import { EditSessionForm } from "@/components/edit-session-form";
import { StartAllEditForm } from "@/components/start-all-edit-form";

export default async function SelectDivisionPage() {
  const session = await auth();
  if (!session?.user) return null;

  const allDivisions = await orgDb.division.findMany({
    select: { id: true, name: true, departmentId: true },
    orderBy: { name: "asc" },
  });
  const options = editableDivisionKeysFor(session.user, allDivisions, DEPT_COMMON_KEY);
  // 편집 가능한 과가 여러 개인 역할(부서장/관리자)은 하나씩 고르지 않고
  // 한 번에 전부 여는 쪽이 훨씬 편하다 - 과가 하나뿐인 과장/팀장/과원은
  // 어차피 "전체"와 "하나"가 같으므로 기존 개별 버튼 방식 그대로 둔다.
  const isMultiScope = options.length > 1;

  const store = getNasStore();
  const lockStatuses = Object.fromEntries(
    options.map((o) => [o.key, store.getLockStatus(o.key)]),
  );

  const current = getActiveContextInfo();
  const isMine = current?.holder.email === session.user.email;
  // 이 프로세스(프로그램)가 이미 다른 사람의 편집 세션으로 차 있으면, 어느
  // 과를 고르든 새로 열 수 없다(활성 상태가 프로세스 전역이라 새로 열면
  // 그 사람의 연결이 끊겨 저장/취소를 못 하게 되어버림).
  const processBlockedByOther = !!current && !isMine && current.mode === "edit";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">편집할 과 선택</h1>
      <p className="mt-1 text-sm text-slate-500">
        업무 조회(대시보드, 목록, 상세보기)는 언제든 가능합니다. 상태
        변경·업무 추가·진행률 입력처럼 실제로 내용을 바꾸려면, 먼저 편집을
        시작해서 편집 잠금을 확보해야 합니다. 한 번에 한 사람만 같은 과를
        편집할 수 있습니다.
      </p>

      {current && isMine && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          현재{" "}
          <strong>
            {current.keys.length === 1
              ? current.keys[0]
              : `${current.keys.join(", ")}(${current.keys.length}개 과)`}
          </strong>
          {current.mode === "edit" ? "를 편집 중입니다" : "를 보기 전용으로 열람 중입니다"}
          . 다른 과를 더 편집하려면 위 &quot;전체 편집 시작&quot;을 다시 눌러
          보시고, 끝내려면 화면 상단의 저장하고 종료/취소를 이용하세요.
        </div>
      )}

      {processBlockedByOther && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          지금 이 프로그램은 <strong>{current!.holder.name}</strong>님이 편집
          중입니다. 그분이 저장하거나 취소해서 편집을 마치기 전까지는 다른
          과를 새로 편집할 수 없습니다.
        </div>
      )}

      {options.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          소속된 과가 없어 편집할 수 있는 대상이 없습니다. 관리자에게 문의하세요.
        </p>
      ) : (
        <>
          {isMultiScope && (
            <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5">
              <div>
                <p className="text-sm font-medium text-slate-800">전체 편집 시작</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  소속된 과 {options.length}개(
                  {options.map((o) => o.label).join(", ")})를 한 번에 편집
                  모드로 엽니다. 이미 다른 사람이 편집 중인 과가 있으면 그
                  과만 제외되고 나머지는 바로 편집할 수 있습니다.
                </p>
              </div>
              <StartAllEditForm disabled={processBlockedByOther} />
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {options.map((o) => {
              const lock = lockStatuses[o.key];
              const stale = lock ? store.isLockStale(lock) : false;
              const heldByMe = isMine && !!current?.keys.includes(o.key);
              // 잠금 파일상 나 자신의 잠금인데(예: 프로그램이 재시작되어 메모리
              // 상태만 사라진 경우) 지금 이 프로세스가 들고 있지 않은 상태.
              // 내 것이므로 기다릴 필요 없이 바로 이어받을 수 있어야 한다.
              const isMyOtherLock = !!lock && lock.holderEmail === session.user.email && !heldByMe;
              const unavailable =
                !heldByMe &&
                !isMyOtherLock &&
                (processBlockedByOther || (!!lock && !stale));
              return (
                <div
                  key={o.key}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {o.label}
                      {heldByMe && (
                        <span className="ml-2 text-xs font-normal text-blue-600">
                          편집 중(나)
                        </span>
                      )}
                    </p>
                    {lock ? (
                      isMyOtherLock ? (
                        <p className="mt-0.5 text-xs text-blue-500">
                          내가 이전에 편집을 시작해둔 상태입니다. 바로 이어서 편집할 수 있습니다.
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-red-500">
                          {lock.holderName}님이 {stale ? "오래 전 편집 시작(응답 없음)" : "편집 중"} (
                          {new Date(lock.acquiredAt).toLocaleString("ko-KR")}부터)
                        </p>
                      )
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-400">현재 편집 중인 사람 없음</p>
                    )}
                  </div>
                  {isMultiScope ? (
                    heldByMe ? (
                      <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600">
                        편집 중
                      </span>
                    ) : unavailable ? (
                      <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400">
                        편집불가
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400">
                        편집 가능
                      </span>
                    )
                  ) : (
                    <EditSessionForm
                      divisionKey={o.key}
                      locked={!!lock}
                      isMyLock={isMyOtherLock}
                      unavailable={unavailable}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
